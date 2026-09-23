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
 *
 * ── A chave nasceu DESLIGADA, e isto aqui é o registro ──────────────────────
 *
 * 18/09/2026, 11:47 (Brasília): a `REMARKETING_ATIVO` entrou no secret de
 * produção, o serviço foi reiniciado e o primeiro ciclo — 33 segundos depois —
 * inscreveu 6 conversas e disparou toque real para as 6. **A régua nunca havia
 * rodado em produção antes disso**: as 6 linhas nasceram no mesmo minuto, e a
 * versão anterior do secret não tinha a chave (diagnóstico §d). Leia isto antes
 * de interpretar qualquer número antigo do painel: o que não aconteceu até 18/09
 * não é falha de elegibilidade, é interruptor desligado.
 *
 * **E quem saiu da janela de 7 dias durante esse período NÃO é reaberto** —
 * decisão de produto registrada no PRD §5.4. Essas conversas aparecem na lista
 * como "fora da régua · parada há mais de 7 dias" e quem decide falar com a
 * pessoa é a mesa, não o robô.
 *
 * ── A entrada passou a dizer POR QUE não entrou ─────────────────────────────
 *
 * Antes, quem falhava qualquer uma das nove guardas simplesmente não aparecia na
 * consulta. Hoje a consulta apenas PRÉ-FILTRA (a janela tem índice) e a decisão
 * passa por `avaliarElegibilidade` — a mesma função que o admin usa para
 * responder, na tela, por que uma conversa está fora (`lib/remarketing/
 * motivo-de-exclusao.ts`). O log do ciclo sai agregado (`[remarketing-cycle]
 * excluídos {motivo: n}`), nunca uma linha por conversa.
 */

import type { ConnectionOptions } from "bullmq";
import { and, desc, eq, type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import { beviProposals, remarketingTouches } from "@/db/schema";
import { lerParametrosRegua } from "@/lib/admin/remarketing-config";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { metaOf, persistMeta } from "@/lib/conversation/meta";
import { despacharConversoesPendentes } from "@/lib/conversions/dispatch";
import {
	agregarMotivos,
	avaliarElegibilidade,
	type ConversaAvaliada,
	destinoDoToque,
	MOTIVO_SAIDA_EQUIPE,
	motivoDeSaidaLegivel,
	type ResultadoDeElegibilidade,
} from "@/lib/remarketing/motivo-de-exclusao";
import {
	type DecisaoDoMotor,
	decidir,
	ehObjetivoConhecido,
	ehTelefoneInterno,
	montarEstado,
	OBJETIVO_DESCONHECIDO,
	type ObjetivoDoToque,
	objetivoCanonico,
	telefonesDaEquipe,
	toquesReconstruidos,
	ultimoToqueDerivado,
} from "@/lib/remarketing/motor";
import {
	ESPERA_SILENCIO_MS,
	type EstadoRegua,
	PARAMETROS_DE_FABRICA,
	type ParametrosRegua,
} from "@/lib/remarketing/regua";
import { chaveTelefoneBR } from "@/lib/whatsapp/mesmo-numero";
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
	/** Segura os toques ATIVOS cujo destino é telefone da equipe (idempotente). */
	segurarToquesDaEquipe?: (agora: Date) => Promise<number>;
	/**
	 * O CADASTRO da régua (`remarketing_config`), lido UMA vez por ciclo.
	 * É o que faz a tela de config valer sem deploy: a régua continua pura, quem
	 * lê o banco é o ciclo e passa o objeto ao motor por `parametros`.
	 */
	lerParametros?: () => Promise<ParametrosRegua>;
	despacharConversoes?: () => Promise<unknown>;
}

export interface ResultadoCiclo {
	/** Linhas que entraram na régua neste ciclo. */
	entradas: number;
	/** Toques efetivamente disparados. */
	disparados: number;
	/** Linhas lidas e não disparadas, por motivo. */
	nada: Record<string, number>;
	/** Toques ATIVOS segurados por o destino ser telefone da equipe. */
	seguradosDaEquipe: number;
	/** O que o CAPI devolveu (ou o motivo de não ter tentado). */
	conversoes?: unknown;
}

// ─── Limites ────────────────────────────────────────────────────────────────

/**
 * Env numérica, com default. **Vazio NÃO é zero.**
 *
 * O `.env.example` publica as chaves vazias (é assim que se liga uma capacidade:
 * ausente-desligado), e `Number("")` é `0` — que em `LIMIT` não é "sem limite",
 * é **nenhuma linha**. Enquanto isto era `?? padrao`, um ambiente com a variável
 * publicada e vazia tinha `LIMITE_POR_CICLO = 0`: a régua não disparava nada e
 * não havia erro em lugar nenhum (mesma classe do `every: 0` do BullMQ).
 */
export function inteiroDaEnv(valor: string | undefined, padrao: number): number {
	const n = Number(valor);
	return Number.isFinite(n) && n > 0 ? Math.trunc(n) : padrao;
}

const LIMITE_POR_CICLO = inteiroDaEnv(process.env.REMARKETING_POR_CICLO, 50);
const ENTRADAS_POR_CICLO = inteiroDaEnv(process.env.REMARKETING_ENTRADAS_POR_CICLO, 20);

/**
 * O teto de conversas AVALIADAS por ciclo (a decisão é da função pura, então
 * avaliar é barato; o que não pode é varrer o banco inteiro).
 *
 * O teto precisa ser MAIOR que `ENTRADAS_POR_CICLO`: se o recorte for menor que
 * a cota de entrada, conversa elegível fica de fora e não entra nunca enquanto
 * houver conversa mais recente ocupando o recorte.
 */
const CANDIDATOS_POR_CICLO = inteiroDaEnv(process.env.REMARKETING_CANDIDATOS_POR_CICLO, 500);

/**
 * O recorte da ENTRADA (30 dias), maior de propósito que a janela de 7 dias.
 *
 * A régua só aceita quem está entre 90 min e 7 dias de silêncio — mas o log tem
 * que nomear também quem PASSOU da janela (`parada_ha_mais_de_7_dias`): foi
 * exatamente esse o efeito de a régua ter ficado desligada até 18/09, e a
 * resposta para "quantas conversas eu perdi?" precisa sair do próprio ciclo, não
 * de uma consulta à mão.
 */
const JANELA_DE_CANDIDATOS_MS = 30 * 24 * 60 * 60 * 1000;

/** A lista de telefones da casa muda em cadastro, não em deploy: 60 s basta. */
const CACHE_DA_EQUIPE_MS = 60_000;

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

/**
 * Entrada de conversa da WEB na régua — nasce DESLIGADA.
 *
 * Mesma doutrina da chave operacional: capacidade nova nasce ausente-desligada.
 * Medido em produção (diagnóstico §c): 4 dos 12 identificados-parados eram da
 * web, e a coluna `last_inbound_at` **nunca é escrita** para esse canal — lado a
 * lado com o teto de 7 dias, é o motivo estrutural de a régua ignorar quem veio
 * pelo site. Kairo, 15/09 11:51: "só se identificou pela web e aí eu não tenho
 * janela para conversar com ele → tem que mandar template".
 *
 * Ligada, a régua aceita `channel = 'web'` quando o CONTATO tem telefone válido
 * (E.164 BR) — o envio já é por template, porque a janela de 24 h não existe sem
 * `wa_id`. O template sai para `wa_id ?? contacts.phone`, então o caminho não
 * depende do `wa_id` da conversa. Ligue com `REMARKETING_ENTRADA_WEB=1`.
 */
export function entradaWebLigada(env: Record<string, string | undefined> = process.env): boolean {
	const valor = (env.REMARKETING_ENTRADA_WEB ?? "").trim().toLowerCase();
	return valor === "1" || valor === "true" || valor === "sim";
}

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
 * O telefone é de alguém da CASA? Predicado SQL, usado em dois lugares: para
 * tirar a equipe da consulta de disparo e para achá-la na hora de segurar.
 *
 * Compara pelos OITO ÚLTIMOS DÍGITOS, que é o que a Meta não muda: o nono
 * dígito e o `+55` variam entre a fonte do cadastro e o `wa_id` (ver
 * `mesmo-numero.ts`). Comparar string exata era o furo medido — `mesa_attendants`
 * guarda "62992496793" e a Meta entrega "556292496793", então o número da Bruna
 * passou batido, e 2 dos 6 toques de 18/09 foram para gente nossa (diagnóstico §d).
 *
 * `is_active` NÃO entra de propósito: o telefone de quem saiu da equipe continua
 * sendo um telefone da casa. Filtrar por ativo foi metade do mesmo furo — Bruna e
 * Romulo estavam com `is_active = false` e receberam toque.
 *
 * Erra para o lado de BLOQUEAR: dois números distintos com os mesmos 8 dígitos
 * finais e o mesmo DDD são, na prática, o mesmo telefone (`chaveTelefoneBR` usa
 * DDD + 8 por isso). Sem DDD aqui a guarda fica mais ampla — e ampliar a guarda
 * só custa um lead que a mesa pode puxar à mão.
 */
function ehTelefoneDaEquipeSql(telefone: SQL): SQL {
	const digitos = sql`regexp_replace(coalesce(${telefone}, ''), '[^0-9]', '', 'g')`;
	return sql`(
		length(${digitos}) >= 10
		AND (
			EXISTS (SELECT 1 FROM mesa_attendants m
			         WHERE right(regexp_replace(m.whatsapp, '[^0-9]', '', 'g'), 8) = right(${digitos}, 8))
			OR EXISTS (SELECT 1 FROM "user" u
			         WHERE u.phone IS NOT NULL
			           AND right(regexp_replace(u.phone, '[^0-9]', '', 'g'), 8) = right(${digitos}, 8))
		)
	)`;
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
			  -- Conversa marcada como TESTE depois de já ter entrado continuava
			  -- recebendo toque: a entrada filtrava is_simulated, esta consulta — a
			  -- que decide QUEM dispara — não. Em prod, 2 dos 6 toques de 18/09 foram
			  -- para telefones da equipe, e é este o furo que os dois AND fecham.
			  AND c.is_simulated = false
			  AND NOT ${ehTelefoneDaEquipeSql(sql`coalesce(c.wa_id, ct.phone)`)}
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
 * silêncio do toque 01).
 *
 * ── O que mudou aqui (18/09) ───────────────────────────────────────────────
 *
 * 1. A consulta virou RECORTE, não filtro: ela traz as conversas do período e a
 *    DECISÃO é de `avaliarElegibilidade` — a mesma função que o admin usa na
 *    tela. Antes, quem falhava qualquer guarda simplesmente não aparecia, e
 *    responder "por que estes 11 não entraram?" era rodar as nove condições à
 *    mão (diagnóstico §c).
 * 2. Por isso o recorte é de 30 dias e maior que a janela de 7: o log precisa
 *    conseguir dizer `parada_ha_mais_de_7_dias` — que é o que aconteceu com
 *    quem caiu fora enquanto a régua esteve desligada até 18/09 11:47.
 * 3. `channel = 'web'` entra quando `REMARKETING_ENTRADA_WEB` está ligada e o
 *    contato tem telefone válido: o envio é por template (não há janela de 24 h
 *    sem `wa_id`), e é o único caminho para 4 dos 12 identificados de produção.
 * 4. `is_simulated` continua guardando a ENTRADA (agora dentro de
 *    `avaliarElegibilidade`) e passou a guardar também a SAÍDA — `listarVencidas`
 *    é quem decide QUEM dispara e não tinha essa guarda: conversa marcada como
 *    teste DEPOIS de entrar continuava recebendo toque.
 *
 * O teto real (3 toques/30 dias) continua valendo no disparo — a entrada não é
 * o lugar de contá-lo.
 */
export async function entrarNaRegua(agora: Date): Promise<number> {
	const candidatos = await candidatosDaEntrada(agora);
	const entradaWeb = entradaWebLigada();
	const ligada = reguaLigada();

	const vereditos: ResultadoDeElegibilidade[] = [];
	const elegiveis: CandidatoDaEntrada[] = [];

	for (const candidato of candidatos) {
		const destino = destinoDoToque(candidato);
		const veredito = avaliarElegibilidade(candidato, agora, {
			reguaLigada: ligada,
			entradaWeb,
			telefoneDaEquipe: destino !== null && (await ehDaEquipe(destino)),
		});
		vereditos.push(veredito);
		if (veredito.elegivel) elegiveis.push(candidato);
	}

	const agregado = agregarMotivos(vereditos);
	if (agregado.avaliadas > 0) {
		// AGREGADO, de propósito: o ciclo roda a cada 30 s, e uma linha por
		// conversa viraria ruído que ninguém lê.
		console.log("[remarketing-cycle] excluídos", JSON.stringify(agregado));
	}

	// A ordem da consulta (inbound mais recente primeiro) é a prioridade da
	// cota: quem falou por último é quem tem mais chance de responder.
	let entradas = 0;
	for (const candidato of elegiveis) {
		if (entradas >= ENTRADAS_POR_CICLO) break;
		const ultimoInbound = candidato.lastInboundAt;
		if (!ultimoInbound) continue;
		try {
			await db
				.insert(remarketingTouches)
				.values({
					conversationId: candidato.conversationId,
					contactId: candidato.contactId as string,
					objetivo: objetivoDoMetadata(candidato.metadata) ?? OBJETIVO_DESCONHECIDO,
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
					conversation_id: candidato.conversationId,
					error: err instanceof Error ? err.message : String(err),
				}),
			);
		}
	}
	return entradas;
}

/** A conversa avaliada, com o que o INSERT precisa. */
interface CandidatoDaEntrada extends ConversaAvaliada {
	conversationId: string;
	metadata: unknown;
}

/**
 * O recorte da entrada: 30 dias de conversas, com contato e o "já tem linha"
 * resolvidos no banco.
 *
 * O `LIMIT` é teto de trabalho, não filtro de elegibilidade — por isso ele é
 * generoso (500) e a ordem é a mesma prioridade do insert. O índice
 * `conversations_last_inbound_at_idx` cobre a janela.
 */
async function candidatosDaEntrada(agora: Date): Promise<CandidatoDaEntrada[]> {
	const desde = new Date(agora.getTime() - JANELA_DE_CANDIDATOS_MS).toISOString();
	const linhas = linhasDeExecucao(
		await db.execute(sql`
			SELECT c.id AS "conversationId", c.channel, c.status,
			       c.is_simulated AS "isSimulated", c.contact_id AS "contactId",
			       c.wa_id AS "waId", c.metadata,
			       c.last_inbound_at AS "lastInboundAt", ct.phone,
			       EXISTS (SELECT 1 FROM remarketing_touches t
			                WHERE t.conversation_id = c.id) AS "jaNaRegua"
			FROM conversations c
			LEFT JOIN contacts ct ON ct.id = c.contact_id
			WHERE c.last_inbound_at >= ${desde}::timestamptz
			   OR (c.last_inbound_at IS NULL AND c.created_at >= ${desde}::timestamptz)
			ORDER BY c.last_inbound_at DESC NULLS LAST
			LIMIT ${CANDIDATOS_POR_CICLO}
		`),
	);

	return linhas.map((l) => ({
		conversationId: String(l.conversationId),
		channel: (l.channel as "web" | "whatsapp") ?? "whatsapp",
		status: l.status as ConversaAvaliada["status"],
		isSimulated: l.isSimulated === true,
		contactId: (l.contactId as string | null) ?? null,
		lastInboundAt: l.lastInboundAt ? new Date(l.lastInboundAt as string) : null,
		waId: (l.waId as string | null) ?? null,
		phone: (l.phone as string | null) ?? null,
		jaNaRegua: l.jaNaRegua === true,
		metadata: l.metadata,
	}));
}

/**
 * O bem que a conversa revelou, se revelou — **`null` quando não se sabe**.
 *
 * `null` é a informação, não a falta dela: é a diferença entre "quero um carro"
 * e "ainda não disse o bem", e é ela que decide se o toque leva arte (AJA-14 — a
 * Bruna recebeu a pergunta "carro, apartamento ou moto?" com a foto do CARRO
 * embaixo, porque o default caía em `carro`).
 *
 * A fonte é `conversations.metadata.currentCategory` — o único lugar onde o
 * agente registra o eixo (`Category = "imovel" | "auto" | "moto"`).
 */
function objetivoDoMetadata(metadata: unknown): ObjetivoDoToque | null {
	const categoria = (metadata as { currentCategory?: string } | null)?.currentCategory;
	if (!categoria) return null;
	return ehObjetivoConhecido(categoria) ? objetivoCanonico(categoria) : null;
}

/**
 * O telefone é da EQUIPE? Lista em código + env + banco (`mesa_attendants` e
 * `user`), comparando pela chave canônica do BR.
 *
 * Deixou de ser o hardcode mais os "atendentes ativos":
 *
 *   - o banco entra pelos dois cadastros que existem (mesa e usuário), **sem**
 *     `is_active` — o telefone de quem saiu da equipe continua sendo da casa, e
 *     foi justamente filtrando por ativo que Bruna e Romulo receberam toque
 *     (diagnóstico §d: 2 dos 6 toques de 18/09);
 *   - a comparação é por `chaveTelefoneBR` (DDD + 8 finais), porque o nono
 *     dígito varia entre o cadastro e o `wa_id` da Meta — antes era `===` de
 *     string e o número da casa passava batido;
 *   - as tabelas não mudam a cada 30 s: a lista fica em cache de 1 min.
 *
 * Falha do banco NÃO libera: na dúvida, trata como equipe (não manda).
 */
let cacheDaEquipe: { chaves: Set<string>; expiraEm: number } | null = null;

/** Esvazia o cache — o teste de integração precisa ver o que acabou de semear. */
export function invalidarCacheDaEquipe(): void {
	cacheDaEquipe = null;
}

async function chavesDaEquipe(): Promise<Set<string>> {
	if (cacheDaEquipe && cacheDaEquipe.expiraEm > Date.now()) return cacheDaEquipe.chaves;

	const chaves = new Set<string>();
	for (const telefone of telefonesDaEquipe()) {
		const chave = chaveTelefoneBR(telefone);
		if (chave) chaves.add(chave);
	}

	const linhas = linhasDeExecucao(
		await db.execute(sql`
			SELECT whatsapp AS telefone FROM mesa_attendants
			UNION ALL
			SELECT phone AS telefone FROM "user" WHERE phone IS NOT NULL
		`),
	);
	for (const linha of linhas) {
		const chave = chaveTelefoneBR(linha.telefone as string | null);
		if (chave) chaves.add(chave);
	}

	cacheDaEquipe = { chaves, expiraEm: Date.now() + CACHE_DA_EQUIPE_MS };
	return chaves;
}

export async function ehDaEquipe(telefone: string | null): Promise<boolean> {
	if (!telefone) return false;
	const chave = chaveTelefoneBR(telefone);
	if (!chave) return false;
	if (ehTelefoneInterno(telefone)) return true;
	try {
		return (await chavesDaEquipe()).has(chave);
	} catch {
		return true;
	}
}

/**
 * SEGURA os toques ATIVOS cujo destino é telefone da casa — idempotente.
 *
 * A régua não dispara para a equipe (o motor barra e a consulta de disparo já
 * exclui), mas a linha ficava ATIVA para sempre: lida a cada 30 s, contada na
 * tela como "ativa" e sem dizer a ninguém por que não saía. Aqui ela sai do
 * índice com o motivo nomeado, e o `WHERE status = 'ATIVO'` faz o segundo ciclo
 * não mexer em nada.
 *
 * O status é `RESPONDEU` — o único bloqueio REVERSÍVEL do enum (ver
 * `admin/remarketing-tela.ts`): "a sequência parou, mas pode voltar". Não existe
 * `SEGURADO` no enum, e criar um novo valor mudaria a régua inteira por causa de
 * um rótulo.
 */
export async function segurarToquesDaEquipe(agora: Date): Promise<number> {
	const linhas = linhasDeExecucao(
		await db.execute(sql`
			SELECT t.conversation_id AS "conversationId"
			FROM remarketing_touches t
			JOIN conversations c ON c.id = t.conversation_id
			JOIN contacts ct ON ct.id = t.contact_id
			WHERE t.status = 'ATIVO'
			  AND ${ehTelefoneDaEquipeSql(sql`coalesce(c.wa_id, ct.phone)`)}
		`),
	);

	let segurados = 0;
	for (const linha of linhas) {
		const atualizadas = await db
			.update(remarketingTouches)
			.set({ status: "RESPONDEU", motivoSaida: MOTIVO_SAIDA_EQUIPE, updatedAt: agora })
			.where(
				and(
					eq(remarketingTouches.conversationId, String(linha.conversationId)),
					eq(remarketingTouches.status, "ATIVO"),
				),
			)
			.returning({ id: remarketingTouches.id });
		segurados += atualizadas.length;
	}
	return segurados;
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
	const segurarEquipe = deps.segurarToquesDaEquipe ?? segurarToquesDaEquipe;
	const lerParametros = deps.lerParametros ?? lerParametrosRegua;
	const despachar = deps.despacharConversoes ?? despacharConversoesPendentes;

	const nada: Record<string, number> = {};
	let disparados = 0;
	let entradas = 0;
	let seguradosDaEquipe = 0;

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
		return {
			entradas: 0,
			disparados: 0,
			nada,
			seguradosDaEquipe: 0,
			conversoes: conversoesDesligada,
		};
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

	// ── Higiene: a equipe sai da régua COM MOTIVO ─────────────────────────────
	// Separado da entrada de propósito: a linha pode ter entrado antes de o
	// telefone virar cadastro da casa (ou o número é da lista da env, que o SQL
	// não vê). Idempotente pelo `WHERE status = 'ATIVO'`.
	try {
		seguradosDaEquipe = await segurarEquipe(agora);
		if (seguradosDaEquipe > 0) {
			console.log(
				"[remarketing-cycle] equipe segurada",
				JSON.stringify({
					segurados: seguradosDaEquipe,
					motivo: motivoDeSaidaLegivel(MOTIVO_SAIDA_EQUIPE),
				}),
			);
		}
	} catch (err) {
		console.error(
			JSON.stringify({
				level: "error",
				source: "remarketing-cycle",
				etapa: "segurar-equipe",
				error: err instanceof Error ? err.message : String(err),
			}),
		);
	}

	// ── O cadastro da régua, lido UMA vez por ciclo ───────────────────────────
	// Não é por linha: o ajuste vale para o tick inteiro e uma leitura só evita
	// N consultas. Ler aqui é o que liga a tela de config ao motor — sem isto o
	// motor cai em `PARAMETROS_DE_FABRICA` e a promessa de "passa a valer em até
	// um ciclo, sem deploy" é falsa.
	//
	// Falha de leitura NÃO derruba o ciclo: cai na fábrica, que é o lado de
	// "menos toque" (o viés de `normalizarParametros`), e o erro fica no log —
	// nunca em silêncio.
	let parametros: ParametrosRegua = PARAMETROS_DE_FABRICA;
	try {
		parametros = await lerParametros();
	} catch (err) {
		console.error(
			JSON.stringify({
				level: "error",
				source: "remarketing-cycle",
				etapa: "cadastro",
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
				// O bem vem da METADATA ao vivo, com o valor gravado na entrada como
				// reserva: se o lead revelou o bem depois de entrar, a arte e o template
				// já seguem o eixo certo; se nunca revelou, o objetivo é o desconhecido e
				// o toque sai sem imagem (AJA-14).
				objetivo: objetivoDoMetadata(linha.metadata) ?? linha.objetivo,
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
				parametros,
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
				// Telefone da casa: além de não disparar, a linha SAI do índice com o
				// motivo nomeado — senão ela é relida a cada 30 s para sempre e a tela a
				// mostra como "ativa" sem explicar por que nunca sai toque.
				if (decisao.acao.motivo === "telefone_interno" && estado.status !== "OPTOUT") {
					await gravar({
						conversationId: linha.conversationId,
						estado: {
							...estado,
							status: estado.status === "ATIVO" ? "RESPONDEU" : estado.status,
							motivoSaida: estado.motivoSaida ?? MOTIVO_SAIDA_EQUIPE,
						},
						touches30d: decisao.touches30d,
						agora,
					});
				}
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
				// Sem bem conhecido, a arte NÃO sai: o turno de retomada fala o texto e
				// para (`arteDoObjetivo` devolve `null`). Melhor um toque só de texto do
				// que a imagem de um carro para quem nunca falou de carro (AJA-14).
				if (decisao.acao.arte) {
					await enviarArte({ to: telefone, link: urlDaArte(decisao.acao.arte) });
				}
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

	return { entradas, disparados, nada, seguradosDaEquipe, conversoes };
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
			if (resultado.disparados > 0 || resultado.entradas > 0 || resultado.seguradosDaEquipe > 0) {
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
