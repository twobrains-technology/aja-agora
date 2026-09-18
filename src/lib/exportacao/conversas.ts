/**
 * EXPORTAR CONVERSAS — uma linha por MENSAGEM.
 *
 * É o gap central do pedido do Gustavo (briefing, AJA-16): o export que existia
 * entregava **uma linha por pessoa** (`exportar-percurso-prod.mjs`), agregada —
 * e o pedido exige o **histórico mensagem a mensagem, em ordem cronológica e com
 * autoria**. Sem isso a growth não consegue ler a conversa como ela foi, que é o
 * que o experimento de teste A/B quer medir.
 *
 * Três regras herdadas do pedido, e onde cada uma mora:
 *
 *   1. **Autoria por linha** — `role` + `persona_id` + a nota `[sistema]`. A
 *      distinção agente × atendente NÃO é reimplementada: usa `ehFalaDaMesa`,
 *      a mesma função que a acolhida N1 usa. Dois predicados para "a mesa
 *      falou" seriam duas respostas para a mesma pergunta.
 *   2. **Etapa no momento da mensagem** — `etapa_no_momento` é o último
 *      `lead_events.to_stage` com `created_at <= mensagem`. É o histórico de
 *      etapas que o pedido chama de "como cada etapa aconteceu", e é
 *      append-only, então a pergunta tem resposta exata.
 *   3. **Vazio sai escrito** — todo `null` vira texto de `textos.ts`.
 *      `paraCsv`/`paraJson` transformam a regra em invariante (lançam).
 */

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ehFalaDaMesa } from "@/lib/mesa/acolhida-n1";
import type { LinhaExportada } from "./formato";
import {
	listaDeIndisponiveis,
	NAO_ESTRUTURADO_EXPERIMENTO,
	NAO_ESTRUTURADO_VERSAO,
	SEM_ETAPA_REGISTRADA,
	SEM_RESULTADO_COMERCIAL,
	SEM_VINCULO_FORA_DA_REGUA,
	SEM_VINCULO_SEM_CONTATO,
	SEM_VINCULO_SEM_LEAD,
	SEM_VINCULO_SEM_VISITA,
	SEM_VINCULO_VISITA_SEM_ORIGEM,
} from "./textos";

export interface OpcoesDeConversas {
	de: Date;
	ate: Date;
	/** `true` (padrão) mascara telefone, e-mail e nome. */
	mascarar?: boolean;
	/** Restringe a conversas específicas (usado pelo lote de validação). */
	conversationIds?: string[];
	/** Trava no N conversas com mensagem mais recente na janela. */
	limiteConversas?: number;
}

/** Autoria como o pedido quer: cliente, agente, atendente ou sistema. */
export function autoriaDe(mensagem: {
	role: string;
	personaId: string | null;
	content: string;
}): "cliente" | "agente" | "atendente" | "sistema" {
	if (mensagem.role === "user") return "cliente";
	if (mensagem.role === "system") return "sistema";
	// role = assistant daqui para baixo.
	if (ehFalaDaMesa(mensagem)) return "atendente";
	if (mensagem.personaId) return "agente";
	// assistant sem persona e sem ser fala humana = nota `[sistema]` do servidor.
	return "sistema";
}

/** Tipo da mensagem. Card vence texto; template vence tudo (foi disparo da Meta). */
export function tipoDe(mensagem: {
	mediaType: string | null;
	templateName: string | null;
	artifactType: string | null;
}): "texto" | "audio" | "imagem" | "documento" | "template" | "card" {
	if (mensagem.templateName) return "template";
	if (mensagem.mediaType === "audio") return "audio";
	if (mensagem.mediaType === "image") return "imagem";
	if (mensagem.mediaType === "document") return "documento";
	if (mensagem.artifactType) return "card";
	return "texto";
}

const ISO_SP = new Intl.DateTimeFormat("sv-SE", {
	timeZone: "America/Sao_Paulo",
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
	second: "2-digit",
	hour12: false,
});

/** ISO com o fuso de São Paulo (`2026-09-10T14:03:11-03:00`). */
export function isoDeSaoPaulo(valor: unknown): string {
	const data = new Date(valor as string);
	// `sv-SE` entrega "YYYY-MM-DD HH:mm:ss", que é ISO a um replace de distância.
	const local = ISO_SP.format(data).replace(" ", "T");
	// São Paulo não tem mais horário de verão (desde 2019), então o deslocamento
	// é fixo. Derivar do runtime exigiria convertê-lo de volta e abriria a porta
	// para a exportação mentir o fuso em um dia-limite.
	return `${local}-03:00`;
}

function texto(valor: unknown): string | null {
	if (valor === null || valor === undefined) return null;
	const t = String(valor).trim();
	return t ? t : null;
}

interface LinhaCrua extends Record<string, unknown> {
	conversa_id: string;
	contato_id: string | null;
	lead_id: string | null;
	canal: string;
	tem_visita: boolean;
	utm_source: string | null;
	utm_medium: string | null;
	utm_campaign: string | null;
	utm_content: string | null;
	msg_id: string;
	role: string;
	persona_id: string | null;
	content: string;
	media_type: string | null;
	template_name: string | null;
	artifact_type: string | null;
	created_at: string;
	ordem: string | number;
	etapa_no_momento: string | null;
	etapa_final: string | null;
	etapa_comercial: string | null;
	remarketing_status: string | null;
	remarketing_passo: number | null;
}

export async function exportarConversas(opcoes: OpcoesDeConversas): Promise<LinhaExportada[]> {
	// Este recorte não carrega telefone, e-mail nem nome — só ids. O mascaramento
	// é (e continua) o padrão do módulo, aplicado onde há PII (percurso e toques).
	const ids = (opcoes.conversationIds ?? []).filter(Boolean);
	const filtroIds =
		ids.length > 0
			? sql` AND c.id IN (${sql.join(
					ids.map((id) => sql`${id}::uuid`),
					sql`, `,
				)})`
			: sql``;
	const filtroLimite =
		opcoes.limiteConversas && opcoes.limiteConversas > 0
			? sql` LIMIT ${opcoes.limiteConversas}`
			: sql``;

	const { rows } = await db.execute<LinhaCrua>(sql`
    WITH janela AS (
      SELECT m.conversation_id,
             max(m.created_at) AS ultima
      FROM messages m
      WHERE m.created_at BETWEEN ${opcoes.de} AND ${opcoes.ate}
      GROUP BY m.conversation_id
    ),
    alvo AS (
      SELECT c.id, c.visit_id, c.contact_id, c.channel
      FROM conversations c
      JOIN janela j ON j.conversation_id = c.id
      WHERE c.is_simulated = false${filtroIds}
      ORDER BY j.ultima DESC
      ${filtroLimite}
    )
    SELECT
      c.id AS conversa_id,
      c.contact_id::text AS contato_id,
      ld.id::text AS lead_id,
      c.channel AS canal,
      (c.visit_id IS NOT NULL) AS tem_visita,
      v.utm_source, v.utm_medium, v.utm_campaign, v.utm_content,
      m.id::text AS msg_id,
      m.role, m.persona_id, m.content, m.media_type, m.template_name,
      m.created_at,
      (SELECT count(*) FROM messages m2
        WHERE m2.conversation_id = c.id AND m2.created_at <= m.created_at) AS ordem,
      etapa.to_stage AS etapa_no_momento,
      final_etapa.to_stage AS etapa_final,
      ld.stage AS etapa_comercial,
      rt.status AS remarketing_status,
      rt.step AS remarketing_passo,
      (SELECT a.type FROM artifacts a WHERE a.message_id = m.id
        ORDER BY a.created_at ASC LIMIT 1) AS artifact_type
    FROM alvo c
    JOIN messages m ON m.conversation_id = c.id
      AND m.created_at BETWEEN ${opcoes.de} AND ${opcoes.ate}
    LEFT JOIN visits v ON v.id = c.visit_id
    -- O lead que representa a conversa: vivo antes de perdido, raia mais
    -- avançada antes da menos (a ordem do enum é a do funil).
    LEFT JOIN LATERAL (
      SELECT l.id, l.stage, l.name, l.phone, l.email
      FROM leads l
      WHERE l.conversation_id = c.id AND l.is_simulated = false
      ORDER BY (l.stage = 'perdido') ASC, l.stage DESC, l.created_at DESC
      LIMIT 1
    ) ld ON true
    -- Etapa NO MOMENTO da mensagem: o último evento até ela.
    LEFT JOIN LATERAL (
      SELECT le.to_stage
      FROM lead_events le
      WHERE le.lead_id = ld.id AND le.created_at <= m.created_at
      ORDER BY le.created_at DESC
      LIMIT 1
    ) etapa ON true
    -- Etapa FINAL: o último evento da conversa, independente da mensagem.
    LEFT JOIN LATERAL (
      SELECT le.to_stage
      FROM lead_events le
      WHERE le.lead_id = ld.id
      ORDER BY le.created_at DESC
      LIMIT 1
    ) final_etapa ON true
    LEFT JOIN remarketing_touches rt ON rt.conversation_id = c.id
    ORDER BY c.id, m.created_at, m.id
  `);

	return rows.map((linha) => {
		const temVisita = linha.tem_visita === true;
		const motivos: string[] = [];

		const origem = (valor: string | null, nomeDoCampo: string): string => {
			if (!temVisita) {
				motivos.push(SEM_VINCULO_SEM_VISITA);
				return SEM_VINCULO_SEM_VISITA;
			}
			const t = texto(valor);
			if (t) return t;
			motivos.push(SEM_VINCULO_VISITA_SEM_ORIGEM);
			return `${SEM_VINCULO_VISITA_SEM_ORIGEM} (${nomeDoCampo})`;
		};

		const contatoId = texto(linha.contato_id);
		if (!contatoId) motivos.push(SEM_VINCULO_SEM_CONTATO);
		const leadId = texto(linha.lead_id);
		if (!leadId) motivos.push(SEM_VINCULO_SEM_LEAD);

		const experimento = texto(linha.utm_campaign) ?? NAO_ESTRUTURADO_EXPERIMENTO;
		const versao = texto(linha.utm_content) ?? NAO_ESTRUTURADO_VERSAO;
		const etapaFinal = texto(linha.etapa_final) ?? SEM_ETAPA_REGISTRADA;
		const etapaComercial = texto(linha.etapa_comercial) ?? SEM_RESULTADO_COMERCIAL;
		const foraDaRegua = linha.remarketing_status === null;

		if (linha.etapa_no_momento === null) motivos.push(SEM_ETAPA_REGISTRADA);
		if (foraDaRegua) motivos.push(SEM_VINCULO_FORA_DA_REGUA);

		const conteudo = texto(linha.content) ?? "indisponível: mensagem sem conteúdo";

		return {
			conversaId: linha.conversa_id,
			contatoId: contatoId ?? SEM_VINCULO_SEM_CONTATO,
			leadId: leadId ?? SEM_VINCULO_SEM_LEAD,
			canal: linha.canal,
			origemFonte: origem(linha.utm_source, "utm_source"),
			origemMeio: origem(linha.utm_medium, "utm_medium"),
			origemCampanha: origem(linha.utm_campaign, "utm_campaign"),
			origemConteudo: origem(linha.utm_content, "utm_content"),
			experimento,
			versao,
			msgId: linha.msg_id,
			ordem: String(linha.ordem),
			autoria: autoriaDe({
				role: linha.role,
				personaId: linha.persona_id,
				content: linha.content,
			}),
			tipo: tipoDe({
				mediaType: linha.media_type,
				templateName: linha.template_name,
				artifactType: linha.artifact_type,
			}),
			conteudo,
			criadoEm: isoDeSaoPaulo(linha.created_at),
			etapaNoMomento: texto(linha.etapa_no_momento) ?? SEM_ETAPA_REGISTRADA,
			etapaFinal,
			resultadoComercial: etapaComercial,
			remarketingStatus: linha.remarketing_status ?? SEM_VINCULO_FORA_DA_REGUA,
			remarketingPasso: foraDaRegua
				? SEM_VINCULO_FORA_DA_REGUA
				: String(linha.remarketing_passo ?? 0),
			dadosIndisponiveis: listaDeIndisponiveis(motivos),
		};
	});
}

/** Contagem barata para o cartão da tela — não materializa as linhas. */
export async function contarConversas(opcoes: {
	de: Date;
	ate: Date;
	conversationIds?: string[];
}): Promise<{ mensagens: number; conversas: number }> {
	const ids = (opcoes.conversationIds ?? []).filter(Boolean);
	const filtroIds =
		ids.length > 0
			? sql` AND c.id IN (${sql.join(
					ids.map((id) => sql`${id}::uuid`),
					sql`, `,
				)})`
			: sql``;
	const { rows } = await db.execute<{ mensagens: string | number; conversas: string | number }>(sql`
    SELECT count(*) AS mensagens, count(DISTINCT m.conversation_id) AS conversas
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.is_simulated = false
      AND m.created_at BETWEEN ${opcoes.de} AND ${opcoes.ate}${filtroIds}
  `);
	return {
		mensagens: Number(rows[0]?.mensagens ?? 0),
		conversas: Number(rows[0]?.conversas ?? 0),
	};
}
