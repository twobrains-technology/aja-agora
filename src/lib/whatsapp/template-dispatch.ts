/**
 * Resolução de envio de confirmação por JANELA (FIX-201).
 *
 * Camada única que decide COMO uma mensagem business-initiated sai pro cliente,
 * sem nenhuma etapa manual do operador:
 *
 *   1. Janela de 24h ABERTA  → texto livre rico (executa o `freeTextFallback` do
 *      caller — a copy atual, intacta). Melhor UX, sem custo de template.
 *   2. Janela FECHADA + template `APPROVED` (por `usageKey`) → envia o template
 *      Meta (`sendTemplate`) com os placeholders mapeados de `params`.
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
import { isWindowOpen } from "./window";

export interface ResolveAndSendArgs {
	/** Destino E.164 sem '+' (ex `5562999998888`). */
	to: string;
	/** Conversa cujo `lastInboundAt` define a janela de 24h (chave do `isWindowOpen`). */
	conversationId: string;
	/** Chave lógica do ponto de disparo (ex `confirmacao_contratacao`). */
	usageKey: string;
	/** Valores dos placeholders do template (`{ body: [...], header?: [...] }`). */
	params?: Record<string, unknown>;
	/** Copy rica atual — executada quando a janela está ABERTA. */
	freeTextFallback: () => Promise<void> | void;
}

export type ResolveAndSendResult =
	| { channel: "free_text" }
	| { channel: "template"; messageId?: string }
	| { channel: "queued"; queueId: string };

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

async function findTemplateByUsageKey(usageKey: string) {
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
	const { to, conversationId, usageKey, params, freeTextFallback } = args;

	const { open } = await isWindowOpen(conversationId);
	if (open) {
		await freeTextFallback();
		return { channel: "free_text" };
	}

	const template = await findTemplateByUsageKey(usageKey);
	if (template && template.status === "APPROVED") {
		const result = await sendTemplate(
			to,
			template.metaName,
			template.language,
			componentsFromParams(params),
		);
		return { channel: "template", messageId: (result as { messageId?: string })?.messageId };
	}

	const queueId = await enqueue(to, usageKey, params, template?.status ?? null);
	return { channel: "queued", queueId };
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
