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
import {
	contagensDoFunil,
	conversaIdentificada,
	conversaSemOrigem,
	leadComContato,
	VISITA_DE_GENTE,
} from "./sinais-do-funil";

/**
 * A janela de atribuição da Meta, escrita para a tela.
 *
 * Não é configurável porque não é nossa: é o padrão da conta no gerenciador
 * (7 dias após o clique, 1 dia após a visualização). O que a tela faz é NOMEAR
 * isso — um número de mídia sem a janela ao lado é um número que alguém lê errado.
 */
export const JANELA_DE_ATRIBUICAO_META =
	"Padrão da Meta: 7 dias após o clique e 1 dia após a visualização";

/**
 * A chave sentinela da linha de reconciliação "Sem origem conhecida".
 *
 * Não pode colidir com id da Meta (só dígitos) nem com UTM (texto livre): por
 * isso o prefixo com underscores, que nenhuma das duas produz.
 */
export const SEM_ORIGEM_CONHECIDA = "__sem_origem_conhecida__";

/** O que o funil do CRM devolve por campanha. */
export interface LinhaFunilCampanha {
	chave: string;
	/** O valor cru da UTM, quando houve — é o rótulo de leitura sem o resolvedor. */
	utmCampaign: string | null;
	visitas: number;
	conversas: number;
	/**
	 * Conversas em que o cliente se identificou — a regra é do CANAL
	 * (`conversaIdentificada`, em `sinais-do-funil.ts`): no WhatsApp, quem entrou
	 * (o canal entrega número e perfil); na web, quem deixou contato.
	 */
	identificados: number;
	/**
	 * Conversas com contato CONHECIDO, tenha o cliente informado ou não. É o
	 * número antigo, que mede quem a régua consegue alcançar — não quem se
	 * identificou. Vai ao lado de `identificados`, com nome próprio.
	 */
	comTelefone: number;
	qualificados: number;
	propostas: number;
	fechados: number;
}

/**
 * O funil de UM criativo dentro de uma campanha.
 *
 * A chave é o `utm_content` que chegou na visita — na prática, o id do anúncio
 * (`{{ad.id}}`). O espelho (`meta_entities`, nível "ad") dá o nome da peça
 * quando o sync conseguiu lê-lo; sem ele, o que existe é o id, e a tela diz isso.
 */
export interface LinhaCriativo {
	chave: string;
	/** Nome da peça no gerenciador; `null` quando o espelho não o trouxe. */
	nome: string | null;
	/** `false` = mostramos o id cru porque o gerenciador não espelhou o nome. */
	nomeResolvido: boolean;
	thumbnailUrl: string | null;
	visitas: number;
	conversas: number;
	identificados: number;
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

/**
 * Por que o custo por qualificado NÃO pode ser calculado.
 *
 * Três situações diferentes que a tela dizia todas com o mesmo 'sem base':
 *
 * - `sem_vinculo`: a campanha do gerenciador não casa com nenhuma visita ou
 *   conversa do CRM. O problema é de atribuição (UTM/template ou espelho), não de
 *   performance — e o 'sem base' escondia isso.
 * - `sem_gasto`: o gerenciador não reportou investimento no período. O problema é
 *   de leitura da Meta (sync parado, campanha sem gasto), não do funil.
 * - `sem_qualificado`: houve gasto E vínculo, mas nenhum lead chegou a
 *   qualificado. É o único dos três em que a campanha, de fato, não converteu.
 */
export type MotivoSemCusto = "sem_qualificado" | "sem_gasto" | "sem_vinculo";

/** O custo calculado ou o motivo pelo qual ele não existe — nunca "zero". */
export type CustoPorQualificado =
	| { tipo: "valor"; centavos: number }
	| { tipo: "motivo"; motivo: MotivoSemCusto };

/** A linha da tela: funil do CRM + gasto da Meta, já cruzados. */
export interface LinhaCampanha {
	chave: string;
	/** Nome para ler. Sem resolução, é a UTM ou o id abreviado — nunca vazio. */
	nome: string;
	/** `false` = o gerenciador ainda não conhece esta campanha. */
	nomeResolvido: boolean;
	/** O `utm_campaign` cru, quando a linha nasceu dele — é o que a tela decodifica. */
	utmCampaign: string | null;
	/** O id de 18 dígitos inteiro, quando conhecido — é o que se cola no gerenciador. */
	entityId: string | null;
	status: string | null;
	visitas: number;
	conversas: number;
	identificados: number;
	/** Ver `LinhaFunilCampanha.comTelefone`: contato conhecido ≠ cliente identificado. */
	comTelefone: number;
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
	/** Valor ou motivo — `sem base` deixou de existir como resposta única. */
	custoPorQualificado: CustoPorQualificado;
	/**
	 * `true` na linha de reconciliação "Sem origem conhecida" — conversas que
	 * chegaram fora da landing e não pertencem a campanha nenhuma. Não tem
	 * investimento nem custo; existe para o total do CRM fechar com a tela de
	 * Conversas.
	 */
	semOrigemConhecida: boolean;
	/**
	 * O funil aberto por criativo, quando o `utm_content` da visita traz um id de
	 * anúncio. Vazio = nenhuma visita desta campanha carregou criativo.
	 */
	criativos: LinhaCriativo[];
}

export interface TotaisDeCampanhas {
	investimentoCents: number;
	leadsMeta: number;
	/**
	 * Conversas em que o cliente se identificou (nome E contato) — o número que a
	 * tela chama de "Leads no CRM".
	 */
	leadsCrm: number;
	/** Conversas com contato conhecido, mesmo sem o cliente ter informado o nome. */
	comTelefone: number;
	/** Soma das conversas, incluindo a linha sem origem — é o que reconcilia. */
	conversas: number;
	qualificados: number;
	propostas: number;
	fechados: number;
	custoPorQualificado: CustoPorQualificado;
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

/**
 * O custo por qualificado, ou o motivo pelo qual ele não existe.
 *
 * A ordem das guardas não é arbitrária: **falta de vínculo vem primeiro**. Uma
 * campanha que gastou sem nenhuma visita ou conversa apontando para ela não tem
 * custo calculável por um problema de atribuição — dizer "sem qualificado"
 * mandaria o operador olhar o funil quando o defeito está no vínculo. Depois,
 * `sem_gasto`; só então `sem_qualificado`, que é o único em que a campanha
 * realmente rodou e não converteu.
 */
export function custoPor(args: {
	spendCents: number;
	qualificados: number;
	/** Basta UMA visita ou UMA conversa identificada para haver vínculo. */
	temVinculo: boolean;
}): CustoPorQualificado {
	if (!args.temVinculo) return { tipo: "motivo", motivo: "sem_vinculo" };
	if (args.spendCents <= 0) return { tipo: "motivo", motivo: "sem_gasto" };
	if (args.qualificados <= 0) return { tipo: "motivo", motivo: "sem_qualificado" };
	return { tipo: "valor", centavos: Math.round(args.spendCents / args.qualificados) };
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
	semOrigem?: { conversas: number; identificados: number; comTelefone: number },
	criativosPorCampanha?: Map<string, LinhaCriativo[]>,
): LinhaCampanha[] {
	const gastoPorChave = new Map<string, GastoDeCampanha>();
	for (const gasto of gastos) gastoPorChave.set(gasto.entityId, gasto);

	const linhas: LinhaCampanha[] = [];
	const chavesVistas = new Set<string>();

	for (const linha of funil) {
		const gasto = gastoPorChave.get(linha.chave);
		chavesVistas.add(linha.chave);
		const spendCents = gasto?.spendCents ?? 0;

		linhas.push({
			chave: linha.chave,
			nome: gasto?.nome ?? linha.utmCampaign ?? abreviarId(linha.chave),
			nomeResolvido: Boolean(gasto?.nome),
			utmCampaign: linha.utmCampaign,
			entityId: gasto?.entityId ?? null,
			status: gasto?.status ?? null,
			visitas: linha.visitas,
			conversas: linha.conversas,
			identificados: linha.identificados,
			comTelefone: linha.comTelefone,
			qualificados: linha.qualificados,
			propostas: linha.propostas,
			fechados: linha.fechados,
			spendCents,
			impressoes: gasto?.impressoes ?? 0,
			cliques: gasto?.cliques ?? 0,
			leadsMeta: gasto?.leadsMeta ?? 0,
			diferencaDeLeads: (gasto?.leadsMeta ?? 0) - linha.identificados,
			custoPorQualificado: custoPor({
				spendCents,
				qualificados: linha.qualificados,
				// Qualquer atividade no CRM já é vínculo: a linha veio do funil, então
				// a campanha da Meta casa com algo nosso.
				temVinculo:
					linha.visitas > 0 ||
					linha.conversas > 0 ||
					linha.identificados > 0 ||
					linha.qualificados > 0,
			}),
			semOrigemConhecida: false,
			criativos: criativosPorCampanha?.get(linha.chave) ?? [],
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
			utmCampaign: null,
			entityId: gasto.entityId,
			status: gasto.status,
			visitas: 0,
			conversas: 0,
			identificados: 0,
			comTelefone: 0,
			qualificados: 0,
			propostas: 0,
			fechados: 0,
			spendCents: gasto.spendCents,
			impressoes: gasto.impressoes,
			cliques: gasto.cliques,
			leadsMeta: gasto.leadsMeta,
			diferencaDeLeads: gasto.leadsMeta,
			custoPorQualificado: custoPor({
				spendCents: gasto.spendCents,
				qualificados: 0,
				temVinculo: false,
			}),
			semOrigemConhecida: false,
			criativos: [],
		});
	}

	// A ordenação padrão é o CUSTO POR QUALIFICADO — custo por lead sozinho não
	// decide nada. Quem tem valor vem primeiro, do mais barato ao mais caro; quem
	// não tem vai para o fim, mas antes de quem investiu menos: entre os "sem custo
	// calculável", o maior investimento é o que precisa de atenção primeiro.
	linhas.sort((a, b) => {
		const ca = a.custoPorQualificado.tipo === "valor" ? a.custoPorQualificado.centavos : null;
		const cb = b.custoPorQualificado.tipo === "valor" ? b.custoPorQualificado.centavos : null;
		if (ca !== null && cb !== null) return ca - cb;
		if (ca !== null) return -1;
		if (cb !== null) return 1;
		return b.spendCents - a.spendCents || b.conversas - a.conversas;
	});

	// A linha de reconciliação vai SEMPRE por último, fora da ordenação — ela não
	// é uma campanha e não compete por custo. Existe para o total de conversas do
	// CRM fechar com a tela de Conversas (as que nasceram fora da landing).
	if (semOrigem && (semOrigem.conversas > 0 || semOrigem.identificados > 0)) {
		linhas.push({
			chave: SEM_ORIGEM_CONHECIDA,
			nome: "Sem origem conhecida",
			nomeResolvido: true,
			utmCampaign: null,
			entityId: null,
			status: null,
			visitas: 0,
			conversas: semOrigem.conversas,
			identificados: semOrigem.identificados,
			comTelefone: semOrigem.comTelefone,
			qualificados: 0,
			propostas: 0,
			fechados: 0,
			spendCents: 0,
			impressoes: 0,
			cliques: 0,
			leadsMeta: 0,
			diferencaDeLeads: 0,
			custoPorQualificado: custoPor({
				spendCents: 0,
				qualificados: 0,
				temVinculo: false,
			}),
			semOrigemConhecida: true,
			criativos: [],
		});
	}

	return linhas;
}

/** O rodapé: soma o que foi gasto e o que o CRM produziu — duas moedas, uma nota. */
export function totalizarCampanhas(linhas: LinhaCampanha[]): TotaisDeCampanhas {
	let investimentoCents = 0;
	let leadsMeta = 0;
	let leadsCrm = 0;
	let comTelefone = 0;
	let conversas = 0;
	let qualificados = 0;
	let propostas = 0;
	let fechados = 0;

	for (const linha of linhas) {
		investimentoCents += linha.spendCents;
		leadsMeta += linha.leadsMeta;
		leadsCrm += linha.identificados;
		comTelefone += linha.comTelefone;
		conversas += linha.conversas;
		qualificados += linha.qualificados;
		propostas += linha.propostas;
		fechados += linha.fechados;
	}

	return {
		investimentoCents,
		leadsMeta,
		leadsCrm,
		comTelefone,
		conversas,
		qualificados,
		propostas,
		fechados,
		custoPorQualificado: custoPor({
			spendCents: investimentoCents,
			qualificados,
			// No total o vínculo não faz sentido como corte: é a mistura de tudo.
			temVinculo: true,
		}),
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
		comTelefone: num(linha.com_contato),
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
 * As conversas que chegaram SEM origem conhecida.
 *
 * É o complemento exato do corte que o funil de mídia usa (`conversaAtribuida`,
 * na fonte única `sinais-do-funil.ts`): lá toda etapa exige `c.visit_id IS NOT
 * NULL`; aqui contamos as conversas do período em que ele É nulo — WhatsApp
 * orgânico, conversa anterior à instrumentação. Sem esta linha, o total de
 * conversas da tela de Campanhas fica MENOR que o da tela de Conversas e
 * ninguém sabe por quê.
 *
 * As duas metades moram na MESMA função de origem (`conversaSemOrigem`), para
 * que o complemento não possa divergir do corte principal.
 */
async function conversasSemOrigemConhecida(
	de: Date,
	ate: Date,
): Promise<{ conversas: number; identificados: number; comTelefone: number }> {
	const semOrigem = conversaSemOrigem(de, ate);
	const resultado = await db.execute<Record<string, unknown>>(sql`
    SELECT
      count(DISTINCT c.id) AS conversas,
      count(DISTINCT c.id) FILTER (WHERE ${conversaIdentificada(sql`c`)}) AS identificados,
      count(DISTINCT c.id) FILTER (WHERE ${leadComContato(sql`l`)}) AS com_contato
    FROM conversations c
    LEFT JOIN leads l ON l.conversation_id = c.id AND l.is_simulated = false
    WHERE ${semOrigem}
  `);
	const linha = resultado.rows[0];
	return {
		conversas: num(linha?.conversas),
		identificados: num(linha?.identificados),
		comTelefone: num(linha?.com_contato),
	};
}

/**
 * O funil aberto por criativo, dentro de cada campanha.
 *
 * A chave de ligação é o `utm_content` da visita contra o `entity_id` do
 * ANÚNCIO no espelho (nível "ad") — é o que o `{{ad.id}}` do anúncio grava na
 * URL. Não usamos a hierarquia anúncio→conjunto→campanha de propósito: a visita
 * já carrega o `campaign_id`, então o agrupamento por campanha sai direto.
 *
 * `max()` no criativo: pode haver mais de uma linha de anúncio por id se a Meta
 * tiver mudado o nome, e o mais recente interessa.
 */
async function criativosPorCampanha(de: Date, ate: Date): Promise<Map<string, LinhaCriativo[]>> {
	const resultado = await db.execute<Record<string, unknown>>(sql`
    SELECT
      COALESCE(NULLIF(v.campaign_id, ''), NULLIF(v.utm_campaign, ''), NULLIF(v.ctwa_source_id, '')) AS campanha,
      v.utm_content AS criativo,
      max(a.creative_name) AS creative_name,
      max(a.thumbnail_url) AS thumbnail_url,
      ${contagensDoFunil()}
    FROM visits v
    LEFT JOIN conversations c ON c.visit_id = v.id AND c.is_simulated = false
    LEFT JOIN leads l ON l.conversation_id = c.id AND l.is_simulated = false
    LEFT JOIN bevi_proposals bp ON bp.conversation_id = c.id
    LEFT JOIN meta_entities a ON a.entity_id = v.utm_content AND a.nivel = 'ad'
    WHERE v.created_at BETWEEN ${de} AND ${ate}
      AND ${VISITA_DE_GENTE}
      AND v.utm_content IS NOT NULL AND v.utm_content <> ''
      AND COALESCE(NULLIF(v.campaign_id, ''), NULLIF(v.utm_campaign, ''), NULLIF(v.ctwa_source_id, '')) IS NOT NULL
    GROUP BY 1, 2
  `);

	const mapa = new Map<string, LinhaCriativo[]>();
	for (const linha of resultado.rows) {
		const campanha = String(linha.campanha);
		const nome = ((linha.creative_name as string | undefined) ?? "").trim() || null;
		const item: LinhaCriativo = {
			chave: String(linha.criativo),
			nome,
			nomeResolvido: nome !== null,
			thumbnailUrl: (linha.thumbnail_url as string) ?? null,
			visitas: num(linha.visitas),
			conversas: num(linha.conversas),
			identificados: num(linha.identificados),
		};
		const lista = mapa.get(campanha) ?? [];
		lista.push(item);
		mapa.set(campanha, lista);
	}

	// Mais visitas primeiro: é o criativo que mais trouxe gente que o operador
	// quer pausar ou escalar.
	for (const lista of mapa.values()) lista.sort((a, b) => b.visitas - a.visitas);

	return mapa;
}

/**
 * O que a rota e a tela consomem. Uma ida por consulta, em paralelo.
 */
export async function computeCampanhas(de: Date, ate: Date): Promise<RespostaDeCampanhas> {
	const [funil, gastos, temEntidades, semOrigem, criativos] = await Promise.all([
		funilPorCampanha(de, ate),
		gastosPorCampanha(de, ate),
		temEntidadesDeCampanha(),
		conversasSemOrigemConhecida(de, ate),
		criativosPorCampanha(de, ate),
	]);

	const linhas = combinarCampanhas(funil, gastos, semOrigem, criativos);

	return {
		linhas,
		totais: totalizarCampanhas(linhas),
		temDadosDoGerenciador: temEntidades || gastos.length > 0,
		janelaDeAtribuicao: JANELA_DE_ATRIBUICAO_META,
	};
}
