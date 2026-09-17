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

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { remarketingTouches } from "@/db/schema";
import { maskPhoneForDisplay } from "@/lib/conversation/identity";
import { persistMeta, reloadMeta } from "@/lib/conversation/meta";
import { ehTelefoneInterno, objetivoCanonico } from "@/lib/remarketing/motor";
import { ESPERA_SILENCIO_MS, type StatusRegua } from "@/lib/remarketing/regua";
import { chaveTelefoneBR } from "@/lib/whatsapp/mesmo-numero";
import type { LinhaBruta, RastroDoAtendente } from "./remarketing-tela";

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
	if (tipo !== "segurar" && tipo !== "soltar") return null;
	if (typeof em !== "string" || Number.isNaN(Date.parse(em))) return null;

	return {
		tipo,
		por: typeof por === "string" && por.trim() ? por : "—",
		porId: typeof porId === "string" ? porId : "",
		em,
	};
}

/** Uma linha do banco → `LinhaBruta`. O mascaramento acontece aqui, na borda. */
function montarLinha(linha: Record<string, unknown>): LinhaBruta {
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

/** Todas as linhas da régua no recorte. Sem limite: contador tem que fechar. */
export async function listarReguas(filtro: FiltroDaRegua): Promise<LinhaBruta[]> {
	const resultado = await db.execute<Record<string, unknown>>(sql`
		SELECT ${COLUNAS}, venda.em AS "converteuEm"
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
		${recorte(filtro)}
		${ORDEM}
	`);

	return resultado.rows.map(montarLinha);
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
 * É a MESMA constante de `remarketing-cycle.ts` (`JANELA_DE_ENTRADA_MS`); fica
 * duplicada aqui porque a alternativa seria importar um módulo de worker (com
 * BullMQ e Redis) para dentro da rota do admin.
 */
const JANELA_DE_ENTRADA_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * O telefone é da equipe? Espelha `ehDaEquipe` do ciclo: lista em código mais os
 * atendentes ativos do banco. Falha do banco NÃO libera — na dúvida, trata como
 * equipe, porque o erro que não se pode cometer é contar (ou tocar) quem é de
 * dentro.
 */
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

/**
 * Quantas conversas entrariam na régua no próximo ciclo.
 *
 * É o número que o estado honesto mostra enquanto a régua está desligada (hoje
 * 218). A consulta espelha a de `entrarNaRegua` — canal WhatsApp, conversa
 * ativa, não simulada, contato resolvido, silêncio entre 90 min e 7 dias, sem
 * linha na régua — e aplica o mesmo guarda de telefone da equipe. O `LIMIT`
 * daquele ciclo (`ENTRADAS_POR_CICLO`) NÃO conta aqui: a pergunta é o tamanho da
 * fila, não de onde a fila é cortada.
 */
export async function contarElegiveisParaRegua(agora: Date): Promise<number> {
	const candidatos = await db.execute<{ waId: string | null }>(sql`
		SELECT c.wa_id AS "waId"
		FROM conversations c
		WHERE c.channel = 'whatsapp'
		  AND c.status = 'active'
		  AND c.is_simulated = false
		  AND c.contact_id IS NOT NULL
		  AND c.last_inbound_at IS NOT NULL
		  AND c.last_inbound_at <= ${new Date(agora.getTime() - ESPERA_SILENCIO_MS).toISOString()}::timestamptz
		  AND c.last_inbound_at > ${new Date(agora.getTime() - JANELA_DE_ENTRADA_MS).toISOString()}::timestamptz
		  AND NOT EXISTS (SELECT 1 FROM remarketing_touches t WHERE t.conversation_id = c.id)
	`);

	let total = 0;
	for (const linha of candidatos.rows) {
		if (await ehDaEquipe(linha.waId ?? null)) continue;
		total += 1;
	}
	return total;
}
