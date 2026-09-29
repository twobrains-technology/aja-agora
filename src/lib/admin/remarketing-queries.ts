/**
 * A LEITURA E A ESCRITA DA RÉGUA PARA A TELA — server-only.
 *
 * Este arquivo é a única parte de `/admin/remarketing` que fala com o banco. A
 * derivação (situação, contadores, guardas) mora em `remarketing-tela.ts`, pura
 * e testável sem Postgres; aqui ficam as colunas, o mascaramento do telefone e
 * as duas escritas da ação.
 *
 * ── Uma consulta só, e a contagem sai dela ──────────────────────────────────
 *
 * O período do painel é da PESSOA (bloco 5) e entra por `periodoDaRequisicao`,
 * como nas outras telas. O recorte é `remarketing_touches.created_at` — o
 * instante em que a conversa ENTROU na régua, que é o evento estável da linha
 * (`next_touch_at` muda a cada toque e desaparece no fim da sequência; servir o
 * período por ele esconderia justamente as linhas paradas).
 *
 * Os contadores do topo são contados sobre TODAS as linhas do recorte, e só
 * depois a situação escolhida filtra a lista. Contar depois do filtro produziria
 * a piada de painel: escolher "Responderam" e ver o contador de ativos zerar.
 * Por isso a consulta não tem `LIMIT` — a contagem precisa ser exata —, e a
 * paginação acontece em memória sobre as linhas já lidas. O volume é pequeno por
 * construção: uma linha por conversa que ficou 90 minutos em silêncio, dentro do
 * período escolhido.
 *
 * ── O rastro da ação fica em `conversations.metadata` ───────────────────────
 *
 * `remarketing_touches` não tem coluna de auditoria e a migration é de outro
 * bloco (`drizzle/**` está fora do escopo). O metadata da conversa é o registro
 * disponível e já é usado como bolsa de fatos (`retomada`), então a última ação
 * da tela entra ali como `remarketingAcao` — quem, quando e qual ação. O
 * `updated_at` da linha da régua também é bumpado por `$onUpdate` e dá a hora
 * exata da escrita.
 *
 * A escrita lê-modifica-escreve o metadata, e o ciclo faz o mesmo (`retomada`).
 * A janela de colisão é estreita — o ciclo só processa linha `ATIVO` e a ação
 * de segurar tira a linha do conjunto dele — e o que se perde em caso de
 * corrida é um contador de retomada ou um carimbo de auditoria, nunca um toque
 * duplicado. Trocar isto por uma coluna nova seria migration fora do escopo.
 */

import { and, eq, gte, isNull, like, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts, conversations, remarketingTouches, whatsappTemplates } from "@/db/schema";
import { maskPhoneForDisplay } from "@/lib/conversation/identity";
import { persistMeta, reloadMeta } from "@/lib/conversation/meta";
import { objetivoCanonico, templateDoObjetivo } from "@/lib/remarketing/motor";
import {
	PARAMETROS_DE_FABRICA,
	type ParametrosRegua,
	type StatusRegua,
} from "@/lib/remarketing/regua";
import { chaveTelefoneBR } from "@/lib/whatsapp/mesmo-numero";
import { JANELA_DE_ENTRADA_MS, motivoForaDaRegua, opcoesDoAmbiente } from "./motivo-fora-da-regua";
import { telefonesDaEquipe } from "./regua-por-conversa";
import { lerParametrosRegua } from "./remarketing-config";
import type {
	EvidenciaDaForma,
	LinhaBruta,
	RastroDoAtendente,
	StatusDaFila,
} from "./remarketing-tela";

export interface FiltroDaRegua {
	/** Início da janela (instante, já resolvido pelo período do painel). */
	de: Date;
	/** Fim da janela (instante). */
	ate: Date;
	/** `carro` · `moto` · `imovel`; ausente = todos. */
	objetivo?: string | null;
}

function texto(valor: unknown): string | null {
	if (valor === null || valor === undefined) return null;
	const t = String(valor).trim();
	return t ? t : null;
}

function dataOuNulo(valor: unknown): Date | null {
	return valor === null || valor === undefined ? null : new Date(valor as string);
}

/**
 * O telefone para exibir: DDD e os últimos quatro dígitos.
 *
 * A máscara é a do painel (`maskPhoneForDisplay`, a mesma que o agente usa para
 * confirmar o número com o cliente) e o número entra nela pela chave canônica
 * do BR — `contacts.phone` é gravado sem código de país, mas o `wa_id` da Meta
 * chega com "55" na frente, e mascarar o E.164 cru mostraria DDD "55".
 */
function telefoneParaExibir(phone: unknown, waId: unknown): string | null {
	const chave = chaveTelefoneBR(texto(phone)) ?? chaveTelefoneBR(texto(waId));
	if (!chave) return null;
	return maskPhoneForDisplay(chave) || null;
}

/** O rastro da última ação do painel, se houver. Formato desconhecido = ausência. */
export function rastroDoMetadata(metadata: unknown): RastroDoAtendente | null {
	const acao = (metadata as { remarketingAcao?: unknown } | null)?.remarketingAcao;
	if (!acao || typeof acao !== "object") return null;

	const { tipo, por, porId, em } = acao as Record<string, unknown>;
	if (tipo !== "segurar" && tipo !== "soltar" && tipo !== "reentrada") return null;
	if (typeof em !== "string" || Number.isNaN(Date.parse(em))) return null;

	return {
		tipo,
		por: typeof por === "string" && por.trim() ? por : "—",
		porId: typeof porId === "string" ? porId : "",
		em,
	};
}

/**
 * O template do bem está aprovado na Meta, pelo nome? `usageKey → metaName`.
 *
 * Uma leitura só por consulta (a tabela é minúscula: um punhado de linhas) em
 * vez de um `CASE` por linha na consulta — a chave lógica do template é do
 * motor (`templateDoObjetivo`), e reescrevê-la em SQL daria duas verdades.
 */
type MapaDeTemplates = Map<string, string>;

async function templatesAprovados(): Promise<MapaDeTemplates> {
	const linhas = await db
		.select({ usageKey: whatsappTemplates.usageKey, metaName: whatsappTemplates.metaName })
		.from(whatsappTemplates)
		.where(
			and(
				eq(whatsappTemplates.status, "APPROVED"),
				like(whatsappTemplates.usageKey, "remarketing_oportunidade_%"),
			),
		);

	const mapa: MapaDeTemplates = new Map();
	for (const linha of linhas) if (linha.usageKey) mapa.set(linha.usageKey, linha.metaName);
	return mapa;
}

/**
 * O rastro do último toque, das colunas que a consulta trouxe (FIX-380).
 *
 * As colunas ausentes viram "sem rastro" — nunca "texto livre": é a mesma
 * regra da derivação em `remarketing-tela.ts`.
 */
function evidenciaDaForma(
	linha: Record<string, unknown>,
	templates: MapaDeTemplates,
): EvidenciaDaForma {
	const statusDaFila = texto(linha.filaStatus);
	const nomeDaFila = texto(linha.filaNome);
	const objetivo = String(linha.objetivo ?? "");

	return {
		houveFalaDoAgente: Number(linha.falasDoAgente ?? 0) > 0,
		nomeDoTemplateNaMensagem: texto(linha.templateName),
		naFila:
			statusDaFila === "pending" || statusDaFila === "sent" || statusDaFila === "failed"
				? { status: statusDaFila as StatusDaFila, nomeDoTemplate: nomeDaFila }
				: null,
		// O objetivo GRAVADO na linha serve de base — é ele que a lista já mostra; o
		// motor prefere o da metadata (o bem pode ter sido revelado depois), e usar
		// os dois aqui daria um nome de template que não bate com a coluna Objetivo.
		templateAprovado: templates.get(templateDoObjetivo(objetivo)) ?? null,
	};
}

/** Uma linha do banco → `LinhaBruta`. O mascaramento acontece aqui, na borda. */
function montarLinha(
	linha: Record<string, unknown>,
	templates: MapaDeTemplates = new Map(),
): LinhaBruta {
	return {
		conversationId: String(linha.conversationId),
		contactId: String(linha.contactId),
		nome: texto(linha.nome),
		telefoneMascarado: telefoneParaExibir(linha.phone, linha.waId),
		objetivo: String(linha.objetivo ?? ""),
		step: Number(linha.step ?? 0),
		status: String(linha.status) as StatusRegua,
		motivoSaida: texto(linha.motivoSaida),
		nextTouchAt: dataOuNulo(linha.nextTouchAt),
		ultimoToqueEm: dataOuNulo(linha.ultimoToqueEm),
		touches30d: Number(linha.touches30d ?? 0),
		criadoEm: new Date(linha.criadoEm as string),
		ultimoInboundEm: dataOuNulo(linha.ultimoInboundEm),
		optoutDaPessoaEm: dataOuNulo(linha.optoutDaPessoaEm),
		// Só `listarReguas` traz esta coluna; nas outras consultas é `undefined`.
		converteuEm: dataOuNulo(linha.converteuEm),
		rastro: rastroDoMetadata(linha.metadata),
		// Só `listarReguas` traz o rastro do toque (fala, fila e template).
		evidenciaDaForma: evidenciaDaForma(linha, templates),
	};
}

const COLUNAS = sql`
	t.conversation_id AS "conversationId",
	t.contact_id AS "contactId",
	ct.name AS nome,
	ct.phone,
	c.wa_id AS "waId",
	t.objetivo,
	t.step,
	t.status,
	t.motivo_saida AS "motivoSaida",
	t.next_touch_at AS "nextTouchAt",
	t.ultimo_toque_em AS "ultimoToqueEm",
	t.touches_30d AS "touches30d",
	t.created_at AS "criadoEm",
	c.last_inbound_at AS "ultimoInboundEm",
	ct.remarketing_optout_at AS "optoutDaPessoaEm",
	c.metadata
`;

/**
 * A ordem da lista: primeiro quem ainda tem toque para sair, ordenado por QUANDO
 * ele sai (é a pergunta do topo da tela); depois o histórico, do mais recente
 * para o mais antigo. O `next_touch_at` é lido apenas no ramo `ATIVO` — linha
 * segurada guarda a data antiga para o "soltar", e ordenar por ela poria a régua
 * parada no topo da lista.
 */
const ORDEM = sql`
	ORDER BY (t.status <> 'ATIVO') ASC,
	         CASE WHEN t.status = 'ATIVO' THEN t.next_touch_at END ASC NULLS LAST,
	         t.created_at DESC
`;

/** O recorte do período e do objetivo, compartilhado pelas duas consultas. */
function recorte(filtro: FiltroDaRegua) {
	const objetivo = filtro.objetivo?.trim() ? objetivoCanonico(filtro.objetivo) : null;
	return sql`
		WHERE t.created_at BETWEEN ${filtro.de.toISOString()}::timestamptz
		                       AND ${filtro.ate.toISOString()}::timestamptz
		  AND c.is_simulated = false
		  ${objetivo ? sql`AND t.objetivo = ${objetivo}` : sql``}
	`;
}

/**
 * A forma do toque, em SQL: a fala do agente e a fila de template.
 *
 * A janela é ancorada no `ultimo_toque_em` — o rastro que interessa é o do
 * ÚLTIMO toque, não o de um toque antigo da mesma conversa. E o `NOT EXISTS` da
 * fala evita o falso positivo que mais enganaria: o cliente responde dentro da
 * janela e a RESPOSTA do agente contaria como se fosse o toque.
 *
 * O envio por template não grava mensagem no histórico — é justamente por isso
 * que a AUSÊNCIA de fala é o sinal de que o toque saiu por template.
 */
const RASTRO_DA_FORMA = sql`
	msg.nome AS "templateName",
	msg.falas AS "falasDoAgente",
	fila.status AS "filaStatus",
	fila.nome AS "filaNome"
`;

const JUNCOES_DA_FORMA = sql`
	LEFT JOIN LATERAL (
		SELECT MIN(m.template_name) AS nome, COUNT(*) AS falas
		FROM messages m
		WHERE m.conversation_id = t.conversation_id
		  AND t.ultimo_toque_em IS NOT NULL
		  AND m.role = 'assistant'
		  AND m.created_at >= t.ultimo_toque_em
		  AND m.created_at <= t.ultimo_toque_em + interval '10 minutes'
		  AND NOT EXISTS (
			SELECT 1 FROM messages u
			WHERE u.conversation_id = m.conversation_id
			  AND u.role = 'user'
			  AND u.created_at > t.ultimo_toque_em
			  AND u.created_at < m.created_at
		  )
	) msg ON true
	LEFT JOIN LATERAL (
		SELECT q.status, wt.meta_name AS nome
		FROM whatsapp_outbound_queue q
		LEFT JOIN whatsapp_templates wt ON wt.usage_key = q.usage_key
		WHERE t.ultimo_toque_em IS NOT NULL
		  AND q.usage_key LIKE 'remarketing_oportunidade_%'
		  AND q.to = COALESCE(c.wa_id, ct.phone)
		  AND q.created_at >= t.ultimo_toque_em - interval '1 minute'
		  AND q.created_at <= t.ultimo_toque_em + interval '10 minutes'
		ORDER BY q.created_at DESC
		LIMIT 1
	) fila ON true
`;

/** Todas as linhas da régua no recorte. Sem limite: contador tem que fechar. */
export async function listarReguas(filtro: FiltroDaRegua): Promise<LinhaBruta[]> {
	const [resultado, templates] = await Promise.all([
		db.execute<Record<string, unknown>>(sql`
			SELECT ${COLUNAS}, venda.em AS "converteuEm", ${RASTRO_DA_FORMA}
			FROM remarketing_touches t
			JOIN conversations c ON c.id = t.conversation_id
			JOIN contacts ct ON ct.id = t.contact_id
			LEFT JOIN LATERAL (
				SELECT MIN(ev.created_at) AS em
				FROM leads le
				JOIN lead_events ev ON ev.lead_id = le.id AND ev.to_stage = 'fechado_ganho'
				WHERE le.conversation_id = t.conversation_id
				  AND le.is_simulated = false
			) venda ON true
			${JUNCOES_DA_FORMA}
			${recorte(filtro)}
			${ORDEM}
		`),
		templatesAprovados(),
	]);

	return resultado.rows.map((linha) => montarLinha(linha, templates));
}

/** Uma linha pelo id da conversa — o que a ação precisa ler antes de decidir. */
export async function lerLinhaDaRegua(conversationId: string): Promise<LinhaBruta | null> {
	const resultado = await db.execute<Record<string, unknown>>(sql`
		SELECT ${COLUNAS}
		FROM remarketing_touches t
		JOIN conversations c ON c.id = t.conversation_id
		JOIN contacts ct ON ct.id = t.contact_id
		WHERE t.conversation_id = ${conversationId}::uuid
	`);

	const [linha] = resultado.rows;
	return linha ? montarLinha(linha) : null;
}

/**
 * Os parâmetros VIGENTES do cadastro, para a derivação da tela (FIX-378).
 *
 * O motivo de o próximo toque não ter saído depende da janela de horário e do
 * teto que o MOTOR está usando — lê-los da fábrica faria a tela mentir no dia em
 * que o dono mudasse a hora pelo cadastro.
 *
 * Falha de leitura NÃO derruba a tela: cai na fábrica (o lado de "menos toque"),
 * que é o mesmo que o motor usaria num ciclo com o cadastro ilegível.
 */
export async function lerParametrosDaTela(): Promise<ParametrosRegua> {
	try {
		return await lerParametrosRegua();
	} catch {
		return PARAMETROS_DE_FABRICA;
	}
}

/**
 * Grava o resultado da ação: o estado da linha (status + motivo) e o rastro de
 * quem agiu. As duas escritas em sequência — primeiro a régua, que é o que para
 * o disparo; o rastro é registro, não efeito.
 */
export async function gravarAcaoDaRegua(args: {
	conversationId: string;
	status: StatusRegua;
	motivoSaida: string | null;
	rastro: RastroDoAtendente;
}): Promise<void> {
	await db
		.update(remarketingTouches)
		.set({ status: args.status, motivoSaida: args.motivoSaida })
		.where(eq(remarketingTouches.conversationId, args.conversationId));

	const meta = await reloadMeta(args.conversationId);
	// `Object.assign` (e não literal com spread) para o campo novo não esbarrar no
	// excess property check de `ConversationMetadata`.
	await persistMeta(args.conversationId, Object.assign({}, meta, { remarketingAcao: args.rastro }));
}

// ─── Os insights: leitura própria, sem período ──────────────────────────────

/**
 * Quantas linhas a régua tem NO BANCO INTEIRO, sem recorte de período.
 *
 * Existe para a tela distinguir "a régua nunca foi ligada" de "não houve toque
 * neste período" — zero no recorte não pode responder isso sozinho, porque um
 * recorte de hoje também é zero numa régua que já rodou.
 */
export async function contarLinhasDaRegua(): Promise<number> {
	const resultado = await db.execute<{ total: number }>(sql`
		SELECT COUNT(*)::int AS total
		FROM remarketing_touches t
		JOIN conversations c ON c.id = t.conversation_id
		WHERE c.is_simulated = false
	`);
	return Number(resultado.rows[0]?.total ?? 0);
}

/**
 * A janela de entrada da régua: 7 dias. O ciclo só olha o silêncio recente —
 * sem o teto, o primeiro ciclo depois do deploy varreria o histórico inteiro.
 * O valor vem de `motivo-de-exclusao.ts:169` — lá está a única declaração de
 * `JANELA_DE_ENTRADA_MS`; o caminho de admin reexporta (AJA-22 T0).
 */

/**
 * Quantas conversas entrariam na régua no próximo ciclo.
 *
 * É o número que o estado honesto mostra enquanto a régua está desligada. A
 * decisão NÃO é reescrita em SQL: a consulta pré-filtra a janela de 30 dias
 * (mais larga que a de entrada, para o motivo `parada_ha_mais_de_7_dias`
 * aparecer) e cada conversa passa por `motivoForaDaRegua` — a MESMA função que
 * a coluna "Régua" das telas usa. Assim o cartão "Elegíveis que ainda não
 * entraram" não pode divergir da decisão real do ciclo.
 *
 * O `LIMIT` do ciclo (`ENTRADAS_POR_CICLO`) NÃO conta aqui: a pergunta é o
 * tamanho da fila, não de onde a fila é cortada.
 */
export async function contarElegiveisParaRegua(agora: Date): Promise<number> {
	const opcoes = opcoesDoAmbiente();
	const janelaDeAvaliacao = new Date(agora.getTime() - JANELA_DE_ENTRADA_MS);

	const candidatos = await db
		.select({
			conversationId: conversations.id,
			channel: conversations.channel,
			status: conversations.status,
			isSimulated: conversations.isSimulated,
			contactId: conversations.contactId,
			lastInboundAt: conversations.lastInboundAt,
			waId: conversations.waId,
			telefone: contacts.phone,
			jaNaRegua: remarketingTouches.conversationId,
		})
		.from(conversations)
		.leftJoin(contacts, eq(contacts.id, conversations.contactId))
		.leftJoin(remarketingTouches, eq(remarketingTouches.conversationId, conversations.id))
		.where(
			and(
				eq(conversations.isSimulated, false),
				or(
					gte(conversations.lastInboundAt, janelaDeAvaliacao),
					// Sem `last_inbound_at` a conversa cai no motivo `ainda_em_silencio`,
					// mas continua sendo candidata a avaliação (não some da conta).
					isNull(conversations.lastInboundAt),
				),
			),
		);

	const ehEquipe = await telefonesDaEquipe();
	let total = 0;
	for (const c of candidatos) {
		const telefone = c.waId ?? c.telefone;
		const veredito = motivoForaDaRegua(
			{
				channel: c.channel as "web" | "whatsapp",
				status: c.status as "active" | "handed_off" | "closed",
				isSimulated: c.isSimulated,
				contactId: c.contactId ?? null,
				lastInboundAt: c.lastInboundAt ?? null,
				waId: c.waId ?? null,
				phone: c.telefone ?? null,
				jaNaRegua: c.jaNaRegua !== null,
			},
			agora,
			{ ...opcoes, telefoneDaEquipe: telefone ? ehEquipe(telefone) : false },
		);
		if (veredito === null) total += 1;
	}
	return total;
}
