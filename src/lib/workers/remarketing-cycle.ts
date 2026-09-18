/**
 * O CICLO da régua de remarketing — quem lê a tabela, decide e envia.
 *
 * Fonte: `Remarketing_WhatsApp_V3.pdf`. O bloco 1 entregou a memória
 * (`remarketing_touches`) e a decisão pura (`lib/remarketing/regua.ts`); o motor
 * puro (`lib/remarketing/motor.ts`) decide COMO entregar. Falta quem EXECUTE, e
 * é este arquivo.
 *
 * ── Por que no worker, e não no app ─────────────────────────────────────────
 *
 * O deploy tem DUAS réplicas no ECS. Um `setInterval` no app dispararia duas
 * vezes — e mensagem duplicada no WhatsApp é irreversível. O ciclo roda no
 * serviço `aja-agora-worker` (entrypoint `scripts/proposal-worker.ts`), no
 * MESMO padrão do `gate-reengage-poll`: job repetível do BullMQ com `jobId`
 * FIXO a cada 30 s. É o `jobId` fixo que garante uma cópia por vez, persistida
 * no Redis — vale entre reinícios e entre instâncias.
 *
 * ── A ordem, que é a defesa contra duplicidade ──────────────────────────────
 *
 * 1. lê os `ATIVO` com `next_touch_at <= agora` (índice PARCIAL do bloco 1);
 * 2. monta o estado e chama o motor puro;
 * 3. **grava o contador/timestamp ANTES do envio** — se o processo morrer no
 *    meio, a cota já subiu e o toque não sai de novo. Perder um toque é barato;
 *    mandar duas vezes não é;
 * 4. executa o efeito (turno de retomada com arte, ou template aprovado);
 * 5. no MESMO tick, `despacharConversoesPendentes()` — ver o comentário no fim.
 *
 * ── A cota de 30 dias ──────────────────────────────────────────────────────
 *
 * `remarketing_touches` guarda o INSTANTE do último toque em `ultimo_toque_em`
 * (coluna da rodada 2), gravado no MESMO `UPDATE` do toque. Antes disso o ciclo
 * derivava esse instante de `next_touch_at − intervalo(step)`, o que quebrava
 * quando a cadência era reajustada; a derivação ficou só como fallback de linha
 * antiga (ver `motor.ts`). A simulação mais recente continua vindo de
 * `bevi_proposals` — a proposta É o fato, de propósito.
 */

import type { ConnectionOptions } from "bullmq";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { beviProposals, remarketingTouches } from "@/db/schema";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { metaOf, persistMeta } from "@/lib/conversation/meta";
import { despacharConversoesPendentes } from "@/lib/conversions/dispatch";
import {
	type DecisaoDoMotor,
	decidir,
	ehTelefoneInterno,
	montarEstado,
	type ObjetivoDoToque,
	toquesReconstruidos,
	ultimoToqueDerivado,
} from "@/lib/remarketing/motor";
import { ESPERA_SILENCIO_MS, type EstadoRegua } from "@/lib/remarketing/regua";
import { buildRetomadaDirective, podeRetomar } from "./retomada";

// ─── Tipos ──────────────────────────────────────────────────────────────────

/** Uma linha vencida da régua, já com conversa e contato. */
export interface LinhaDaRegua {
	conversationId: string;
	contactId: string;
	objetivo: string;
	step: number;
	status: EstadoRegua["status"];
	nextTouchAt: Date | null;
	/** `ultimo_toque_em` — o instante real do último toque (fonte da cota). */
	ultimoToqueEm: Date | null;
	touches30d: number;
	motivoSaida: string | null;
	channel: "web" | "whatsapp";
	waId: string | null;
	metadata: unknown;
	lastInboundAt: Date | null;
	phone: string | null;
	nome: string | null;
	optoutDaPessoaEm: Date | null;
}

export interface RemarketingDeps {
	agora?: Date;
	/** Entrada na régua: cria a linha de quem ficou em silêncio e ainda não tem. */
	entrarNaRegua?: (agora: Date) => Promise<number>;
	listarVencidas?: (agora: Date) => Promise<LinhaDaRegua[]>;
	/** Instantes dos toques da PESSOA na janela do teto (todas as campanhas). */
	toquesDoContato?: (contactId: string, agora: Date) => Promise<Date[]>;
	/** Instante da simulação mais recente do contato — reentrada. */
	simulacaoDoContato?: (contactId: string) => Promise<Date | null>;
	/** GRAVA o próximo estado. Chamada ANTES de qualquer envio. */
	gravarEstado?: (args: {
		conversationId: string;
		estado: EstadoRegua;
		touches30d: number;
		agora: Date;
	}) => Promise<void>;
	/** Conta a retomada no metadata (MAX_RETOMADAS). Antes do envio. */
	gravarRetomada?: (args: {
		conversationId: string;
		meta: ConversationMetadata;
		agora: Date;
	}) => Promise<void>;
	dispararTurno?: (args: {
		conversationId: string;
		channel: "web" | "whatsapp";
		waId: string | null;
		directive: string;
	}) => Promise<void>;
	enviarArte?: (args: { to: string; link: string }) => Promise<void>;
	enviarTemplate?: (args: {
		to: string;
		conversationId: string;
		usageKey: string;
		freeTextFallback: () => Promise<void>;
	}) => Promise<void>;
	/** O telefone é de atendente ATIVO no banco? (além da lista em código) */
	telefoneDaEquipe?: (telefone: string) => Promise<boolean>;
	despacharConversoes?: () => Promise<unknown>;
}

export interface ResultadoCiclo {
	/** Linhas que entraram na régua neste ciclo. */
	entradas: number;
	/** Toques efetivamente disparados. */
	disparados: number;
	/** Linhas lidas e não disparadas, por motivo. */
	nada: Record<string, number>;
	/** O que o CAPI devolveu (ou o motivo de não ter tentado). */
	conversoes?: unknown;
}

/**
 * Env numérica, com default. **Vazio NÃO é zero.**
 *
 * O `.env.example` publica as chaves vazias (é assim que se liga uma capacidade:
 * ausente-desligado), e `Number("")` é `0` — que em `LIMIT` não é "sem limite",
 * é **nenhuma linha**, e no BullMQ é `repeat.every: 0`, um job em laço. Enquanto
 * isto era `?? padrao`, um ambiente com a variável publicada e vazia tinha
 * `LIMITE_POR_CICLO = 0`: a régua não disparava nada e não havia erro em lugar
 * nenhum. Exportada para o teste provar o caso "vazio", que é o default do
 * `.env.example` e o que o `.env.local` do worktree traz.
 */
export function inteiroDaEnv(valor: string | undefined, padrao: number): number {
	const n = Number(valor);
	return Number.isFinite(n) && n > 0 ? Math.trunc(n) : padrao;
}

// ─── Limites ────────────────────────────────────────────────────────────────

const LIMITE_POR_CICLO = inteiroDaEnv(process.env.REMARKETING_POR_CICLO, 50);
const ENTRADAS_POR_CICLO = inteiroDaEnv(process.env.REMARKETING_ENTRADAS_POR_CICLO, 20);

/**
 * Chave operacional da régua: sem ela, o ciclo **não inscreve ninguém e não
 * dispara toque nenhum**. Default DESLIGADO, de propósito.
 *
 * O motivo é medido, não teórico: a entrada só exige conversa parada há mais de
 * 90 min (teto de 7 dias), então o **primeiro ciclo depois de um deploy** num
 * ambiente novo inscreve 20 conversas e, minutos depois, manda WhatsApp de
 * verdade para elas. Ninguém deveria descobrir isso pelo cliente recebendo
 * mensagem — quem liga a régua é o dono, por variável de ambiente, depois de
 * templates aprovados e do "sim" sobre LGPD.
 *
 * Ligue com `REMARKETING_ATIVO=1` (aceita `true`/`sim`).
 *
 * O que **continua** rodando com a chave desligada é o despacho de conversões
 * do CAPI no fim do ciclo (`despacharConversoesPendentes`): ele não é da régua
 * e, sem este tick, os eventos ficavam `pending` para sempre
 * (`lead-transitions.ts:78` era o único chamador). Ver `runRemarketingCycle`.
 */
export function reguaLigada(env: Record<string, string | undefined> = process.env): boolean {
	const valor = (env.REMARKETING_ATIVO ?? "").trim().toLowerCase();
	return valor === "1" || valor === "true" || valor === "sim";
}

/** Janela de entrada: conversa parada há mais de 90 min, mas não antiga demais.
 * Sem o teto de 7 dias, o primeiro ciclo depois do deploy varreria o histórico
 * e dispararia em todo mundo de uma vez. */
const JANELA_DE_ENTRADA_MS = 7 * 24 * 60 * 60 * 1000;

/** Minutos de silêncio que o directive da retomada cita. */
const SILENCIO_MINUTOS = Math.round(ESPERA_SILENCIO_MS / 60_000);

// ─── Consultas (default) ────────────────────────────────────────────────────

function linhasDeExecucao(resultado: unknown): Array<Record<string, unknown>> {
	const rows = Array.isArray(resultado)
		? resultado
		: ((resultado as { rows?: unknown[] })?.rows ?? []);
	return rows as Array<Record<string, unknown>>;
}

/**
 * As linhas ATIVAS já vencidas. É a ÚNICA consulta do ciclo a cada 30 s, e ela
 * usa o índice PARCIAL `remarketing_touches_ativos_idx (status, next_touch_at)
 * WHERE status = 'ATIVO'` criado no bloco 1 — varrer de outro jeito varre
 * também todo o histórico encerrado (opt-out, esgotado, convertido), que é a
 * maior parte da tabela.
 */
export async function listarVencidas(agora: Date): Promise<LinhaDaRegua[]> {
	const linhas = linhasDeExecucao(
		await db.execute(sql`
			SELECT t.conversation_id AS "conversationId", t.contact_id AS "contactId",
			       t.objetivo, t.step, t.status, t.next_touch_at AS "nextTouchAt",
			       t.ultimo_toque_em AS "ultimoToqueEm",
			       t.touches_30d AS "touches30d", t.motivo_saida AS "motivoSaida",
			       c.channel, c.wa_id AS "waId", c.metadata,
			       c.last_inbound_at AS "lastInboundAt",
			       ct.phone, ct.name AS "nome",
			       ct.remarketing_optout_at AS "optoutDaPessoaEm"
			FROM remarketing_touches t
			JOIN conversations c ON c.id = t.conversation_id
			JOIN contacts ct ON ct.id = t.contact_id
			WHERE t.status = 'ATIVO'
			  AND t.next_touch_at IS NOT NULL
			  AND t.next_touch_at <= ${agora.toISOString()}::timestamptz
			ORDER BY t.next_touch_at ASC
			LIMIT ${LIMITE_POR_CICLO}
		`),
	);
	return linhas.map((l) => ({
		conversationId: String(l.conversationId),
		contactId: String(l.contactId),
		objetivo: String(l.objetivo),
		step: Number(l.step),
		status: String(l.status) as EstadoRegua["status"],
		nextTouchAt: l.nextTouchAt ? new Date(l.nextTouchAt as string) : null,
		ultimoToqueEm: l.ultimoToqueEm ? new Date(l.ultimoToqueEm as string) : null,
		touches30d: Number(l.touches30d ?? 0),
		motivoSaida: (l.motivoSaida as string | null) ?? null,
		channel: (l.channel as "web" | "whatsapp") ?? "whatsapp",
		waId: (l.waId as string | null) ?? null,
		metadata: l.metadata,
		lastInboundAt: l.lastInboundAt ? new Date(l.lastInboundAt as string) : null,
		phone: (l.phone as string | null) ?? null,
		nome: (l.nome as string | null) ?? null,
		optoutDaPessoaEm: l.optoutDaPessoaEm ? new Date(l.optoutDaPessoaEm as string) : null,
	}));
}

/**
 * Os instantes dos toques da PESSOA — somando todas as conversas/campanhas. É a
 * base do teto de 30 dias (global).
 *
 * A fonte é `ultimo_toque_em` (o instante real do último toque de cada linha).
 * O histórico em si continua sendo reconstruído por `toquesReconstruidos` — a
 * tabela guarda só o último instante —, mas a partir de um dado REAL. Linha
 * antiga sem a coluna cai no `ultimoToqueDerivado` (fallback) e, se terminal,
 * no `updated_at` (o instante em que ela foi escrita).
 */
export async function toquesDoContato(contactId: string, _agora: Date): Promise<Date[]> {
	const linhas = linhasDeExecucao(
		await db.execute(sql`
			SELECT step, touches_30d AS "touches30d", status,
			       next_touch_at AS "nextTouchAt", ultimo_toque_em AS "ultimoToqueEm",
			       updated_at AS "updatedAt"
			FROM remarketing_touches
			WHERE contact_id = ${contactId}::uuid
		`),
	);

	const instantes: Date[] = [];
	for (const l of linhas) {
		const nextTouchAt = l.nextTouchAt ? new Date(l.nextTouchAt as string) : null;
		const daColuna = l.ultimoToqueEm
			? new Date(l.ultimoToqueEm as string)
			: ultimoToqueDerivado({ step: Number(l.step), nextTouchAt });
		// Linha terminal (esgotada) perdeu o `next_touch_at`; o último toque dela
		// foi o instante em que ela foi escrita.
		const ultimo =
			daColuna ??
			(String(l.status) === "ATIVO" ? null : l.updatedAt ? new Date(l.updatedAt as string) : null);
		instantes.push(
			...toquesReconstruidos({
				step: Number(l.step),
				touches30d: Number(l.touches30d ?? 0),
				ultimoToqueEm: ultimo,
			}),
		);
	}
	return instantes;
}

/**
 * A simulação mais recente do contato — o que reabre a régua depois de morta
 * (`houveNovaSimulacao`).
 *
 * NÃO há coluna própria, e é DE PROPÓSITO (decisão do líder, rodada 2): a
 * simulação É um fato da Bevi, e `bevi_proposals` é a fonte dela. Guardar uma
 * segunda cópia numa coluna criaria dois lugares para a mesma verdade
 * divergirem — a coluna ficaria velha na primeira vez que a Bevi mudasse sem
 * nós. A proposta é a verdade; aqui só a lemos.
 */
export async function simulacaoDoContato(contactId: string): Promise<Date | null> {
	const [linha] = await db
		.select({ em: beviProposals.createdAt })
		.from(beviProposals)
		.where(eq(beviProposals.contactId, contactId))
		.orderBy(desc(beviProposals.createdAt))
		.limit(1);
	return linha?.em ?? null;
}

/**
 * ENTRADA NA RÉGUA: quem conversou e ficou em silêncio, e ainda não tem linha.
 *
 * O ciclo só LÊ linhas ATIVAS; sem este passo ninguém nunca entra e o motor é
 * código morto. A entrada é criada 90 min depois do último inbound (o mesmo
 * silêncio do toque 01). Guardas: canal WhatsApp, não simulada, conversa ativa
 * (não `handed_off`/`closed`), com contato resolvido (a linha exige `contact_id`
 * — sem contato não há como contar o teto de 30 dias), dentro dos 7 dias e
 * telefone não-interno. O teto real (3/30 dias) continua valendo no disparo.
 */
export async function entrarNaRegua(agora: Date): Promise<number> {
	const linhas = linhasDeExecucao(
		await db.execute(sql`
			SELECT c.id AS "conversationId", c.contact_id AS "contactId",
			       c.wa_id AS "waId", c.metadata, c.last_inbound_at AS "lastInboundAt"
			FROM conversations c
			WHERE c.channel = 'whatsapp'
			  AND c.status = 'active'
			  AND c.is_simulated = false
			  AND c.contact_id IS NOT NULL
			  AND c.last_inbound_at IS NOT NULL
			  AND c.last_inbound_at <= ${new Date(agora.getTime() - ESPERA_SILENCIO_MS).toISOString()}::timestamptz
			  AND c.last_inbound_at > ${new Date(agora.getTime() - JANELA_DE_ENTRADA_MS).toISOString()}::timestamptz
			  AND NOT EXISTS (
			        SELECT 1 FROM remarketing_touches t WHERE t.conversation_id = c.id
			      )
			ORDER BY c.last_inbound_at DESC
			LIMIT ${ENTRADAS_POR_CICLO}
		`),
	);

	let entradas = 0;
	for (const l of linhas) {
		const waId = (l.waId as string | null) ?? null;
		try {
			if (await ehDaEquipe(waId)) continue;
			const ultimoInbound = new Date(l.lastInboundAt as string);
			await db
				.insert(remarketingTouches)
				.values({
					conversationId: String(l.conversationId),
					contactId: String(l.contactId),
					objetivo: objetivoDoMetadata(l.metadata),
					step: 0,
					status: "ATIVO",
					nextTouchAt: new Date(ultimoInbound.getTime() + ESPERA_SILENCIO_MS),
					touches30d: 0,
				})
				.onConflictDoNothing({ target: remarketingTouches.conversationId });
			entradas += 1;
		} catch (err) {
			console.error(
				JSON.stringify({
					level: "error",
					source: "remarketing-cycle",
					etapa: "entrada-na-regua",
					conversation_id: l.conversationId,
					error: err instanceof Error ? err.message : String(err),
				}),
			);
		}
	}
	return entradas;
}

function objetivoDoMetadata(metadata: unknown): ObjetivoDoToque {
	const categoria = (metadata as { currentCategory?: string } | null)?.currentCategory;
	return categoria === "imovel" || categoria === "moto" ? categoria : "carro";
}

/** O telefone é da equipe? Lista em código + atendentes ativos do banco. Falha
 * do banco NÃO libera: na dúvida, trata como equipe (não manda). */
async function ehDaEquipe(telefone: string | null): Promise<boolean> {
	if (!telefone) return false;
	if (ehTelefoneInterno(telefone)) return true;
	try {
		const [{ isAttendantPhone }, { isMesaAttendantPhone }] = await Promise.all([
			import("@/lib/whatsapp/proxy"),
			import("@/lib/whatsapp/mesa/routing"),
		]);
		return (await isAttendantPhone(telefone)) || (await isMesaAttendantPhone(telefone));
	} catch {
		return true;
	}
}

// ─── Efeitos (default) ──────────────────────────────────────────────────────

/**
 * GRAVA o próximo estado da linha — e é aqui que `ultimo_toque_em` sobe junto
 * com o toque, num ÚNICO `UPDATE`, ANTES do envio (ver o passo 3 no topo).
 */
async function gravarEstado({
	conversationId,
	estado,
	touches30d,
}: {
	conversationId: string;
	estado: EstadoRegua;
	touches30d: number;
	agora: Date;
}): Promise<void> {
	await db
		.update(remarketingTouches)
		.set({
			status: estado.status,
			step: estado.step,
			nextTouchAt: estado.nextTouchAt,
			// O instante do toque que acabou de sair (ou o que já estava, nas
			// escritas terminais) — o mesmo `estado` que o motor registrou.
			ultimoToqueEm: estado.ultimoToqueEm,
			touches30d,
			motivoSaida: estado.motivoSaida,
		})
		.where(eq(remarketingTouches.conversationId, conversationId));
}

async function gravarRetomada({
	conversationId,
	meta,
	agora,
}: {
	conversationId: string;
	meta: ConversationMetadata;
	agora: Date;
}): Promise<void> {
	// Conta a tentativa antes de disparar: turno que morre no meio continua
	// contado, senão o watchdog persegue justamente a conversa que quebra.
	await persistMeta(conversationId, {
		...meta,
		retomada: { attempts: (meta.retomada?.attempts ?? 0) + 1, lastAt: agora.getTime() },
	});
}

const dispararTurnoReal: NonNullable<RemarketingDeps["dispararTurno"]> = async ({
	conversationId,
	channel,
	waId,
	directive,
}) => {
	if (channel === "whatsapp") {
		if (!waId) return;
		const { runDirectiveWithOrchestrator } = await import("@/lib/whatsapp/adapter");
		await runDirectiveWithOrchestrator({ from: waId, conversationId, directive });
		return;
	}
	const { runTurn } = await import("@/lib/agent/orchestrator");
	for await (const _ of runTurn({
		channel: "web",
		conversationId,
		userText: directive,
		isUserTurn: false,
	})) {
		// Drenar é o que faz o turno acontecer.
	}
};

/** URL pública absoluta da arte: a Meta busca o arquivo, então o link precisa
 * ser alcançável de fora — caminho relativo não serve. */
function urlDaArte(caminho: string): string {
	const base =
		process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
		process.env.APP_URL?.trim() ||
		"https://ajaagora.com.br";
	return `${base.replace(/\/$/, "")}${caminho.startsWith("/") ? caminho : `/${caminho}`}`;
}

const enviarArteReal: NonNullable<RemarketingDeps["enviarArte"]> = async ({ to, link }) => {
	const { sendImageMessage } = await import("@/lib/whatsapp/api");
	await sendImageMessage(to, link);
};

/**
 * Entrega por template: delega ao `template-dispatch` (FIX-201), fonte única da
 * resolução janela/template/fila. O `freeTextFallback` NÃO é texto enlatado: se
 * a janela estiver aberta, quem fala é o agente, pelo mesmo turno de retomada.
 *
 * SEM `params` (decisão do líder, rodada 2): o shape dos templates de
 * remarketing ainda não está definido, e mandar `components` para um template
 * sem `{{1}}` faz a Meta recusar o envio. Quando o template tiver placeholder, é
 * uma linha aqui — o `resolveAndSend` já aceita `params`.
 */
const enviarTemplateReal: NonNullable<RemarketingDeps["enviarTemplate"]> = async ({
	to,
	conversationId,
	usageKey,
	freeTextFallback,
}) => {
	const { resolveAndSend } = await import("@/lib/whatsapp/template-dispatch");
	await resolveAndSend({ to, conversationId, usageKey, freeTextFallback });
};

// ─── O ciclo ────────────────────────────────────────────────────────────────

/**
 * Um ciclo da régua. Todas as dependências de I/O entram por parâmetro — é o
 * que permite provar, sem rede e sem banco, a ORDEM "grava antes de enviar".
 */
export async function runRemarketingCycle(deps: RemarketingDeps = {}): Promise<ResultadoCiclo> {
	const agora = deps.agora ?? new Date();
	const entrar = deps.entrarNaRegua ?? entrarNaRegua;
	const listar = deps.listarVencidas ?? listarVencidas;
	const lerToques = deps.toquesDoContato ?? toquesDoContato;
	const lerSimulacao = deps.simulacaoDoContato ?? simulacaoDoContato;
	const gravar = deps.gravarEstado ?? gravarEstado;
	const gravarRet = deps.gravarRetomada ?? gravarRetomada;
	const dispararTurno = deps.dispararTurno ?? dispararTurnoReal;
	const enviarArte = deps.enviarArte ?? enviarArteReal;
	const enviarTemplate = deps.enviarTemplate ?? enviarTemplateReal;
	const telefoneDaEquipe = deps.telefoneDaEquipe ?? ehDaEquipe;
	const despachar = deps.despacharConversoes ?? despacharConversoesPendentes;

	const nada: Record<string, number> = {};
	let disparados = 0;
	let entradas = 0;

	// ── Chave operacional (default desligado) ─────────────────────────────────
	// Desligada, o ciclo NÃO inscreve nem dispara — mas segue despachando o CAPI,
	// que não é da régua e ficaria preso sem este tick.
	if (!reguaLigada()) {
		let conversoesDesligada: unknown;
		try {
			conversoesDesligada = await despachar();
		} catch (err) {
			console.error(
				JSON.stringify({
					level: "error",
					source: "remarketing-cycle",
					etapa: "conversoes",
					error: err instanceof Error ? err.message : String(err),
				}),
			);
		}
		return { entradas: 0, disparados: 0, nada, conversoes: conversoesDesligada };
	}

	try {
		entradas = await entrar(agora);
	} catch (err) {
		console.error(
			JSON.stringify({
				level: "error",
				source: "remarketing-cycle",
				etapa: "entrada",
				error: err instanceof Error ? err.message : String(err),
			}),
		);
	}

	let linhas: LinhaDaRegua[] = [];
	try {
		linhas = await listar(agora);
	} catch (err) {
		console.error(
			JSON.stringify({
				level: "error",
				source: "remarketing-cycle",
				etapa: "leitura",
				error: err instanceof Error ? err.message : String(err),
			}),
		);
	}

	for (const linha of linhas) {
		try {
			const telefone = linha.waId ?? linha.phone ?? null;
			const daEquipe = await telefoneDaEquipe(telefone as string);

			const estado = montarEstado({
				objetivo: linha.objetivo,
				status: linha.status,
				motivoSaida: linha.motivoSaida,
				fatos: {
					step: linha.step,
					nextTouchAt: linha.nextTouchAt,
					ultimoToqueEm: linha.ultimoToqueEm,
					ultimoInboundEm: linha.lastInboundAt,
				},
				toquesNaJanela: await lerToques(linha.contactId, agora),
				simulacaoEm: await lerSimulacao(linha.contactId),
				optoutDaPessoaEm: linha.optoutDaPessoaEm,
			});

			const meta = metaOf({ metadata: linha.metadata });
			const decisao: DecisaoDoMotor = decidir({
				agora,
				estado,
				telefone,
				optoutDaPessoaEm: linha.optoutDaPessoaEm,
				retomadaPermitida: podeRetomar(meta, agora.getTime()),
				telefoneDaEquipe: daEquipe,
			});

			// 3. GRAVA ANTES DE ENVIAR. Se o processo morrer agora, a cota já subiu
			// e o toque não sai de novo — o lado certo de errar.
			if (decisao.proximoEstado) {
				await gravar({
					conversationId: linha.conversationId,
					estado: decisao.proximoEstado,
					touches30d: decisao.touches30d,
					agora,
				});
			}

			if (decisao.acao.tipo === "nada") {
				nada[decisao.acao.motivo] = (nada[decisao.acao.motivo] ?? 0) + 1;
				continue;
			}

			if (!telefone) continue;

			if (decisao.acao.tipo === "turno_de_retomada") {
				await gravarRet({ conversationId: linha.conversationId, meta, agora });
				await dispararTurno({
					conversationId: linha.conversationId,
					channel: linha.channel,
					waId: linha.waId,
					directive: directiveDaRetomada(meta, linha, agora),
				});
				await enviarArte({ to: telefone, link: urlDaArte(decisao.acao.arte) });
				disparados += 1;
				continue;
			}

			await enviarTemplate({
				to: telefone,
				conversationId: linha.conversationId,
				usageKey: decisao.acao.usageKey,
				freeTextFallback: async () => {
					await dispararTurno({
						conversationId: linha.conversationId,
						channel: linha.channel,
						waId: linha.waId,
						directive: directiveDaRetomada(meta, linha, agora),
					});
				},
			});
			disparados += 1;
		} catch (err) {
			console.error(
				JSON.stringify({
					level: "error",
					source: "remarketing-cycle",
					conversation_id: linha.conversationId,
					error: err instanceof Error ? err.message : String(err),
				}),
			);
		}
	}

	// 5. NO MESMO TICK, fecha o buraco do CAPI — e é INTENCIONAL.
	//
	// `despacharConversoesPendentes` só era chamado de `lead-transitions.ts:78`.
	// Como este worker já roda a cada 30 s, os eventos `conversation_started` /
	// `lead` / `offer_viewed` deixam de ficar `pending` para sempre de graça:
	// uma chamada por tick, sem timer novo, sem cron novo. É deliberado que a
	// régua carregue o CAPI aqui — e não o contrário.
	let conversoes: unknown;
	try {
		conversoes = await despachar();
	} catch (err) {
		console.error(
			JSON.stringify({
				level: "error",
				source: "remarketing-cycle",
				etapa: "conversoes",
				error: err instanceof Error ? err.message : String(err),
			}),
		);
	}

	return { entradas, disparados, nada, conversoes };
}

function directiveDaRetomada(meta: ConversationMetadata, linha: LinhaDaRegua, agora: Date): string {
	return buildRetomadaDirective(meta, {
		minutosParado: minutosDeSilencio(linha.lastInboundAt, agora),
		channel: linha.channel,
	});
}

function minutosDeSilencio(ultimoInbound: Date | null, agora: Date): number {
	if (!ultimoInbound) return SILENCIO_MINUTOS;
	return Math.max(1, Math.round((agora.getTime() - ultimoInbound.getTime()) / 60_000));
}

// ─── Wiring BullMQ (só no entrypoint do worker; nunca em teste) ──────────────

const QUEUE_NAME = "remarketing-cycle";

/** O intervalo do polling. 30 s é a ordem de grandeza do silêncio (90 min) e da
 * janela de horário — reagir mais rápido que isso não muda nada. */
const POLL_INTERVAL_MS = inteiroDaEnv(process.env.REMARKETING_POLL_INTERVAL_MS, 30_000);

/**
 * Sobe a fila + worker BullMQ com job repetível. Exige Redis (REDIS_URL) —
 * degrada com log se ausente, mesmo padrão do proposal-status-poll (não derruba
 * o worker de proposta).
 *
 * O `jobId` FIXO é o que garante UMA cópia por vez: o `repeat.every` sozinho
 * criaria um job a cada intervalo, e o BullMQ mantém um job repetível por
 * `jobId`. É por isso que não existe `setInterval` aqui.
 */
export async function startRemarketingWorker() {
	const REDIS_URL = process.env.REDIS_URL;
	if (!REDIS_URL) {
		console.warn(
			"[remarketing-cycle] REDIS_URL ausente — régua de remarketing NÃO iniciada (o resto do worker segue)",
		);
		return null;
	}

	const { Queue, Worker } = await import("bullmq");
	const { default: IORedis } = await import("ioredis");
	const connection = new IORedis(REDIS_URL, {
		maxRetriesPerRequest: null,
	}) as unknown as ConnectionOptions;

	const queue = new Queue(QUEUE_NAME, { connection });
	await queue.add(
		"toque",
		{},
		{
			repeat: { every: POLL_INTERVAL_MS },
			jobId: "remarketing-cycle-cron",
			removeOnComplete: true,
		},
	);

	const worker = new Worker(
		QUEUE_NAME,
		async () => {
			const resultado = await runRemarketingCycle();
			if (resultado.disparados > 0 || resultado.entradas > 0) {
				console.log(`[remarketing-cycle] ciclo: ${JSON.stringify(resultado)}`);
			}
		},
		{ connection },
	);

	console.log(
		`[remarketing-cycle] worker ativo (intervalo ${POLL_INTERVAL_MS}ms)${reguaLigada() ? "" : " — régua DESLIGADA (REMARKETING_ATIVO ausente); só o despacho de conversões roda"}`,
	);
	return { queue, worker };
}
