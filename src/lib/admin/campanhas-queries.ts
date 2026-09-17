/**
 * A tela de CAMPANHAS — o funil do CRM com o gasto do gerenciador ao lado.
 *
 * ## O que esta tela é, e o que ela NÃO é
 *
 * Ela é o `computeOrigens` com `GROUP BY campanha` e o gasto da Meta encostado na
 * linha. **Não existe uma segunda definição de funil aqui**: as etapas saem das
 * MESMAS tabelas, com os MESMOS cortes de `sinais-do-funil` que a tela de
 * Performance usa (visita de gente, visita que não é eco, conversa não simulada).
 * Duas contagens de funil divergem no primeiro dia — e a que o time acreditasse
 * seria a última que abriu. Há teste de integração amarrando as duas somas.
 *
 * ## A chave de campanha: a mesma força do resolvedor
 *
 * `campaign_id` (o parâmetro `{{campaign.id}}` da Meta) é a chave exata; na falta
 * dele valem o `utm_campaign` digitado e, por último, o `ctwa_source_id` do
 * Click-to-WhatsApp. É a ordem de `chaveDeOrigem` em `meta-ads/resolver.ts`, e
 * usá-la aqui mantém a mesma campanha com o mesmo nome nas três telas.
 *
 * ## Os DOIS números, sempre visíveis
 *
 * O que a Meta atribui como lead e o que o CRM contou nunca concordam — a janela
 * de atribuição e o clique perdido garantem isso. Esconder a diferença gera briga
 * entre Growth e financeiro, então os dois ficam na mesma linha, com a diferença
 * nomeada. A janela da Meta ainda vai ESCRITA no cabeçalho: número de mídia sem a
 * janela ao lado é número que alguém lê errado.
 *
 * ## Função pura para o que decide
 *
 * O cruzamento entre funil e gasto (`combinarCampanhas`) e a soma do rodapé
 * (`totalizarCampanhas`) são puros, testáveis sem banco. O SQL só busca.
 */

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { abreviarId } from "./agrupar-origens";
import { diaDoNegocio } from "./periodo";
import { contagensDoFunil, VISITA_DE_GENTE } from "./sinais-do-funil";

/**
 * A janela de atribuição da Meta, escrita para a tela.
 *
 * Não é configurável porque não é nossa: é o padrão da conta no gerenciador
 * (7 dias após o clique, 1 dia após a visualização). O que a tela faz é NOMEAR
 * isso — um número de mídia sem a janela ao lado é um número que alguém lê errado.
 */
export const JANELA_DE_ATRIBUICAO_META =
	"Padrão da Meta: 7 dias após o clique e 1 dia após a visualização";

/** O que o funil do CRM devolve por campanha. */
export interface LinhaFunilCampanha {
	chave: string;
	/** O valor cru da UTM, quando houve — é o rótulo de leitura sem o resolvedor. */
	utmCampaign: string | null;
	visitas: number;
	conversas: number;
	identificados: number;
	qualificados: number;
	propostas: number;
	fechados: number;
}

/** O que o gerenciador devolve por campanha, no período. */
export interface GastoDeCampanha {
	entityId: string;
	nome: string | null;
	status: string | null;
	spendCents: number;
	impressoes: number;
	cliques: number;
	/** Os leads que a META atribuiu — o outro lado da diferença. */
	leadsMeta: number;
}

/** A linha da tela: funil do CRM + gasto da Meta, já cruzados. */
export interface LinhaCampanha {
	chave: string;
	/** Nome para ler. Sem resolução, é a UTM ou o id abreviado — nunca vazio. */
	nome: string;
	/** `false` = o gerenciador ainda não conhece esta campanha. */
	nomeResolvido: boolean;
	/** O id de 18 dígitos inteiro, quando conhecido — é o que se cola no gerenciador. */
	entityId: string | null;
	status: string | null;
	visitas: number;
	conversas: number;
	identificados: number;
	qualificados: number;
	propostas: number;
	fechados: number;
	spendCents: number;
	impressoes: number;
	cliques: number;
	leadsMeta: number;
	/**
	 * `leadsMeta - identificados`. Positivo = a Meta atribuiu mais do que o CRM
	 * contou; negativo = o CRM achou lead que a Meta não viu. Nunca zero por
	 * coincidência de desenho: os dois medem coisas diferentes.
	 */
	diferencaDeLeads: number;
	/** `null` = nenhum lead qualificado no período; não é "custo zero". */
	custoPorQualificadoCents: number | null;
}

export interface TotaisDeCampanhas {
	investimentoCents: number;
	leadsMeta: number;
	leadsCrm: number;
	qualificados: number;
	propostas: number;
	fechados: number;
	custoPorQualificadoCents: number | null;
}

export interface RespostaDeCampanhas {
	linhas: LinhaCampanha[];
	totais: TotaisDeCampanhas;
	/**
	 * `false` = o ciclo de sync do gerenciador nunca rodou. A tela então diz que
	 * ainda não há dado, em vez de mostrar zero — zero seria uma afirmação falsa.
	 */
	temDadosDoGerenciador: boolean;
	janelaDeAtribuicao: string;
}

function num(valor: unknown): number {
	return Number(valor ?? 0) || 0;
}

function custoPor(spendCents: number, qualificados: number): number | null {
	if (qualificados <= 0) return null;
	return Math.round(spendCents / qualificados);
}

/**
 * Cruza o funil do CRM com o gasto da Meta, pela chave da campanha.
 *
 * As duas listas não falam a mesma língua de ids na borda: o funil agrupa por
 * `campaign_id`/UTM, o gasto por `entity_id` da Meta. Quando há `campaign_id`,
 * casam exatamente; quando só há UTM, não casam — e aí a campanha aparece **sem
 * gasto atribuído**, em vez de sumir. Campanha que gastou e não trouxe ninguém
 * também aparece: é justamente a que precisa ser vista.
 */
export function combinarCampanhas(
	funil: LinhaFunilCampanha[],
	gastos: GastoDeCampanha[],
): LinhaCampanha[] {
	const gastoPorChave = new Map<string, GastoDeCampanha>();
	for (const gasto of gastos) gastoPorChave.set(gasto.entityId, gasto);

	const linhas: LinhaCampanha[] = [];
	const chavesVistas = new Set<string>();

	for (const linha of funil) {
		const gasto = gastoPorChave.get(linha.chave);
		chavesVistas.add(linha.chave);

		linhas.push({
			chave: linha.chave,
			nome: gasto?.nome ?? linha.utmCampaign ?? abreviarId(linha.chave),
			nomeResolvido: Boolean(gasto?.nome),
			entityId: gasto?.entityId ?? null,
			status: gasto?.status ?? null,
			visitas: linha.visitas,
			conversas: linha.conversas,
			identificados: linha.identificados,
			qualificados: linha.qualificados,
			propostas: linha.propostas,
			fechados: linha.fechados,
			spendCents: gasto?.spendCents ?? 0,
			impressoes: gasto?.impressoes ?? 0,
			cliques: gasto?.cliques ?? 0,
			leadsMeta: gasto?.leadsMeta ?? 0,
			diferencaDeLeads: (gasto?.leadsMeta ?? 0) - linha.identificados,
			custoPorQualificadoCents: custoPor(gasto?.spendCents ?? 0, linha.qualificados),
		});
	}

	// Campanhas que gastaram e não apareceram no funil do CRM: zero em tudo do
	// CRM, mas com o dinheiro visível. Sem isto, a campanha que queimou verba sem
	// trazer ninguém seria a única ausente da tela.
	for (const gasto of gastos) {
		if (chavesVistas.has(gasto.entityId)) continue;
		linhas.push({
			chave: gasto.entityId,
			nome: gasto.nome ?? abreviarId(gasto.entityId),
			nomeResolvido: Boolean(gasto.nome),
			entityId: gasto.entityId,
			status: gasto.status,
			visitas: 0,
			conversas: 0,
			identificados: 0,
			qualificados: 0,
			propostas: 0,
			fechados: 0,
			spendCents: gasto.spendCents,
			impressoes: gasto.impressoes,
			cliques: gasto.cliques,
			leadsMeta: gasto.leadsMeta,
			diferencaDeLeads: gasto.leadsMeta,
			custoPorQualificadoCents: null,
		});
	}

	// A ordenação padrão é o CUSTO POR QUALIFICADO — custo por lead sozinho não
	// decide nada. Quem não tem qualificado vai para o fim, mas antes de quem não
	// qualificou nada E gastou menos: entre os "sem custo calculável", o maior
	// investimento é o que precisa de atenção primeiro.
	return linhas.sort((a, b) => {
		const ca = a.custoPorQualificadoCents;
		const cb = b.custoPorQualificadoCents;
		if (ca !== null && cb !== null) return ca - cb;
		if (ca !== null) return -1;
		if (cb !== null) return 1;
		return b.spendCents - a.spendCents || b.conversas - a.conversas;
	});
}

/** O rodapé: soma o que foi gasto e o que o CRM produziu — duas moedas, uma nota. */
export function totalizarCampanhas(linhas: LinhaCampanha[]): TotaisDeCampanhas {
	let investimentoCents = 0;
	let leadsMeta = 0;
	let leadsCrm = 0;
	let qualificados = 0;
	let propostas = 0;
	let fechados = 0;

	for (const linha of linhas) {
		investimentoCents += linha.spendCents;
		leadsMeta += linha.leadsMeta;
		leadsCrm += linha.identificados;
		qualificados += linha.qualificados;
		propostas += linha.propostas;
		fechados += linha.fechados;
	}

	return {
		investimentoCents,
		leadsMeta,
		leadsCrm,
		qualificados,
		propostas,
		fechados,
		custoPorQualificadoCents: custoPor(investimentoCents, qualificados),
	};
}

// ─── Banco ──────────────────────────────────────────────────────────────────

async function funilPorCampanha(de: Date, ate: Date): Promise<LinhaFunilCampanha[]> {
	const resultado = await db.execute<Record<string, unknown>>(sql`
    SELECT
      COALESCE(NULLIF(v.campaign_id, ''), NULLIF(v.utm_campaign, ''), NULLIF(v.ctwa_source_id, '')) AS chave,
      max(v.utm_campaign) AS utm_campaign,
      -- As MESMAS contagens de computeOrigens — uma definição de funil só.
      ${contagensDoFunil()}
    FROM visits v
    LEFT JOIN conversations c ON c.visit_id = v.id AND c.is_simulated = false
    LEFT JOIN leads l ON l.conversation_id = c.id AND l.is_simulated = false
    LEFT JOIN bevi_proposals bp ON bp.conversation_id = c.id
    WHERE v.created_at BETWEEN ${de} AND ${ate}
      AND ${VISITA_DE_GENTE}
      AND COALESCE(NULLIF(v.campaign_id, ''), NULLIF(v.utm_campaign, ''), NULLIF(v.ctwa_source_id, '')) IS NOT NULL
    GROUP BY 1
  `);

	return resultado.rows.map((linha) => ({
		chave: String(linha.chave),
		utmCampaign: (linha.utm_campaign as string) ?? null,
		visitas: num(linha.visitas),
		conversas: num(linha.conversas),
		identificados: num(linha.identificados),
		qualificados: num(linha.qualificados),
		propostas: num(linha.propostas),
		fechados: num(linha.fechados),
	}));
}

async function gastosPorCampanha(de: Date, ate: Date): Promise<GastoDeCampanha[]> {
	const deDia = diaDoNegocio(de);
	const ateDia = diaDoNegocio(ate);

	const resultado = await db.execute<Record<string, unknown>>(sql`
    SELECT
      i.entity_id AS entity_id,
      max(e.nome) AS nome,
      max(e.status) AS status,
      sum(i.spend_cents) AS spend_cents,
      sum(i.impressions) AS impressoes,
      sum(i.clicks) AS cliques,
      sum(i.leads) AS leads_meta
    FROM meta_insights_diarios i
    LEFT JOIN meta_entities e ON e.entity_id = i.entity_id AND e.nivel = 'campaign'
    WHERE i.nivel = 'campaign'
      AND i.data BETWEEN ${deDia} AND ${ateDia}
    GROUP BY i.entity_id
  `);

	return resultado.rows.map((linha) => ({
		entityId: String(linha.entity_id),
		nome: (linha.nome as string) ?? null,
		status: (linha.status as string) ?? null,
		spendCents: num(linha.spend_cents),
		impressoes: num(linha.impressoes),
		cliques: num(linha.cliques),
		leadsMeta: num(linha.leads_meta),
	}));
}

/** O sync já rodou alguma vez? Basta existir UMA campanha espelhada. */
async function temEntidadesDeCampanha(): Promise<boolean> {
	const resultado = await db.execute<Record<string, unknown>>(sql`
    SELECT EXISTS (SELECT 1 FROM meta_entities WHERE nivel = 'campaign') AS tem
  `);
	return Boolean(resultado.rows[0]?.tem);
}

/**
 * O que a rota e a tela consomem. Uma ida por consulta, em paralelo.
 */
export async function computeCampanhas(de: Date, ate: Date): Promise<RespostaDeCampanhas> {
	const [funil, gastos, temEntidades] = await Promise.all([
		funilPorCampanha(de, ate),
		gastosPorCampanha(de, ate),
		temEntidadesDeCampanha(),
	]);

	const linhas = combinarCampanhas(funil, gastos);

	return {
		linhas,
		totais: totalizarCampanhas(linhas),
		temDadosDoGerenciador: temEntidades || gastos.length > 0,
		janelaDeAtribuicao: JANELA_DE_ATRIBUICAO_META,
	};
}
