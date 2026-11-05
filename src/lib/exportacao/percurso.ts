/**
 * EXPORTAR PERCURSO — uma linha por PESSOA.
 *
 * Evolui `scripts/exportar-percurso-prod.mjs` para dentro do módulo (o script
 * era um CSV manual, com o SQL embutido e sem "vínculo ausente" declarado).
 * A query é a mesma, com duas mudanças que o pedido do Gustavo exige:
 *
 *   1. **Vazio sai escrito.** O script deixava a célula em branco quando não
 *      havia contato, nome, telefone, e-mail ou conversa; aqui cada ausência
 *      vira texto de `textos.ts`.
 *   2. **Janela e mascaramento são parâmetros**, não constantes do arquivo.
 *
 * Quem chegou e **não** falou continua aparecendo (`incluirSemConversa`, padrão
 * `true`): é a metade do problema que a exportação existe para mostrar, e o
 * pedido pede explicitamente "incluir quem não virou lead, quem interrompeu".
 */

import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
	ORDEM_DOS_PASSOS,
	PASSOS_DO_PERCURSO,
	type PassoDoPercurso,
} from "@/lib/admin/percurso-types";
import { conversaIdentificada } from "@/lib/admin/sinais-do-funil";
import { isoDeSaoPaulo } from "./conversas";
import type { LinhaExportada } from "./formato";
import { mascararEmail, mascararNome, mascararTelefone } from "./mascarar";
import {
	INDISPONIVEL_EMAIL,
	INDISPONIVEL_NOME,
	INDISPONIVEL_TELEFONE,
	listaDeIndisponiveis,
	SEM_RESULTADO_COMERCIAL,
	SEM_VINCULO_SEM_CONTATO,
	SEM_VINCULO_VISITA_SEM_ORIGEM,
} from "./textos";

export interface OpcoesDePercurso {
	de: Date;
	ate: Date;
	/** `true` (padrão) mascara telefone, e-mail e nome. */
	mascarar?: boolean;
	/** Padrão `true`: inclui a visita sem conversa (quem não virou lead). */
	incluirSemConversa?: boolean;
}

interface LinhaCrua extends Record<string, unknown> {
	contato_id: string | null;
	visitor_id: string;
	name: string | null;
	email: string | null;
	phone: string | null;
	channel: string | null;
	utm_source: string | null;
	utm_medium: string | null;
	utm_campaign: string | null;
	utm_content: string | null;
	ctwa_source_id: string | null;
	ctwa_headline: string | null;
	referrer: string | null;
	landing_path: string | null;
	first_arrival: string;
	last_activity: string;
	arrivals: number | string;
	conversations: number | string;
	customer_messages: number | string;
	profundidade: number | string;
	stage: string | null;
	conversation_id: string | null;
}

function rotuloDaProfundidade(profundidade: number): PassoDoPercurso {
	const indice = Math.min(Math.max(profundidade, 1), ORDEM_DOS_PASSOS.length) - 1;
	return ORDEM_DOS_PASSOS[indice];
}

/** A legenda legível do degrau — o pedido é lido por gente, não só por script. */
function legendaDoPasso(passo: PassoDoPercurso): string {
	return PASSOS_DO_PERCURSO.find((p) => p.chave === passo)?.label ?? passo;
}

function ouIndisponivel(valor: unknown, campo: string): string {
	const t = valor === null || valor === undefined ? null : String(valor).trim();
	return t ? t : `indisponível: ${campo} não informado`;
}

export async function exportarPercurso(opcoes: OpcoesDePercurso): Promise<LinhaExportada[]> {
	const mascara = opcoes.mascarar ?? true;
	const incluirSemConversa = opcoes.incluirSemConversa ?? true;
	// Sem conversa não há conversa para exigir — o filtro só faz sentido quando o
	// chamador pediu para excluir quem não falou.
	const filtroConversa = incluirSemConversa ? sql`` : sql` WHERE cr.chave IS NOT NULL`;

	const { rows } = await db.execute<LinhaCrua>(sql`
    WITH visita AS (
      SELECT v.*, NOT EXISTS (
        SELECT 1 FROM visits eco WHERE eco.visitor_id = v.visitor_id
          AND eco.created_at < v.created_at AND v.created_at - eco.created_at < interval '2 seconds'
      ) AS conta_como_chegada
      FROM visits v
      WHERE v.created_at BETWEEN ${opcoes.de} AND ${opcoes.ate}
        AND (EXISTS (SELECT 1 FROM conversations cg WHERE cg.visit_id = v.id AND cg.is_simulated = false)
          OR (v.user_agent IS NOT NULL AND v.user_agent !~* '(ELB-HealthChecker|facebookexternalhit|python-requests|HeadlessChrome|crawler|spider|curl|wget|bot)([^a-z]|$)'))
    ),
    por_visita AS (
      SELECT vi.*,
        COALESCE((SELECT c.contact_id::text FROM conversations c JOIN visits vp ON vp.id = c.visit_id
          WHERE vp.visitor_id = vi.visitor_id AND c.contact_id IS NOT NULL AND c.is_simulated = false
          ORDER BY c.updated_at ASC LIMIT 1), vi.visitor_id) AS chave
      FROM visita vi
    ),
    credito AS (
      SELECT DISTINCT ON (chave) chave, landing_path, channel, utm_source, utm_medium, utm_campaign,
        utm_content, ctwa_source_id, ctwa_headline, referrer
      FROM por_visita
      ORDER BY chave, (utm_source IS NULL AND ctwa_source_id IS NULL AND ctwa_headline IS NULL) ASC, created_at ASC
    ),
    pessoa AS (
      SELECT chave,
        min(NULLIF(chave, visitor_id)) AS contact_id,
        (array_agg(visitor_id ORDER BY created_at))[1] AS visitor_id,
        count(*) FILTER (WHERE conta_como_chegada) AS arrivals,
        min(created_at) AS first_arrival,
        max(created_at) AS last_visit,
        bool_or(EXISTS (SELECT 1 FROM page_events pe WHERE pe.visit_id = id AND pe.type IN ('click','rage_click','scroll_depth'))) AS olhou,
        bool_or(EXISTS (SELECT 1 FROM page_events pe WHERE pe.visit_id = id AND pe.type = 'chat_open')) AS abriu_teatro
      FROM por_visita GROUP BY chave
    ),
    conv AS (
      SELECT c.id, c.visit_id, c.updated_at,
        (SELECT count(*) FROM messages m WHERE m.conversation_id = c.id AND m.role = 'user') AS msgs,
        (SELECT max(m.created_at) FROM messages m WHERE m.conversation_id = c.id AND m.role = 'user') AS ultimo_inbound,
        EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.role = 'user') AS escreveu,
        ${conversaIdentificada(sql`c`)} AS identificou,
        EXISTS (SELECT 1 FROM messages m JOIN artifacts a ON a.message_id = m.id WHERE m.conversation_id = c.id AND a.type IN ('real_offer','simulation_result')) AS viu_oferta,
        EXISTS (SELECT 1 FROM bevi_proposals bp WHERE bp.conversation_id = c.id) AS teve_proposta,
        EXISTS (SELECT 1 FROM leads l WHERE l.conversation_id = c.id AND l.is_simulated = false AND l.stage = 'fechado_ganho') AS fechou
      FROM conversations c JOIN visita vi ON vi.id = c.visit_id WHERE c.is_simulated = false
    ),
    conv_pessoa AS (
      SELECT pv.chave, count(DISTINCT c.id) AS conversations, COALESCE(sum(c.msgs),0) AS customer_messages,
        max(c.ultimo_inbound) AS ultimo_inbound, bool_or(c.escreveu) AS escreveu, bool_or(c.identificou) AS identificou,
        bool_or(c.viu_oferta) AS viu_oferta, bool_or(c.teve_proposta) AS teve_proposta, bool_or(c.fechou) AS fechou
      FROM por_visita pv JOIN conv c ON c.visit_id = pv.id GROUP BY pv.chave
    ),
    conversa_recente AS (
      SELECT DISTINCT ON (pv.chave) pv.chave, c.id AS conversation_id
      FROM por_visita pv JOIN conv c ON c.visit_id = pv.id ORDER BY pv.chave, c.updated_at DESC
    ),
    lead_pessoa AS (
      SELECT DISTINCT ON (pv.chave) pv.chave, l.name, l.phone, l.email, l.stage
      FROM por_visita pv JOIN conv c ON c.visit_id = pv.id JOIN leads l ON l.conversation_id = c.id AND l.is_simulated = false
      ORDER BY pv.chave, (l.stage = 'perdido') ASC, l.stage DESC, l.created_at DESC
    ),
    contato AS (
      SELECT p.chave, ct.name, ct.phone, ct.email FROM pessoa p JOIN contacts ct ON ct.id::text = p.contact_id
    ),
    final AS (
      SELECT p.contact_id, p.visitor_id, COALESCE(ct.name, lp.name) AS name, COALESCE(ct.email, lp.email) AS email,
        COALESCE(ct.phone, lp.phone) AS phone, cr.channel, cr.utm_source, cr.utm_medium, cr.utm_campaign, cr.utm_content,
        cr.ctwa_source_id, cr.ctwa_headline, cr.referrer, cr.landing_path, p.first_arrival,
        GREATEST(p.last_visit, COALESCE(cp.ultimo_inbound, p.last_visit)) AS last_activity, p.arrivals,
        COALESCE(cp.conversations,0) AS conversations, COALESCE(cp.customer_messages,0) AS customer_messages,
        CASE WHEN COALESCE(cp.fechou,false) THEN 8 WHEN COALESCE(cp.teve_proposta,false) THEN 7
          WHEN COALESCE(cp.viu_oferta,false) THEN 6 WHEN COALESCE(cp.identificou,false) THEN 5
          WHEN COALESCE(cp.escreveu,false) THEN 4 WHEN COALESCE(cp.conversations,0) > 0 OR p.abriu_teatro THEN 3
          WHEN p.olhou THEN 2 ELSE 1 END AS profundidade,
        lp.stage, rc.conversation_id
      FROM pessoa p JOIN credito cr ON cr.chave = p.chave LEFT JOIN conv_pessoa cp ON cp.chave = p.chave
      LEFT JOIN conversa_recente rc ON rc.chave = p.chave LEFT JOIN lead_pessoa lp ON lp.chave = p.chave
      LEFT JOIN contato ct ON ct.chave = p.chave
    )
    SELECT * FROM final${filtroConversa} ORDER BY last_activity DESC, visitor_id ASC
  `);

	return rows.map((linha) => {
		const motivos: string[] = [];
		const contatoId = linha.contato_id ? String(linha.contato_id) : null;
		if (!contatoId) motivos.push(SEM_VINCULO_SEM_CONTATO);

		const nome = mascara ? mascararNome(linha.name) : linha.name;
		const telefone = mascara ? mascararTelefone(linha.phone) : linha.phone;
		const email = mascara ? mascararEmail(linha.email) : linha.email;
		if (!linha.name) motivos.push(INDISPONIVEL_NOME);
		if (!linha.phone) motivos.push(INDISPONIVEL_TELEFONE);
		if (!linha.email) motivos.push(INDISPONIVEL_EMAIL);

		const semOrigem =
			!linha.utm_source && !linha.utm_medium && !linha.utm_campaign && !linha.ctwa_source_id;
		if (semOrigem) motivos.push(SEM_VINCULO_VISITA_SEM_ORIGEM);

		const profundidade = Number(linha.profundidade ?? 1) || 1;
		const passo = rotuloDaProfundidade(profundidade);
		const conversaId = linha.conversation_id ? String(linha.conversation_id) : null;
		if (!conversaId) motivos.push("sem vínculo: pessoa sem conversa");

		const etapaDoLead = linha.stage ? String(linha.stage) : SEM_RESULTADO_COMERCIAL;
		if (!linha.stage) motivos.push(SEM_RESULTADO_COMERCIAL);

		const origemCampo = (valor: string | null, campo: string): string =>
			semOrigem ? `${SEM_VINCULO_VISITA_SEM_ORIGEM} (${campo})` : ouIndisponivel(valor, campo);

		return {
			contatoId: contatoId ?? SEM_VINCULO_SEM_CONTATO,
			visitanteId: String(linha.visitor_id),
			nome: nome ?? INDISPONIVEL_NOME,
			telefone: telefone ?? INDISPONIVEL_TELEFONE,
			email: email ?? INDISPONIVEL_EMAIL,
			canal: ouIndisponivel(linha.channel, "canal"),
			origemFonte: origemCampo(linha.utm_source, "utm_source"),
			origemMeio: origemCampo(linha.utm_medium, "utm_medium"),
			origemCampanha: origemCampo(linha.utm_campaign, "utm_campaign"),
			origemConteudo: origemCampo(linha.utm_content, "utm_content"),
			ctwaSourceId: ouIndisponivel(linha.ctwa_source_id, "ctwa_source_id"),
			ctwaHeadline: ouIndisponivel(linha.ctwa_headline, "ctwa_headline"),
			referrer: ouIndisponivel(linha.referrer, "referrer"),
			landingPath: ouIndisponivel(linha.landing_path, "landing_path"),
			primeiraChegada: isoDeSaoPaulo(linha.first_arrival),
			ultimaAtividade: isoDeSaoPaulo(linha.last_activity),
			chegadas: String(linha.arrivals ?? 0),
			conversas: String(linha.conversations ?? 0),
			mensagensDoCliente: String(linha.customer_messages ?? 0),
			passo,
			passoRotulo: legendaDoPasso(passo),
			etapaDoLead,
			conversaId: conversaId ?? "sem vínculo: pessoa sem conversa",
			dadosIndisponiveis: listaDeIndisponiveis(motivos),
		};
	});
}

/** Contagem barata para o cartão da tela. */
export async function contarPercurso(opcoes: {
	de: Date;
	ate: Date;
	incluirSemConversa?: boolean;
}): Promise<{ pessoas: number }> {
	const incluirSemConversa = opcoes.incluirSemConversa ?? true;
	const filtroConversa = incluirSemConversa
		? sql``
		: sql` AND EXISTS (SELECT 1 FROM conversations c WHERE c.visit_id = v.id AND c.is_simulated = false)`;
	const { rows } = await db.execute<{ pessoas: string | number }>(sql`
    SELECT count(DISTINCT COALESCE(
      (SELECT c.contact_id::text FROM conversations c JOIN visits vp ON vp.id = c.visit_id
        WHERE vp.visitor_id = v.visitor_id AND c.contact_id IS NOT NULL AND c.is_simulated = false
        ORDER BY c.updated_at ASC LIMIT 1),
      v.visitor_id)) AS pessoas
    FROM visits v
    WHERE v.created_at BETWEEN ${opcoes.de} AND ${opcoes.ate}${filtroConversa}
      AND (EXISTS (SELECT 1 FROM conversations cg WHERE cg.visit_id = v.id AND cg.is_simulated = false)
        OR (v.user_agent IS NOT NULL AND v.user_agent !~* '(ELB-HealthChecker|facebookexternalhit|python-requests|HeadlessChrome|crawler|spider|curl|wget|bot)([^a-z]|$)'))
  `);
	return { pessoas: Number(rows[0]?.pessoas ?? 0) };
}
