/**
 * CUSTO DE IA — a capacidade que a cliente pediu para fechar o CPC.
 *
 * Bruna, 22/09: *"ver o custo de IA e das mensagens de remarketing … para a
 * gente calcular o CPC depois"*. Este módulo é a metade "custo de IA".
 *
 * ── A decisão do dono, e ela não se reabre aqui (ROTA B) ────────────────────
 *
 * O custo de LLM **já existe na fonte atual** (o Langfuse): cada geração sai de
 * lá com o custo em dólar, por modelo e por dia. Nada de tabela de preço
 * versionada em código, nada de gravar tokens do turno no banco — o spec de
 * 28/09 lista as duas coisas em "Fora de escopo (YAGNI)". O que este módulo
 * faz é LER essa fonte e cruzar com o Postgres pelo `sessionId` do Langfuse,
 * que é o MESMO `conversationId` do Postgres (é o que `withLangfuseTurn` grava:
 * `sessionId: ctx.conversationId`).
 *
 * ── A lei que atravessa o módulo ────────────────────────────────────────────
 *
 * **Ausência de preço é "não calculável", nunca "R$ 0,00".** E o motivo é
 * NOMEADO, porque cada um pede uma ação diferente de quem opera:
 *
 *   - `sem_dado`         — a fonte não devolveu custo no período (sync/fonte parada);
 *   - `sem_vinculo`      — o custo existe, mas não casa com conversa do Postgres
 *                          (o cruzamento por `sessionId` não fechou);
 *   - `modelo_sem_preco` — a fonte conheceu a geração e não o preço do modelo;
 *   - `sem_cotacao`      — há custo em dólar e não há cotação cadastrada para
 *                          trazê-lo ao real do CPC;
 *   - `fonte_indisponivel` — a leitura da fonte FALHOU (não é "não tem dado").
 *
 * Um total PARCIAL somado por cima de um modelo sem preço é a mentira que este
 * módulo existe para impedir: ele subestimaria o custo e ninguém veria.
 *
 * ── Por que este arquivo é puro e a leitura mora na borda ───────────────────
 *
 * `somarCustoDeIA` não faz I/O: recebe os dois lados já lidos (as linhas do
 * Langfuse e as conversas do Postgres) e devolve o número ou o motivo. É o que
 * permite provar os cinco casos sem tocar o Langfuse de verdade — e o que
 * impede um teste de gravar custo de teste na fonte. Quem lê de fato é
 * `lerCustoDoLangfuse` (a borda) e `conversasDoPeriodo` (o Postgres).
 *
 * ── A rota da fonte: `v2/metrics`, e por que a v1 não volta ─────────────────
 *
 * A Metrics API v1 (`/api/public/metrics`) responde **404** no Langfuse v4
 * (`events_only`): a tela do custo ficou sem fonte em silêncio, e o sintoma nos
 * logs era `[custo-de-ia] leitura da fonte falhou: metrics-404`. A
 * rota viva é `/api/public/v2/metrics`.
 *
 * A v2 cobra duas regras que a v1 não cobrava, e o desenho da leitura nasce
 * delas: `sessionId` é dimensão de alta cardinalidade — exige `config.row_limit`
 * e `orderBy` por medida, e **proíbe** `timeDimension` junto dela. Como o vínculo
 * com a conversa é justamente o `sessionId`, a leitura fatia a janela em DIAS e
 * consulta um dia por vez; o dia vem do recorte pedido, não do payload.
 */

import { and, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { conversations, usoDeIa } from "@/db/schema";
import { custoDoTurnoCentsExatos } from "@/lib/agent/pi/precos";
import { CHAVE_DA_COTACAO, cotacaoDoCadastro, lerCustoDoCadastro } from "./custos-do-cadastro";
import { diaDoNegocio, fimDoDia, inicioDoDia } from "./periodo";

/** Os dois canais do produto — o mesmo enum de `conversations.channel`. */
export type CanalDeIA = "web" | "whatsapp";

/**
 * Uma linha de custo como a FONTE (Langfuse) devolve: por sessão, modelo e dia.
 *
 * `sessionId` é o `conversationId` do Postgres — é esta igualdade que dá o
 * cruzamento. `custoUsdCents` é `null` (e não zero) quando a fonte não tem preço
 * do modelo: zero é um custo medido, `null` é um preço que não se sabe.
 */
export interface LinhaDeCustoDoLangfuse {
	sessionId: string;
	modelo: string;
	/** Dia do negócio (`YYYY-MM-DD`), no fuso da operação. */
	dia: string;
	/**
	 * Custo em centavos de DÓLAR — pode ter FRAÇÃO de centavo (é valor exato de token, não
	 * arredondado por linha); `null` = a fonte não tem preço deste modelo.
	 */
	custoUsdCents: number | null;
}

/** A conversa do Postgres — o lado que dá VÍNCULO e CANAL ao custo. */
export interface ConversaDoPostgres {
	conversationId: string;
	canal: CanalDeIA;
}

/** Custo somado por uma chave (modelo ou dia), já nas duas moedas. */
export interface CustoAgrupado {
	chave: string;
	usdCents: number;
	brlCents: number;
}

/** Por que o custo de IA não pôde ser calculado — a tela diz QUAL. */
export type MotivoSemCustoDeIA =
	| "sem_dado"
	| "sem_vinculo"
	| "modelo_sem_preco"
	| "sem_cotacao"
	| "fonte_indisponivel";

export type ResultadoCustoDeIA =
	| {
			tipo: "valor";
			usdCents: number;
			brlCents: number;
			/** Quantas conversas do período deram vínculo a este custo. */
			conversas: number;
			porModelo: CustoAgrupado[];
			porDia: CustoAgrupado[];
	  }
	| {
			tipo: "motivo";
			motivo: MotivoSemCustoDeIA;
			/** O que a tela mostra: por que o número não existe. */
			explicacao: string;
			/** Nomeados quando o motivo é `modelo_sem_preco`. */
			modelosSemPreco?: string[];
	  };

const EXPLICACAO: Record<MotivoSemCustoDeIA, string> = {
	sem_dado: "A fonte de custo não reportou nada neste período.",
	sem_vinculo: "Há custo na fonte, mas nenhuma conversa do período corresponde a ele.",
	modelo_sem_preco: "A fonte registrou uso de um modelo sem preço cadastrado nela.",
	sem_cotacao: "Há custo em dólar e não há cotação cadastrada para trazer ao real.",
	fonte_indisponivel: "A fonte de custo não respondeu (Langfuse indisponível ou não configurado).",
};

/** Converte centavos de dólar em centavos de real pela cotação cadastrada. */
function paraReal(usdCents: number, cotacaoUsdBrl: number): number {
	return Math.round(usdCents * cotacaoUsdBrl);
}

/** Soma por chave e devolve ordenado pela chave — determinístico para a tela. */
function agrupar(
	linhas: readonly LinhaDeCustoDoLangfuse[],
	chaveDe: (linha: LinhaDeCustoDoLangfuse) => string,
	cotacao: number,
): CustoAgrupado[] {
	const porChave = new Map<string, number>();
	for (const linha of linhas) {
		const chave = chaveDe(linha);
		porChave.set(chave, (porChave.get(chave) ?? 0) + (linha.custoUsdCents ?? 0));
	}

	return [...porChave.entries()]
		.map(([chave, usdCents]) => ({
			chave,
			usdCents,
			brlCents: paraReal(usdCents, cotacao),
		}))
		.sort((a, b) => (a.chave < b.chave ? -1 : a.chave > b.chave ? 1 : 0));
}

/**
 * O custo de IA do período/canal, ou o motivo nomeado pelo qual ele não existe.
 *
 * A ordem das guardas não é arbitrária — é a mesma lógica de `custoPor`
 * (campanhas-queries.ts): **falta de vínculo antes de falta de dado**, porque um
 * cruzamento que não fecha diz "olhe a atribuição", não "olhe a operação".
 */
export function somarCustoDeIA(args: {
	linhas: readonly LinhaDeCustoDoLangfuse[];
	conversas: readonly ConversaDoPostgres[];
	cotacaoUsdBrl: number | null;
	/** Recorte opcional por canal — sem ele, os dois canais entram. */
	canal?: CanalDeIA;
}): ResultadoCustoDeIA {
	const conversas = args.canal
		? args.conversas.filter((conversa) => conversa.canal === args.canal)
		: [...args.conversas];

	// O CRUZAMENTO: só a linha de custo cuja sessão é uma conversa conhecida do
	// período. É aqui que `sessionId` (Langfuse) vira `conversationId` (Postgres).
	const ids = new Set(conversas.map((conversa) => conversa.conversationId));
	const comVinculo = args.linhas.filter((linha) => ids.has(linha.sessionId));

	// Sem conversa não há a quem atribuir o custo — mesmo que a fonte tenha dado.
	if (conversas.length === 0 || (args.linhas.length > 0 && comVinculo.length === 0)) {
		return {
			tipo: "motivo",
			motivo: "sem_vinculo",
			explicacao: EXPLICACAO.sem_vinculo,
		};
	}

	if (comVinculo.length === 0) {
		return { tipo: "motivo", motivo: "sem_dado", explicacao: EXPLICACAO.sem_dado };
	}

	// Modelo sem preço na fonte: o total não pode ser calculado, porque a soma
	// parcial omitiria justamente a parcela que não se conhece.
	const semPreco = [
		...new Set(
			comVinculo.filter((linha) => linha.custoUsdCents === null).map((linha) => linha.modelo),
		),
	].sort();
	if (semPreco.length > 0) {
		return {
			tipo: "motivo",
			motivo: "modelo_sem_preco",
			explicacao: EXPLICACAO.modelo_sem_preco,
			modelosSemPreco: semPreco,
		};
	}

	const usdCents = comVinculo.reduce((total, linha) => total + (linha.custoUsdCents ?? 0), 0);

	// Sem cotação só é problema quando há custo: zero real continua sendo zero.
	if (args.cotacaoUsdBrl === null && usdCents > 0) {
		return { tipo: "motivo", motivo: "sem_cotacao", explicacao: EXPLICACAO.sem_cotacao };
	}

	const cotacao = args.cotacaoUsdBrl ?? 0;
	return {
		tipo: "valor",
		usdCents,
		brlCents: paraReal(usdCents, cotacao),
		conversas: conversas.length,
		porModelo: agrupar(comVinculo, (linha) => linha.modelo, cotacao),
		porDia: agrupar(comVinculo, (linha) => linha.dia, cotacao),
	};
}
// ─── A borda: a leitura da FONTE e o cruzamento com o Postgres ──────────────

/**
 * A LEITURA DO CUSTO — agora LOCAL.
 *
 * Até 19/10/2026 este número vinha da Metrics API do serviço de observabilidade,
 * por sessão/modelo/dia. Com ele fora, o turno passou a gravar o que consumiu na
 * tabela `uso_de_ia` (tokens de entrada/saída por conversa e modelo), e é daqui
 * que a tela lê.
 *
 * O custo é RECALCULADO dos TOKENS (`pi/precos.ts`), não lido da coluna
 * `custo_usd_cents`: aquela coluna é INTEIRA em centavos e cada beat do turno
 * arredonda o seu antes de gravar, então vários beats de fração de centavo viram
 * zero ANTES de somar — com o modelo default do vendedor (Qwen, US$ 0,05/M) quase
 * todo beat é subcentavo e o total saía zerado. Somando os valores EXATOS e
 * arredondando uma vez, no fim (`somarCustoDeIA`), o número bate com o consumo.
 *
 * Modelo sem preço continua NULO: a lei do módulo é "ausência de preço é não
 * calculável, nunca R$ 0,00", e o consumidor já sabe dizer `modelo_sem_preco`.
 */
export interface LinhaDeUsoLocal {
	sessionId: string;
	modelo: string;
	dia: string;
	custoUsdCents: number | null;
}

/** Uma linha CRUA do livro-caixa local (`uso_de_ia`), como sai do banco. */
export interface UsoDeIaGravado {
	conversationId: string | null;
	modelo: string;
	tokensInput: number;
	tokensOutput: number;
	criadoEm: Date;
}

/**
 * Converte o livro-caixa gravado em linha de custo, recalculando o valor dos tokens.
 *
 * A coluna `custo_usd_cents` NÃO é lida de propósito: ela é inteira e arredondada por
 * beat, e é essa soma de arredondamentos que zerava o custo do modelo barato. O valor
 * daqui é EXATO (fração de centavo); quem arredonda é a exibição/agregação.
 */
export function linhasDoLivroLocal(linhas: readonly UsoDeIaGravado[]): LinhaDeCustoDoLangfuse[] {
	return linhas
		.filter((l): l is UsoDeIaGravado & { conversationId: string } => Boolean(l.conversationId))
		.map((l) => ({
			sessionId: l.conversationId,
			modelo: l.modelo,
			dia: diaDoNegocio(l.criadoEm),
			custoUsdCents: custoDoTurnoCentsExatos({
				modelo: l.modelo,
				tokensInput: l.tokensInput,
				tokensOutput: l.tokensOutput,
			}),
		}));
}

/** Lê o livro-caixa local e agrupa por conversa/modelo/dia. Server-only. */
export async function lerCustoLocal(de: Date, ate: Date): Promise<LinhaDeCustoDoLangfuse[]> {
	const linhas = await db
		.select({
			conversationId: usoDeIa.conversationId,
			modelo: usoDeIa.modelo,
			criadoEm: usoDeIa.criadoEm,
			tokensInput: usoDeIa.tokensInput,
			tokensOutput: usoDeIa.tokensOutput,
		})
		.from(usoDeIa)
		.where(and(gte(usoDeIa.criadoEm, inicioDoDia(de)), lte(usoDeIa.criadoEm, fimDoDia(ate))));

	return linhasDoLivroLocal(linhas);
}

/** As conversas do período — o lado do Postgres que dá VÍNCULO e CANAL. */
export async function conversasDoPeriodo(de: Date, ate: Date): Promise<ConversaDoPostgres[]> {
	const linhas = await db
		.select({ conversationId: conversations.id, canal: conversations.channel })
		.from(conversations)
		.where(
			and(
				gte(conversations.createdAt, inicioDoDia(de)),
				lte(conversations.createdAt, fimDoDia(ate)),
			),
		);
	return linhas.map((l) => ({
		conversationId: l.conversationId,
		canal: l.canal === "whatsapp" ? "whatsapp" : "web",
	}));
}

/** As fontes do custo de IA — injetáveis para provar a costura sem banco. */
export interface FontesDoCustoDeIA {
	lerUso(de: Date, ate: Date): Promise<LinhaDeCustoDoLangfuse[]>;
	lerConversas(de: Date, ate: Date): Promise<ConversaDoPostgres[]>;
	lerCotacao(): Promise<number | null>;
}

const FONTES_REAIS: FontesDoCustoDeIA = {
	lerUso: lerCustoLocal,
	lerConversas: conversasDoPeriodo,
	lerCotacao: () => lerCustoDoCadastro(CHAVE_DA_COTACAO).then(cotacaoDoCadastro),
};

/**
 * O custo de IA do período/canal, pronto para a tela — junta os dois lados e a
 * cotação. Falha de leitura NÃO vira "sem dado": é `fonte_indisponivel`, porque
 * "a fonte não respondeu" e "a fonte não tem o número" pedem ações diferentes.
 */
export async function computeCustoDeIA(
	args: { de: Date; ate: Date; canal?: CanalDeIA },
	fontes: FontesDoCustoDeIA = FONTES_REAIS,
): Promise<ResultadoCustoDeIA> {
	try {
		const [linhas, conversas, cotacao] = await Promise.all([
			fontes.lerUso(args.de, args.ate),
			fontes.lerConversas(args.de, args.ate),
			fontes.lerCotacao(),
		]);
		return somarCustoDeIA({ linhas, conversas, cotacaoUsdBrl: cotacao, canal: args.canal });
	} catch (erro) {
		// O erro não sobe: o bloco inteiro da tela não pode cair porque o custo
		// não carregou. O motivo NOMEADO conta o que aconteceu.
		console.error("[custo-de-ia] leitura da fonte falhou:", erro);
		return {
			tipo: "motivo",
			motivo: "fonte_indisponivel",
			explicacao: EXPLICACAO.fonte_indisponivel,
		};
	}
}
