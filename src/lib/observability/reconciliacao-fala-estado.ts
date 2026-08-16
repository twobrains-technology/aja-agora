/**
 * RECONCILIAÇÃO FALA × ESTADO — o sinal que teria pego a venda perdida.
 *
 * ## Por que não é juiz
 *
 * No turno em que o agente anunciou "você está oficialmente pré-cadastrado no
 * consórcio do Itaú, o boleto chega na sua casa", todos os indicadores estavam
 * verdes: `turno_mudo` 0,000, `card_sem_fala` 0,000, `finish_reason` ok em 65 de
 * 65 turnos da janela, e o juiz LLM deu **0,923** de `judge_avancou`. Nenhum
 * deles podia acusar, porque o defeito não estava na FALA: estava no ESTADO —
 * `bevi_proposals = 0` para aquela conversa.
 *
 * Juiz LLM é hipótese; isto aqui é prova. Vinte passos a 95% dão 36% de ponta a
 * ponta — se dá para provar em código, não se gasta juiz.
 *
 * ## Por que deriva do banco, e não de um campo novo
 *
 * A definição natural de "travou no fecho" usaria o instante em que
 * `decisionDispatched` virou true. Só que esse flag é escrito em SETE lugares
 * diferentes, e acrescentar um `decisionDispatchedAt` em todos seria criar mais
 * uma regra escrita sete vezes — a causa estrutural que o dossiê de 2026-08-15
 * apurou, repetida no próprio remédio.
 *
 * O estado observável basta e é mais honesto: o card de decisão VIROU artifact
 * com timestamp, o formulário de contratação também, e as mensagens do cliente
 * têm hora. "Ofereci a decisão, o cliente respondeu duas vezes, e o formulário
 * nunca apareceu" é uma frase inteiramente derivável do que já está gravado.
 */

export type EstadoParaReconciliacao = {
	/** `maxStageReached` do metadata — até onde a conversa chegou. */
	maxStageReached: string | null;
	/** Quando o card de decisão foi oferecido. `null` = nunca foi. */
	decisaoOferecidaEm: Date | null;
	/** O `contract_form` chegou a ser emitido nesta conversa. */
	contratoOferecido: boolean;
	/** Mensagens do cliente DEPOIS do card de decisão. */
	mensagensDoUsuarioAposDecisao: number;
	/** Propostas registradas na administradora para esta conversa. */
	propostas: number;
};

export type ScoreDeReconciliacao = {
	name: string;
	value: number;
	dataType: "BOOLEAN";
	comment: string;
};

/**
 * Dois turnos de cliente depois da decisão sem o formulário aparecer.
 *
 * Um turno só não acusa: pode ser a conversa andando normalmente (o cliente
 * pergunta, o agente responde, o formulário vem em seguida). Dois é o ponto em
 * que o cliente já respondeu e o funil continua parado — na `9b9f9aab` foram
 * seis, e cada um deles foi lido pelo modelo como "siga fechando".
 */
const TURNOS_ATE_CONSIDERAR_TRAVADO = 2;

export function scoresDeReconciliacao(e: EstadoParaReconciliacao): ScoreDeReconciliacao[] {
	const scores: ScoreDeReconciliacao[] = [];

	if (
		e.decisaoOferecidaEm !== null &&
		!e.contratoOferecido &&
		e.mensagensDoUsuarioAposDecisao >= TURNOS_ATE_CONSIDERAR_TRAVADO
	) {
		scores.push({
			name: "funil_travado_no_fecho",
			value: 1,
			dataType: "BOOLEAN",
			comment:
				`O card de decisão foi oferecido, o cliente respondeu ${e.mensagensDoUsuarioAposDecisao} vezes ` +
				"e o `contract_form` nunca apareceu. O funil está preso no gate `decision` — " +
				"o agente segue conversando como se estivesse fechando.",
		});
	}

	if (e.maxStageReached === "em_negociacao" && e.propostas === 0) {
		scores.push({
			name: "venda_prometida_sem_proposta",
			value: 1,
			dataType: "BOOLEAN",
			comment:
				"A conversa alcançou `em_negociacao` e não existe nenhuma linha em `bevi_proposals`. " +
				"Se o agente falou em cota reservada, pré-cadastro ou boleto a caminho, ele falou de " +
				"algo que não aconteceu.",
		});
	}

	return scores;
}
