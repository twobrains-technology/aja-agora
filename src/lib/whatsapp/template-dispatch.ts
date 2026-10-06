/**
 * Resolução de envio de confirmação por JANELA (FIX-201).
 *
 * Camada única que decide COMO uma mensagem business-initiated sai pro cliente,
 * sem nenhuma etapa manual do operador:
 *
 *   1. Janela de 24h ABERTA  → texto livre rico (executa o `freeTextFallback` do
 *      caller — a copy atual, intacta). Melhor UX, sem custo de template.
 *   2. Janela FECHADA + template `APPROVED` (por `usageKey`) → envia o template
 *      Meta (`sendTemplate`) com os placeholders mapeados de `params`. Quando a
 *      lista tem mais de uma candidata (fase × bem), vale a PRIMEIRA aprovada.
 *   3. Janela FECHADA + template não aprovado (ou nem cadastrado) → enfileira em
 *      `whatsappOutboundQueue` (status `pending`) + alerta admin. Ao template
 *      virar `APPROVED` (webhook/poll), `flushOutboundQueue` esvazia a fila.
 *
 * Nada se perde em nenhum caminho (spec §Norte item 6). O vínculo uso↔template é
 * por CHAVE LÓGICA (`usageKey`, ex `confirmacao_contratacao`) gerida no admin — o
 * código nunca hardcoda o nome do template Meta.
 *
 * Ver docs/design/specs/2026-07-02-whatsapp-templates-meta-design.md.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { whatsappOutboundQueue, whatsappTemplates } from "@/db/schema";
import { sendTemplate } from "./api";
import { isSimulatedWaId } from "./simulator-bus";
import { isWindowOpen } from "./window";

export interface ResolveAndSendArgs {
	/** Destino E.164 sem '+' (ex `5562999998888`). */
	to: string;
	/** Conversa cujo `lastInboundAt` define a janela de 24h (chave do `isWindowOpen`). */
	conversationId: string;
	/** Chave lógica única do ponto de disparo (ex `confirmacao_contratacao`). */
	usageKey?: string;
	/**
	 * A LISTA ORDENADA de chaves candidatas — fase × bem, com o genérico da fase
	 * como fallback (FIX-388). Tem precedência sobre `usageKey`; um chamador antigo
	 * pode continuar passando a chave única. Nunca as duas vazias.
	 */
	usageKeys?: readonly string[];
	/** Valores dos placeholders do template (`{ body: [...], header?: [...] }`). */
	params?: Record<string, unknown>;
	/**
	 * O canal da conversa. A web NUNCA sai por texto livre (FIX-441): o
	 * `freeTextFallback` dela roda o turno no chat do site, que ninguém está
	 * olhando, e a cota é consumida. Mesmo com a janela de 24 h aberta (a
	 * conversa da web pode ter `last_inbound_at` depois de virar lead), a web
	 * vai por template. Ausente = WhatsApp (comportamento de sempre).
	 */
	channel?: "web" | "whatsapp";
	/** Copy rica atual — executada quando a janela está ABERTA. */
	freeTextFallback: () => Promise<void> | void;
}

export type ResolveAndSendResult =
	| { channel: "free_text" }
	| {
			channel: "template";
			usageKey: string;
			/** Nome do template na Meta — para gravar no histórico a mensagem que saiu. */
			metaName?: string;
			/** Corpo denormalizado do template — o texto que o cliente leu. */
			bodyPreview?: string | null;
			/** `wamid` quando a Meta ACEITOU o envio; ausente quando falhou. */
			messageId?: string;
			/** O corpo do erro da Meta quando o envio NÃO saiu (FIX-441/D12). */
			error?: string;
			/**
			 * O envio estourou o timeout DEPOIS de a requisição sair (FIX-441/C15b).
			 * É o único desfecho ambíguo: a Meta pode ter entregue. Sobe do `callApi`
			 * para o ciclo não tratar timeout como “não saiu”.
			 */
			timeout?: boolean;
	  }
	| { channel: "queued"; usageKey: string; queueId: string };

/** O que fazer com a lista: usar a primeira aprovada, ou enfileirar a primeira. */
export type EscolhaDeChave =
	| { canal: "aprovado"; usageKey: string }
	| { canal: "enfileirar"; usageKey: string };

/**
 * Percorre a lista ORDENADA e devolve a decisão — PURA, sem banco.
 *
 * A primeira chave `APPROVED` vence; sem nenhuma, a linha é ENFILEIRADA com a
 * primeira candidata (a mais específica) e o alerta sobe — nunca o silêncio. A
 * pergunta "o template existe/aprovado?" é do dispatcher, e chega aqui pelo
 * `statusDe` — é o que mantém a função do motor pura (regra dura do PRD).
 */
export function escolherChave(
	candidatas: readonly string[],
	statusDe: (usageKey: string) => string | null,
): EscolhaDeChave {
	if (candidatas.length === 0) {
		throw new Error("escolherChave exige uma lista de chaves candidatas não vazia");
	}
	for (const usageKey of candidatas) {
		if (statusDe(usageKey) === "APPROVED") return { canal: "aprovado", usageKey };
	}
	return { canal: "enfileirar", usageKey: candidatas[0] };
}

/**
 * Constrói o array `components` que a Cloud API espera no ENVIO de um template a
 * partir de `params`. Convenção: `params.header`/`params.body` são arrays de
 * valores dos placeholders, na ordem (`{{1}}`, `{{2}}`, ...). Sem params → undefined
 * (template sem variáveis).
 */
export function componentsFromParams(params?: Record<string, unknown>): unknown[] | undefined {
	if (!params) return undefined;
	const components: unknown[] = [];
	const header = params.header;
	if (Array.isArray(header) && header.length > 0) {
		components.push({
			type: "header",
			parameters: header.map((v) => ({ type: "text", text: String(v) })),
		});
	}
	const body = params.body;
	if (Array.isArray(body) && body.length > 0) {
		components.push({
			type: "body",
			parameters: body.map((v) => ({ type: "text", text: String(v) })),
		});
	}
	return components.length > 0 ? components : undefined;
}

/**
 * Alerta a mesa que uma confirmação ficou pendente de template aprovado. Não há
 * canal de alerta genérico da mesa hoje (só notificação a atendentes no handoff),
 * então usamos um log estruturado claro — mesmo padrão de observabilidade do
 * `contract-summary.ts`. Substituível por um canal dedicado quando existir.
 */
function alertAdminTemplatePending(info: {
	usageKey: string;
	to: string;
	queueId: string;
	templateStatus: string | null;
}): void {
	console.warn(
		JSON.stringify({
			level: "warn",
			source: "template-dispatch",
			event: "outbound_queued_pending_template",
			...info,
		}),
	);
}

/** Exportado pro broadcast da mesa (mesa/notify.ts): o atendente precisa do
 * MESMO mecanismo de template que o cliente, e a resolução por `usageKey` é
 * fonte única. */
export async function findTemplateByUsageKey(usageKey: string) {
	const [row] = await db
		.select()
		.from(whatsappTemplates)
		.where(eq(whatsappTemplates.usageKey, usageKey))
		.limit(1);
	return row ?? null;
}

async function enqueue(
	to: string,
	usageKey: string,
	params: Record<string, unknown> | undefined,
	templateStatus: string | null,
): Promise<string> {
	const [row] = await db
		.insert(whatsappOutboundQueue)
		.values({ to, usageKey, params: params ?? null })
		.returning({ id: whatsappOutboundQueue.id });
	alertAdminTemplatePending({ usageKey, to, queueId: row.id, templateStatus });
	return row.id;
}

export async function resolveAndSend(args: ResolveAndSendArgs): Promise<ResolveAndSendResult> {
	const { to, conversationId, params, freeTextFallback } = args;
	const candidatas = args.usageKeys?.length
		? [...args.usageKeys]
		: args.usageKey
			? [args.usageKey]
			: [];
	if (candidatas.length === 0) {
		throw new Error("resolveAndSend exige `usageKey` ou `usageKeys`");
	}

	// Simulador (SIM-<uuid>): a saída é interceptada pelo simulator-bus, NUNCA vai
	// pra Meta — então a regra de janela 24h / template não se aplica. Sem isto, o
	// simulador (que não chama updateLastInboundAt → lastInboundAt null → janela
	// sempre "fechada") enfileirava o Passo 5.2 como template e o QA nunca via o
	// fechamento (assinatura/documento/Parabéns). Bug QA 2026-07-03.
	if (isSimulatedWaId(to)) {
		await freeTextFallback();
		return { channel: "free_text" };
	}

	const { open } = args.channel === "web" ? { open: false } : await isWindowOpen(conversationId);
	if (open) {
		await freeTextFallback();
		return { channel: "free_text" };
	}

	// Janela fechada: o template é a única saída. Se alguma candidata ainda consta
	// em análise, pergunta à Meta antes de desistir — a aprovação pode ter saído e o
	// webhook ter se perdido. Import dinâmico porque template-sync depende deste
	// módulo (flushOutboundQueue) e o ciclo estático quebraria o bundle.
	const { reconciliarSePendente } = await import("./template-sync");
	const templates = new Map<string, Awaited<ReturnType<typeof findTemplateByUsageKey>>>();
	for (const usageKey of candidatas) {
		await reconciliarSePendente(usageKey);
		templates.set(usageKey, await findTemplateByUsageKey(usageKey));
	}

	const escolha = escolherChave(candidatas, (usageKey) => templates.get(usageKey)?.status ?? null);
	const escolhido = templates.get(escolha.usageKey);

	if (escolha.canal === "aprovado" && escolhido) {
		const result = await sendTemplate(
			to,
			escolhido.metaName,
			escolhido.language,
			componentsFromParams(params),
		);
		// O resultado sobe INTEIRO: quem chamou precisa saber se a Meta aceitou
		// (tem `messageId`) ou recusou (tem `error`) — é o que a régua usa para
		// compensar o carimbo quando o envio não saiu (FIX-441/D12).
		const messageId = (result as { messageId?: string })?.messageId;
		const error = (result as { error?: string })?.error;
		const timeout = (result as { timeout?: boolean })?.timeout === true;
		return {
			channel: "template",
			usageKey: escolha.usageKey,
			metaName: escolhido.metaName,
			bodyPreview: escolhido.bodyPreview ?? null,
			...(messageId ? { messageId } : {}),
			...(error ? { error } : {}),
			...(timeout ? { timeout: true } : {}),
		};
	}

	const queueId = await enqueue(to, escolha.usageKey, params, escolhido?.status ?? null);
	return { channel: "queued", usageKey: escolha.usageKey, queueId };
}

/**
 * Esvazia a fila de pendentes de um `usageKey` — chamado quando o template daquela
 * chave vira `APPROVED` (webhook/poll). Envia cada `pending` via `sendTemplate`:
 *   - sucesso → marca `sent` + `sentAt`;
 *   - falha   → incrementa `attempts` + guarda `lastError`, MANTÉM `pending`
 *     (nunca marca `sent` sem sucesso; retry no próximo poll/aprovação).
 *
 * Idempotente: opera só sobre linhas `pending`, então rodar 2x não reenvia as já
 * `sent`. Sem template aprovado, não há o que flushar (retorna zero).
 */
export async function flushOutboundQueue(
	usageKey: string,
): Promise<{ sent: number; failed: number }> {
	const template = await findTemplateByUsageKey(usageKey);
	if (!template || template.status !== "APPROVED") return { sent: 0, failed: 0 };

	const pending = await db
		.select()
		.from(whatsappOutboundQueue)
		.where(
			and(
				eq(whatsappOutboundQueue.usageKey, usageKey),
				eq(whatsappOutboundQueue.status, "pending"),
			),
		);

	let sent = 0;
	let failed = 0;
	for (const row of pending) {
		try {
			const result = await sendTemplate(
				row.to,
				template.metaName,
				template.language,
				componentsFromParams(row.params ?? undefined),
			);
			const err = (result as { error?: string })?.error;
			const messageId = (result as { messageId?: string })?.messageId;
			if (err || !messageId) {
				failed++;
				await db
					.update(whatsappOutboundQueue)
					.set({ attempts: row.attempts + 1, lastError: err ?? "no messageId returned" })
					.where(eq(whatsappOutboundQueue.id, row.id));
			} else {
				sent++;
				await db
					.update(whatsappOutboundQueue)
					.set({ status: "sent", sentAt: new Date() })
					.where(eq(whatsappOutboundQueue.id, row.id));
			}
		} catch (e) {
			failed++;
			await db
				.update(whatsappOutboundQueue)
				.set({
					attempts: row.attempts + 1,
					lastError: e instanceof Error ? e.message : String(e),
				})
				.where(eq(whatsappOutboundQueue.id, row.id));
		}
	}
	return { sent, failed };
}
