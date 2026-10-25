/**
 * CUSTO DE IA — a capacidade que a cliente pediu para fechar o CPC.
 *
 * Bruna, 22/09: *"ver o custo de IA e das mensagens de remarketing … para a
 * gente calcular o CPC depois"*. Este módulo é a metade "custo de IA".
 *
 * ── A fonte do número é o livro-caixa LOCAL ─────────────────────────────────
 *
 * O custo de LLM vinha da Metrics API do serviço de observabilidade (Langfuse) até
 * 19/10/2026. Com ele fora, quem grava o consumo é a tabela `uso_de_ia` do Postgres — uma
 * linha por turno do vendedor e uma por chamada fora dele (`registrarUsoDeIa`) — e é dela
 * que a tela lê (`lerCustoLocal`). Não existe mais serviço externo a consultar: declarar
 * "Langfuse" aqui era atribuir o número a algo que não é mais lido (L43/P220).
 *
 * O valor é RECALCULADO dos tokens por `agent/pi/precos.ts`, não lido da coluna
 * `custo_usd_cents`: aquela coluna é inteira em centavos e cada linha arredonda o seu, então
 * somar os inteiros perde o consumo subcentavo do modelo barato (N09/L36).
 *
 * ── A lei que atravessa o módulo ────────────────────────────────────────────
 *
 * **Ausência de preço é "não calculável", nunca "R$ 0,00".** E o motivo é
 * NOMEADO, porque cada um pede uma ação diferente de quem opera:
 *
 *   - `sem_dado`         — o livro-caixa não tem linha no período;
 *   - `sem_vinculo`      — o custo existe, mas não casa com conversa do Postgres
 *                          (o cruzamento por `conversation_id` não fechou);
 *   - `modelo_sem_preco` — há uso de um modelo sem preço de entrada/saída/cache;
 *   - `sem_cotacao`      — há custo em dólar e não há cotação cadastrada para
 *                          trazê-lo ao real do CPC;
 *   - `fonte_indisponivel` — a leitura do livro-caixa FALHOU (não é "não tem dado").
 *
 * Um total PARCIAL somado por cima de um modelo sem preço é a mentira que este
 * módulo existe para impedir: ele subestimaria o custo e ninguém veria.
 *
 * ── Chamada AVULSA entra no total, numa linha própria ───────────────────────
 *
 * Juiz de avaliação, diagnóstico e insight de lead gastam IA sem ter conversa a quem
 * atribuir. Antes elas eram descartadas do livro-caixa e o total da tela mentia para menos
 * (P314): agora entram na soma e aparecem separadas em `semConversa`.
 *
 * ── Por que este arquivo é puro e a leitura mora na borda ───────────────────
 *
 * `somarCustoDeIA` não faz I/O: recebe os dois lados já lidos (as linhas do livro-caixa e as
 * conversas do Postgres) e devolve o número ou o motivo. É o que permite provar os casos sem
 * banco — e o que impede um teste de gravar custo de teste na fonte. Quem lê de fato é
 * `lerCustoLocal` (o livro-caixa) e `conversasDoPeriodo` (o cruzamento).
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
 * UMA linha de custo: por conversa, modelo e dia.
 *
 * `sessionId` é o `conversationId` do Postgres — é esta igualdade que dá VÍNCULO ao custo.
 * É `null` na chamada AVULSA: a que não nasceu de conversa (juiz, diagnóstico, insight de
 * lead) e por isso não tem a quem ser atribuída — ela entra no total numa linha própria
 * (`semConversa`), nunca é descartada (P314).
 *
 * `custoUsdCents` é `null` (e não zero) quando o preço não é conhecido: zero é um custo
 * medido, `null` é um preço que não se sabe.
 */
export interface LinhaDeCustoDeIA {
	sessionId: string | null;
	modelo: string;
	/** Dia do negócio (`YYYY-MM-DD`), no fuso da operação. */
	dia: string;
	/**
	 * Custo em centavos de DÓLAR — pode ter FRAÇÃO de centavo (é valor exato de token, não
	 * arredondado por linha); `null` = não há preço conhecido deste modelo (entrada, saída
	 * ou cache).
	 */
	custoUsdCents: number | null;
}

/** O recorte do custo das chamadas AVULSAS (sem conversa) dentro do total. */
export interface CustoDasChamadasAvulsas {
	/** Quantas linhas de `uso_de_ia` entraram no total sem conversa. */
	chamadas: number;
	usdCents: number;
	brlCents: number;
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
			/**
			 * A linha própria das chamadas que não têm conversa a quem atribuir: elas ESTÃO
			 * somadas em `usdCents`/`brlCents` acima, e aqui aparece a fatia delas.
			 */
			semConversa: CustoDasChamadasAvulsas;
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
	sem_dado: "O livro-caixa de uso de IA não tem nenhuma linha neste período.",
	sem_vinculo: "Há custo registrado, mas nenhuma conversa do período corresponde a ele.",
	modelo_sem_preco: "Há uso de um modelo sem preço cadastrado (entrada, saída ou cache).",
	sem_cotacao: "Há custo em dólar e não há cotação cadastrada para trazer ao real.",
	fonte_indisponivel: "A leitura do livro-caixa de IA (uso_de_ia, no Postgres) falhou.",
};

/** Converte centavos de dólar em centavos de real pela cotação cadastrada. */
function paraReal(usdCents: number, cotacaoUsdBrl: number): number {
	return Math.round(usdCents * cotacaoUsdBrl);
}

/** Soma por chave e devolve ordenado pela chave — determinístico para a tela. */
function agrupar(
	linhas: readonly LinhaDeCustoDeIA[],
	chaveDe: (linha: LinhaDeCustoDeIA) => string,
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
 * Três populações de linha saem do livro-caixa, e a diferença importa:
 *   - COM conversa que casa com uma conversa do período → entra no total e tem vínculo;
 *   - COM conversa que não casa → não entra (é o custo de outro recorte, quando o filtro de
 *     canal está ativo);
 *   - SEM conversa (avulsa) → entra no total, na linha própria `semConversa`.
 *
 * A ordem das guardas não é arbitrária — é a mesma lógica de `custoPor`
 * (campanhas-queries.ts): **falta de vínculo antes de falta de dado**, porque um
 * cruzamento que não fecha diz "olhe a atribuição", não "olhe a operação".
 */
export function somarCustoDeIA(args: {
	linhas: readonly LinhaDeCustoDeIA[];
	conversas: readonly ConversaDoPostgres[];
	cotacaoUsdBrl: number | null;
	/** Recorte opcional por canal — sem ele, os dois canais entram. */
	canal?: CanalDeIA;
}): ResultadoCustoDeIA {
	const conversas = args.canal
		? args.conversas.filter((conversa) => conversa.canal === args.canal)
		: [...args.conversas];

	// O CRUZAMENTO: só a linha de custo cuja conversa é uma conversa conhecida do período.
	const ids = new Set(conversas.map((conversa) => conversa.conversationId));
	const comConversa = args.linhas.filter(
		(linha): linha is LinhaDeCustoDeIA & { sessionId: string } => linha.sessionId !== null,
	);
	const comVinculo = comConversa.filter((linha) => ids.has(linha.sessionId));
	// As avulsas não têm vínculo a procurar: elas nunca tiveram conversa.
	const avulsas = args.linhas.filter((linha) => linha.sessionId === null);

	// Há custo de conversa e NENHUMA conversa do recorte corresponde a ele: o
	// cruzamento não fechou — mesmo que existam avulsas, dizer um total aqui seria
	// esconder que a maior parte do custo ficou sem atribuição.
	if (comConversa.length > 0 && comVinculo.length === 0) {
		return {
			tipo: "motivo",
			motivo: "sem_vinculo",
			explicacao: EXPLICACAO.sem_vinculo,
		};
	}

	// Livro-caixa vazio no período: nem com conversa, nem avulso.
	if (comVinculo.length === 0 && avulsas.length === 0) {
		return { tipo: "motivo", motivo: "sem_dado", explicacao: EXPLICACAO.sem_dado };
	}

	// O total GERAL — a conversa e a avulsa somam juntas: as duas são gasto de IA do período.
	const somadas = [...comVinculo, ...avulsas];

	// Modelo sem preço (de entrada/saída ou de cache): o total não pode ser calculado,
	// porque a soma parcial omitiria justamente a parcela que não se conhece.
	const semPreco = [
		...new Set(somadas.filter((l) => l.custoUsdCents === null).map((l) => l.modelo)),
	].sort();
	if (semPreco.length > 0) {
		return {
			tipo: "motivo",
			motivo: "modelo_sem_preco",
			explicacao: EXPLICACAO.modelo_sem_preco,
			modelosSemPreco: semPreco,
		};
	}

	const usdCents = somadas.reduce((total, linha) => total + (linha.custoUsdCents ?? 0), 0);

	// Sem cotação só é problema quando há custo: zero real continua sendo zero.
	if (args.cotacaoUsdBrl === null && usdCents > 0) {
		return { tipo: "motivo", motivo: "sem_cotacao", explicacao: EXPLICACAO.sem_cotacao };
	}

	const cotacao = args.cotacaoUsdBrl ?? 0;
	const usdAvulsas = avulsas.reduce((total, linha) => total + (linha.custoUsdCents ?? 0), 0);
	return {
		tipo: "valor",
		usdCents,
		brlCents: paraReal(usdCents, cotacao),
		conversas: conversas.length,
		porModelo: agrupar(somadas, (linha) => linha.modelo, cotacao),
		porDia: agrupar(somadas, (linha) => linha.dia, cotacao),
		semConversa: {
			chamadas: avulsas.length,
			usdCents: usdAvulsas,
			brlCents: paraReal(usdAvulsas, cotacao),
		},
	};
}
// ─── A borda: a leitura do LIVRO-CAIXA e o cruzamento com o Postgres ────────

/** Uma linha CRUA do livro-caixa local (`uso_de_ia`), como sai do banco. */
export interface UsoDeIaGravado {
	conversationId: string | null;
	modelo: string;
	tokensInput: number;
	tokensOutput: number;
	/** `null` = o provedor não reportou cache nesta linha (não medido, não é zero). */
	tokensCacheRead: number | null;
	tokensCacheWrite: number | null;
	criadoEm: Date;
}

/**
 * Converte o livro-caixa gravado em linha de custo, recalculando o valor dos tokens.
 *
 * A coluna `custo_usd_cents` NÃO é lida de propósito: ela é inteira e arredondada por
 * beat, e é essa soma de arredondamentos que zerava o custo do modelo barato. O valor
 * daqui é EXATO (fração de centavo); quem arredonda é a exibição/agregação.
 *
 * O cache do prompt entra na conta junto com entrada e saída (P217/P273): é a parcela que
 * decide o custo de um turno que repete a mesma caixa de prompt. Linha com cache reportado
 * e modelo sem preço de cache sai com `custoUsdCents` `null` — desconhecido, nunca zero.
 *
 * Linha SEM conversa não é descartada: vira `sessionId: null` e o total é somado numa linha
 * própria (P314). Antes ela sumia, e o custo que juiz/diagnóstico/insight gastam era gasto
 * invisível.
 */
export function linhasDoLivroLocal(linhas: readonly UsoDeIaGravado[]): LinhaDeCustoDeIA[] {
	return linhas.map((l) => ({
		sessionId: l.conversationId,
		modelo: l.modelo,
		dia: diaDoNegocio(l.criadoEm),
		custoUsdCents: custoDoTurnoCentsExatos({
			modelo: l.modelo,
			tokensInput: l.tokensInput,
			tokensOutput: l.tokensOutput,
			cacheRead: l.tokensCacheRead ?? undefined,
			cacheWrite: l.tokensCacheWrite ?? undefined,
		}),
	}));
}

/** Lê o livro-caixa local do período. Server-only. */
export async function lerCustoLocal(de: Date, ate: Date): Promise<LinhaDeCustoDeIA[]> {
	const linhas = await db
		.select({
			conversationId: usoDeIa.conversationId,
			modelo: usoDeIa.modelo,
			criadoEm: usoDeIa.criadoEm,
			tokensInput: usoDeIa.tokensInput,
			tokensOutput: usoDeIa.tokensOutput,
			tokensCacheRead: usoDeIa.tokensCacheRead,
			tokensCacheWrite: usoDeIa.tokensCacheWrite,
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
	lerUso(de: Date, ate: Date): Promise<LinhaDeCustoDeIA[]>;
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
		// não carregou. O motivo NOMEADO conta o que aconteceu — e ele aponta para o
		// Postgres (`uso_de_ia`), que é a fonte de verdade do número desde 19/10/2026
		// (L43/P220).
		console.error("[custo-de-ia] leitura do livro-caixa (uso_de_ia) falhou:", erro);
		return {
			tipo: "motivo",
			motivo: "fonte_indisponivel",
			explicacao: EXPLICACAO.fonte_indisponivel,
		};
	}
}
