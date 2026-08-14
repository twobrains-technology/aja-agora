// Os invariantes de `qualifyAnswers` num lugar só.
//
// Por que existe (dossiê 2026-08-14, ponto 2): a faixa de crédito tinha CINCO
// escritores espalhados por três arquivos — `analyzeAndMerge`, os dois guards
// pós-reveal, o escape de gate preso e a nova faixa do `converse`. Cada um
// gravava do seu jeito, e os reverts mexiam só no `creditMax` enquanto quem
// escrevia gravava o par (`creditMin = creditMax × 0,9`). O resultado em
// produção foi um estado com `creditMin: 18000` e `creditMax: 6424` indo para a
// busca da Bevi — piso acima do teto, resposta impossível.
//
// A classe do defeito é a DISPERSÃO, não cada escrita. Por isso o invariante
// mora aqui e os write-sites passam por aqui.
//
// O que é invariante (código) e o que não é: a faixa e o vínculo dela com a
// categoria são dado que vai para a administradora — aritmética verificável,
// não julgamento. Como o agente FALA sobre o valor continua sendo do modelo.
import { clampCreditToCategory } from "@/lib/agent/qualify-config";
import type { Category, QualifyAnswers } from "./personas";

/** A razão histórica entre piso e teto quando o cliente dá só o valor do bem.
 *  Estava repetida em dois arquivos como literal; agora tem nome. */
const PISO_SOBRE_TETO = 0.9;

export function pisoPadraoPara(creditMax: number): number {
	return Math.round(creditMax * PISO_SOBRE_TETO);
}

/**
 * Qual pergunta vai à administradora: pelo valor do bem ou pela parcela?
 *
 * A Bevi aceita as duas (`TOTAL_VALUE` e `INSTALLMENT_VALUE`). O que não pode é
 * o servidor decidir isso implicitamente — era o que fazia: "tem `creditMax`?
 * então busca por valor". Como a derivação parcela→crédito DEFINIA um
 * `creditMax`, a busca por parcela virava inalcançável no exato momento em que
 * era pedida, e a Bevi recebia um crédito abaixo do piso que ela mesma aceita.
 *
 * O default preserva o comportamento anterior: sem discriminante, só há alvo por
 * parcela quando não existe valor do bem nenhum (o caso do FIX-382).
 */
export function alvoDeBusca(q: QualifyAnswers): "valor" | "parcela" {
	if (q.alvoDeBusca) return q.alvoDeBusca;
	return q.creditMax === undefined && (q.parcelaAlvo ?? 0) > 0 ? "parcela" : "valor";
}

/**
 * O estado tem piso acima do teto?
 *
 * É o predicado que o sinal determinístico `estado_incoerente` usa — e a razão
 * de ele existir: em produção esse par chegou à busca sem nada acusar.
 */
export function faixaIncoerente(q: QualifyAnswers): boolean {
	const { creditMin, creditMax } = q;
	if (creditMin === undefined || creditMax === undefined) return false;
	return creditMin > creditMax;
}

/**
 * Grava a faixa de crédito mantendo o par coerente.
 *
 * Regras, todas verificáveis:
 *   • sem `creditMax` novo, nada muda (não se inventa faixa do nada);
 *   • piso omitido → derivado do teto;
 *   • piso informado acima do teto → rebaixado ao teto (nunca gravado invertido);
 *   • com categoria, o piso respeita o mínimo da faixa dela — mas nunca ao
 *     custo de passar do teto, que é o valor real que o cliente pediu.
 */
export function aplicarFaixaDeCredito(
	q: QualifyAnswers,
	faixa: { creditMax?: number; creditMin?: number | null },
	categoria?: Category | null,
): QualifyAnswers {
	const { creditMax } = faixa;
	if (creditMax === undefined) return q;

	const clamp = categoria ? clampCreditToCategory(creditMax, categoria) : null;
	const teto = clamp ? clamp.value : creditMax;

	const pisoPedido = faixa.creditMin ?? pisoPadraoPara(teto);
	// A ordem importa: subir ao mínimo da categoria primeiro, depois cortar no
	// teto. O corte no teto é o último a falar — é ele que impede a inversão.
	const pisoNaFaixa = clamp ? Math.max(pisoPedido, clamp.min) : pisoPedido;

	// Dizer o valor do bem é escolher o alvo: quem pediu parcela e depois diz
	// "na verdade quero uma de 30 mil" volta a ser buscado por valor.
	return {
		...q,
		creditMax: teto,
		creditMin: Math.min(pisoNaFaixa, teto),
		alvoDeBusca: "valor",
	};
}

/**
 * Reverte a faixa para um estado anterior — o PAR, nunca só o teto.
 *
 * O guard pós-reveal revertia apenas `creditMax` e deixava o `creditMin` da
 * faixa desfeita no estado. Foi assim que o par final da conversa ficou
 * `18000 > 6424`: o teto voltou, o piso não.
 */
export function reverterFaixaDeCredito(
	q: QualifyAnswers,
	anterior: Pick<QualifyAnswers, "creditMax" | "creditMin">,
): QualifyAnswers {
	const revertido: QualifyAnswers = { ...q };
	if (anterior.creditMax === undefined) {
		revertido.creditMax = undefined;
		revertido.creditMin = undefined;
		return revertido;
	}
	revertido.creditMax = anterior.creditMax;
	revertido.creditMin =
		anterior.creditMin === undefined ? undefined : Math.min(anterior.creditMin, anterior.creditMax);
	return revertido;
}

/**
 * A troca de categoria como ela acontece de verdade: invalida o bem anterior e
 * reaplica o que o cliente disse NESTE turno.
 *
 * Os dois passos são inseparáveis. "Na verdade quero uma moto de 20 mil" troca
 * a categoria e informa o valor no MESMO turno — invalidar sem reaplicar
 * apagaria o número que ele acabou de dar, e o funil perguntaria de novo o que
 * já foi respondido (que é a outra metade da conversa que morreu).
 */
export function aplicarTrocaDeCategoria(
	q: QualifyAnswers,
	extraidoNesteTurno: {
		creditMax?: number | null;
		creditMin?: number | null;
		desiredItem?: string | null;
	},
	novaCategoria: Category,
): QualifyAnswers {
	const limpo = invalidarPorTrocaDeCategoria(q);
	const comItem =
		extraidoNesteTurno.desiredItem != null
			? { ...limpo, desiredItem: extraidoNesteTurno.desiredItem }
			: limpo;
	if (extraidoNesteTurno.creditMax == null) return comItem;

	const comFaixa = aplicarFaixaDeCredito(
		comItem,
		{ creditMax: extraidoNesteTurno.creditMax, creditMin: extraidoNesteTurno.creditMin },
		novaCategoria,
	);
	return { ...comFaixa, creditMentionedAtDesire: undefined };
}

/**
 * O cliente trocou de bem: o que era do BEM anterior morre, o que é da PESSOA
 * fica.
 *
 * Sem isto, o R$ 1,5 milhão da casa sobreviveu à troca para moto e voltou duas
 * vezes como ação: na pergunta enlatada "Uns R$ 1.500.000 então, é isso?" (via
 * `gate-questions.ts`, que lê `creditMentionedAtDesire`) e na promoção do
 * escape de gate preso (`qualify-state.ts`). Não era lixo inerte — era uma
 * pergunta absurda numa conversa sobre uma moto de R$ 20 mil.
 *
 * Prazo, lance, poupança mensal, FGTS e motivação NÃO são do bem: quem podia
 * juntar R$ 800 por mês para a casa continua podendo para a moto. Apagá-los
 * faria o funil reperguntar tudo a cada troca de ideia.
 */
export function invalidarPorTrocaDeCategoria(q: QualifyAnswers): QualifyAnswers {
	const {
		creditMax: _creditMax,
		creditMin: _creditMin,
		creditMentionedAtDesire: _mencionado,
		creditClampedFrom: _clampado,
		valorDoBemAlvo: _valorDoBem,
		desiredItem: _item,
		creditoMinimoInformado: _pisoBevi,
		...daPessoa
	} = q;
	return daPessoa;
}
