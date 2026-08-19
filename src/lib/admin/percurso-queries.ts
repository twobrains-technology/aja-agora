/**
 * A leitura do PERCURSO: quem chegou pela campanha, pessoa a pessoa, e até onde
 * cada um foi. Server-only.
 *
 * Três regras atravessam o arquivo:
 *
 * 1. **Começa na VISITA, não na conversa.** É o que separa esta tela de
 *    `Conversas`: quem clicou no anúncio e nunca escreveu tem que aparecer, e
 *    partir de `conversations` o apagaria por construção.
 * 2. **Os critérios de degrau são os de `sinais-do-funil`**, os mesmos de
 *    `performance-queries`. Divergir aqui daria duas respostas para "viu
 *    oferta".
 * 3. **Uma linha por PESSOA.** A chave é o contato quando conhecido, senão o
 *    visitante — quem clicou três vezes no anúncio é um lead só.
 */

import { type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import { predicadoDeOrigemNaVisita } from "./filtro-origem";
import { origemDaVisita } from "./origem-label";
import {
	type FiltroPercurso,
	ORDEM_DOS_PASSOS,
	PASSOS_DO_PERCURSO,
	type PassoDoPercurso,
	type PercursoResponse,
	type PessoaDoPercurso,
	type ResumoDoPasso,
} from "./percurso-types";
import { ARTIFACTS_DE_OFERTA_SQL, VISITA_DE_GENTE } from "./sinais-do-funil";

/** Teto de linhas por página. Acima disso a tela deixa de ser lista e vira dump. */
const LIMITE_MAXIMO = 200;
const LIMITE_PADRAO = 50;

function num(valor: unknown): number {
	return Number(valor ?? 0) || 0;
}

function texto(valor: unknown): string | null {
	if (valor === null || valor === undefined) return null;
	const t = String(valor).trim();
	return t ? t : null;
}

function iso(valor: unknown): string {
	return new Date(valor as string).toISOString();
}

/** Profundidade (1..8) → o degrau que ela nomeia. */
function passoDaProfundidade(profundidade: number): PassoDoPercurso {
	const indice = Math.min(Math.max(profundidade, 1), ORDEM_DOS_PASSOS.length) - 1;
	return ORDEM_DOS_PASSOS[indice];
}

function profundidadeDoPasso(passo: PassoDoPercurso): number {
	return ORDEM_DOS_PASSOS.indexOf(passo) + 1;
}

/**
 * A CTE que monta uma linha por pessoa, com a profundidade já calculada.
 *
 * Sai como fragmento e não como query fechada porque duas leituras diferentes
 * precisam EXATAMENTE do mesmo conjunto: a página (filtrada por degrau) e a
 * escada do resumo (que ignora o degrau, porque é o denominador dela). Montar
 * duas vezes o mesmo SQL à mão é como as duas passam a discordar.
 */
function baseDoPercurso(filtro: FiltroPercurso): SQL {
	const origem = filtro.origem?.trim()
		? predicadoDeOrigemNaVisita(filtro.origem.trim(), filtro.campanha?.trim() || null)
		: null;
	// Chave desconhecida devolve `null` de propósito (ver `filtro-origem`): link
	// velho mostra a lista inteira, nunca uma lista vazia que pareceria "ninguém
	// veio daqui".
	const filtroOrigem = origem ? sql` AND ${origem}` : sql``;

	const busca = filtro.q?.trim();
	const filtroBusca = busca
		? sql` WHERE (lp.name ILIKE ${`%${busca}%`} OR lp.phone ILIKE ${`%${busca}%`}
        OR lp.email ILIKE ${`%${busca}%`})`
		: sql``;

	return sql`
    WITH visita AS (
      SELECT v.id, v.visitor_id, v.created_at, v.landing_path, v.channel,
             v.utm_source, v.utm_medium, v.utm_campaign, v.utm_content,
             v.ctwa_source_id, v.ctwa_headline, v.referrer
      FROM visits v
      WHERE v.created_at BETWEEN ${filtro.from} AND ${filtro.to}
        AND ${VISITA_DE_GENTE}${filtroOrigem}
    ),

    -- Os sinais de cada conversa nascida dessas visitas. Os mesmos EXISTS que o
    -- funil de mídia usa, um por fato, cada um lendo a tabela dona dele.
    conv AS (
      SELECT c.id, c.visit_id, c.contact_id, c.updated_at,
        (SELECT count(*) FROM messages m
          WHERE m.conversation_id = c.id AND m.role = 'user') AS msgs,
        (SELECT max(m.created_at) FROM messages m
          WHERE m.conversation_id = c.id AND m.role = 'user') AS ultimo_inbound,
        EXISTS (SELECT 1 FROM messages m
          WHERE m.conversation_id = c.id AND m.role = 'user') AS escreveu,
        EXISTS (SELECT 1 FROM leads l
          WHERE l.conversation_id = c.id AND l.is_simulated = false
            AND (l.phone IS NOT NULL OR l.email IS NOT NULL)) AS identificou,
        EXISTS (SELECT 1 FROM messages m
          JOIN artifacts a ON a.message_id = m.id
          WHERE m.conversation_id = c.id
            AND a.type IN (${ARTIFACTS_DE_OFERTA_SQL})) AS viu_oferta,
        EXISTS (SELECT 1 FROM bevi_proposals bp
          WHERE bp.conversation_id = c.id) AS teve_proposta,
        EXISTS (SELECT 1 FROM leads l
          WHERE l.conversation_id = c.id AND l.is_simulated = false
            AND l.stage = 'fechado_ganho') AS fechou
      FROM conversations c
      JOIN visita vi ON vi.id = c.visit_id
      WHERE c.is_simulated = false
    ),

    -- O contato do visitante, quando alguma conversa dele já o resolveu. É o que
    -- funde a chegada pela web e a pelo WhatsApp da MESMA pessoa numa linha só.
    identidade AS (
      SELECT DISTINCT ON (vi.visitor_id) vi.visitor_id, c.contact_id
      FROM visita vi
      JOIN conv c ON c.visit_id = vi.id
      WHERE c.contact_id IS NOT NULL
      ORDER BY vi.visitor_id, c.updated_at ASC
    ),

    por_visita AS (
      SELECT vi.*,
             COALESCE(id.contact_id::text, vi.visitor_id) AS chave,
             id.contact_id,
             EXISTS (SELECT 1 FROM page_events pe WHERE pe.visit_id = vi.id) AS olhou
      FROM visita vi
      LEFT JOIN identidade id ON id.visitor_id = vi.visitor_id
    ),

    -- A chegada que CREDITA a origem: a primeira que trouxe campanha; sem
    -- nenhuma, a primeira de todas. Quem viu o anúncio, entrou, e depois voltou
    -- digitando o endereço não deixou de ter vindo da mídia — creditar a volta
    -- direta apagaria da conta justamente o que foi pago. Mesma regra da ficha
    -- do contato.
    credito AS (
      SELECT DISTINCT ON (pv.chave)
             pv.chave, pv.landing_path, pv.channel, pv.utm_source, pv.utm_medium,
             pv.utm_campaign, pv.utm_content, pv.ctwa_source_id, pv.ctwa_headline,
             pv.referrer
      FROM por_visita pv
      ORDER BY pv.chave,
               (pv.utm_source IS NULL AND pv.ctwa_source_id IS NULL
                AND pv.ctwa_headline IS NULL) ASC,
               pv.created_at ASC
    ),

    pessoa AS (
      SELECT pv.chave,
             min(pv.contact_id::text) AS contact_id,
             (array_agg(pv.visitor_id ORDER BY pv.created_at))[1] AS visitor_id,
             count(*) AS chegadas,
             min(pv.created_at) AS primeira_chegada,
             max(pv.created_at) AS ultima_chegada,
             bool_or(pv.olhou) AS olhou
      FROM por_visita pv
      GROUP BY pv.chave
    ),

    conv_pessoa AS (
      SELECT pv.chave,
             count(DISTINCT c.id) AS conversas,
             COALESCE(sum(c.msgs), 0) AS msgs,
             max(c.ultimo_inbound) AS ultimo_inbound,
             bool_or(c.escreveu) AS escreveu,
             bool_or(c.identificou) AS identificou,
             bool_or(c.viu_oferta) AS viu_oferta,
             bool_or(c.teve_proposta) AS teve_proposta,
             bool_or(c.fechou) AS fechou
      FROM por_visita pv
      JOIN conv c ON c.visit_id = pv.id
      GROUP BY pv.chave
    ),

    -- A conversa que a linha abre: a que se mexeu por último.
    conversa_recente AS (
      SELECT DISTINCT ON (pv.chave) pv.chave, c.id AS conversation_id
      FROM por_visita pv
      JOIN conv c ON c.visit_id = pv.id
      ORDER BY pv.chave, c.updated_at DESC
    ),

    -- O lead que representa a pessoa. Perdido vai por último de propósito: entre
    -- um lead vivo e um perdido, quem manda na tela é o vivo. Entre dois vivos,
    -- a raia mais avançada (a ordem do enum lead_stage é a do funil).
    lead_pessoa AS (
      SELECT DISTINCT ON (pv.chave) pv.chave, l.name, l.phone, l.email, l.stage
      FROM por_visita pv
      JOIN conv c ON c.visit_id = pv.id
      JOIN leads l ON l.conversation_id = c.id AND l.is_simulated = false
      ORDER BY pv.chave, (l.stage = 'perdido') ASC, l.stage DESC, l.created_at DESC
    ),

    -- A identidade RESOLVIDA da pessoa. Vem antes do lead de propósito: o
    -- leads.name é o que o agente captou naquela conversa, e o mesmo cliente
    -- pode ter deixado nomes diferentes em conversas diferentes. Quando existe
    -- contato unificado, ele é quem a pessoa é — e é o nome que a ficha abre.
    -- Sem isto a linha dizia "Beatriz" e o painel abria "Kairo" (visto na tela
    -- em 18/08/2026), o que faz o operador desconfiar do painel inteiro.
    contato AS (
      SELECT p.chave, ct.name, ct.phone, ct.email
      FROM pessoa p
      JOIN contacts ct ON ct.id = p.contact_id::uuid
    ),

    final AS (
      SELECT p.chave, p.contact_id, p.visitor_id, p.chegadas, p.primeira_chegada,
             GREATEST(p.ultima_chegada,
                      COALESCE(cp.ultimo_inbound, p.ultima_chegada)) AS ultima_atividade,
             cr.landing_path, cr.channel, cr.utm_source, cr.utm_medium, cr.utm_campaign,
             cr.utm_content, cr.ctwa_source_id, cr.ctwa_headline, cr.referrer,
             COALESCE(cp.conversas, 0) AS conversas,
             COALESCE(cp.msgs, 0) AS msgs,
             conv_r.conversation_id,
             COALESCE(ct.name, lp.name) AS name,
             COALESCE(ct.phone, lp.phone) AS phone,
             COALESCE(ct.email, lp.email) AS email,
             lp.stage,
             CASE
               WHEN COALESCE(cp.fechou, false) THEN 8
               WHEN COALESCE(cp.teve_proposta, false) THEN 7
               WHEN COALESCE(cp.viu_oferta, false) THEN 6
               WHEN COALESCE(cp.identificou, false) THEN 5
               WHEN COALESCE(cp.escreveu, false) THEN 4
               WHEN COALESCE(cp.conversas, 0) > 0 THEN 3
               WHEN p.olhou THEN 2
               ELSE 1
             END AS profundidade
      FROM pessoa p
      JOIN credito cr ON cr.chave = p.chave
      LEFT JOIN conv_pessoa cp ON cp.chave = p.chave
      LEFT JOIN conversa_recente conv_r ON conv_r.chave = p.chave
      LEFT JOIN lead_pessoa lp ON lp.chave = p.chave
      LEFT JOIN contato ct ON ct.chave = p.chave
    ),

    filtrado AS (
      SELECT * FROM final lp${filtroBusca}
    )
  `;
}

/** A condição do degrau, conforme o modo de leitura escolhido. */
function condicaoDoPasso(filtro: FiltroPercurso): SQL {
	if (!filtro.passo) return sql``;
	const alvo = profundidadeDoPasso(filtro.passo);
	return filtro.modo === "alcancou"
		? sql` WHERE profundidade >= ${alvo}`
		: sql` WHERE profundidade = ${alvo}`;
}

/**
 * A lista de pessoas e a escada do período.
 *
 * Duas leituras sobre a MESMA base: a página (que respeita o degrau escolhido)
 * e a escada (que o ignora de propósito — filtrada, ela mostraria um degrau só
 * e a lista perderia o denominador que lhe dá sentido).
 */
export async function listarPercurso(filtro: FiltroPercurso): Promise<PercursoResponse> {
	const limit = Math.min(Math.max(filtro.limit ?? LIMITE_PADRAO, 1), LIMITE_MAXIMO);
	const offset = Math.max(filtro.offset ?? 0, 0);
	const base = baseDoPercurso(filtro);

	const [linhas, escada] = await Promise.all([
		db.execute<Record<string, unknown>>(sql`
      ${base}
      SELECT *, count(*) OVER () AS total_filtrado
      FROM filtrado${condicaoDoPasso(filtro)}
      -- Desempate pela chave: sem ele duas pessoas com o mesmo instante podem
      -- trocar de lugar entre uma página e a seguinte, e a mesma linha aparece
      -- duas vezes (ou some).
      ORDER BY ultima_atividade DESC, chave ASC
      LIMIT ${limit} OFFSET ${offset}
    `),
		db.execute<Record<string, unknown>>(sql`
      ${base}
      SELECT profundidade, count(*) AS pessoas, COALESCE(sum(chegadas), 0) AS chegadas
      FROM filtrado GROUP BY profundidade
    `),
	]);

	const pessoasPorProfundidade = new Map<number, number>();
	let totalDePessoas = 0;
	let totalDeChegadas = 0;
	for (const linha of escada.rows) {
		const pessoas = num(linha.pessoas);
		pessoasPorProfundidade.set(num(linha.profundidade), pessoas);
		totalDePessoas += pessoas;
		totalDeChegadas += num(linha.chegadas);
	}

	const resumo: ResumoDoPasso[] = PASSOS_DO_PERCURSO.map((passo, indice) => ({
		chave: passo.chave,
		label: passo.label,
		ajuda: passo.ajuda,
		pessoas: pessoasPorProfundidade.get(indice + 1) ?? 0,
	}));

	const pessoas: PessoaDoPercurso[] = linhas.rows.map((linha) => {
		const origem = origemDaVisita({
			utmSource: texto(linha.utm_source),
			utmMedium: texto(linha.utm_medium),
			utmCampaign: texto(linha.utm_campaign),
			utmContent: texto(linha.utm_content),
			ctwaSourceId: texto(linha.ctwa_source_id),
			ctwaHeadline: texto(linha.ctwa_headline),
			referrer: texto(linha.referrer),
		});
		const stage = texto(linha.stage);

		return {
			chave: String(linha.chave),
			contactId: texto(linha.contact_id),
			visitorId: String(linha.visitor_id),
			nome: texto(linha.name),
			telefone: texto(linha.phone),
			email: texto(linha.email),
			canal: linha.channel === "whatsapp" ? "whatsapp" : "web",
			origemLabel: origem.label,
			origemTipo: origem.tipo,
			origemFonte: origem.fonte,
			campanha: origem.campanha,
			criativo: origem.criativo,
			landingPath: texto(linha.landing_path),
			primeiraChegada: iso(linha.primeira_chegada),
			ultimaAtividade: iso(linha.ultima_atividade),
			chegadas: num(linha.chegadas),
			conversas: num(linha.conversas),
			mensagensDoCliente: num(linha.msgs),
			passo: passoDaProfundidade(num(linha.profundidade)),
			stageDoLead: stage,
			perdido: stage === "perdido",
			conversationId: texto(linha.conversation_id),
		};
	});

	return {
		pessoas,
		total: num(linhas.rows[0]?.total_filtrado),
		resumo,
		totalDePessoas,
		totalDeChegadas,
	};
}
