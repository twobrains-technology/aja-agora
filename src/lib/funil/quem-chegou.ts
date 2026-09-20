/**
 * "Quem chegou": o dicionário do bem e as faixas de valor.
 *
 * Pedido (d) da Bruna, sem AJA próprio: abaixo da porta do funil, a distribuição
 * de **quem iniciou a conversa** por Bem e por Faixa de valor — o "cheiro de
 * perfil" que a tela de Performance não dava. As duas listas usam
 * `bar-list.tsx`, que já existe.
 *
 * **Onde o dado mora** (levantado antes de escrever a query, como o goal pede):
 *
 * - **Bem**: `conversations.metadata.currentCategory` (`"auto" | "moto" |
 *   "imovel"`), a mesma coluna que a lista de Conversas e o pipeline já leem.
 * - **Faixa de valor**: `conversations.metadata.qualifyAnswers.creditMax`, o
 *   valor que a pessoa informou no gate de crédito. **`leads.credit_value` NÃO
 *   serve**: nenhum caminho do código escreve nessa coluna (ela existe no
 *   schema e nunca é populada) — quem carrega o valor é a proposta da Bevi, e
 *   isso só existe depois da contratação. A válvula registra a lacuna.
 */

import { ROTULO_DO_BEM } from "@/lib/admin/rotulo-do-bem";
import type { Bem } from "./textos-do-cta";

export { ROTULO_DO_BEM };

/** A ordem em que o dicionário aparece na tela — por volume esperado, não alfabética. */
export const BENS_NA_ORDEM: readonly Bem[] = ["auto", "imovel", "moto"];

/** De qual bem fala a chave técnica. `null` quando a conversa não escolheu nenhum. */
export function bemDaChave(chave: unknown): Bem | null {
	return chave === "auto" || chave === "moto" || chave === "imovel" ? chave : null;
}

/**
 * As faixas de valor que o painel mostra.
 *
 * Degraus redondos na escala em que as pessoas pensam dinheiro ("uns 80 mil",
 * "meio milhão") e que dividem bem as três categorias: moto cai inteira na
 * primeira, carro atravessa as três do meio, imóvel ocupa as duas de cima.
 *
 * Não é o `step` do slider de crédito (10k em auto, 5k em moto) — usar o passo
 * daria dezessete barras quase idênticas, e a lista perderia a única coisa que
 * ela existe para mostrar: onde está o volume.
 */
export const FAIXAS_DE_VALOR = [
	{ chave: "ate_50", rotulo: "Até R$ 50 mil", minimo: 0, maximo: 50_000 },
	{ chave: "de_50_a_100", rotulo: "R$ 50 mil a R$ 100 mil", minimo: 50_000, maximo: 100_000 },
	{ chave: "de_100_a_200", rotulo: "R$ 100 mil a R$ 200 mil", minimo: 100_000, maximo: 200_000 },
	{ chave: "de_200_a_500", rotulo: "R$ 200 mil a R$ 500 mil", minimo: 200_000, maximo: 500_000 },
	{
		chave: "acima_500",
		rotulo: "Acima de R$ 500 mil",
		minimo: 500_000,
		maximo: Number.POSITIVE_INFINITY,
	},
] as const;

export type ChaveDeFaixa = (typeof FAIXAS_DE_VALOR)[number]["chave"];

/** O rótulo de quem não informou valor — é a maior fatia esperada, e aparece. */
export const ROTULO_SEM_VALOR = "Valor não informado";

/**
 * Em que faixa cai o valor informado.
 *
 * O teto pertence à PRÓPRIA faixa: `R$ 50.000` é "Até R$ 50 mil", e não o
 * primeiro real da faixa seguinte. Sem uma regra fixa, o valor exato do degrau
 * entrava nas duas barras e a soma passava do total.
 */
export function faixaDeValor(valor: number | null | undefined): ChaveDeFaixa | null {
	if (valor === null || valor === undefined) return null;
	if (!Number.isFinite(valor) || valor <= 0) return null;
	for (const faixa of FAIXAS_DE_VALOR) {
		if (valor <= faixa.maximo) return faixa.chave;
	}
	return FAIXAS_DE_VALOR[FAIXAS_DE_VALOR.length - 1].chave;
}

export function rotuloDaFaixa(chave: ChaveDeFaixa): string {
	return FAIXAS_DE_VALOR.find((f) => f.chave === chave)?.rotulo ?? ROTULO_SEM_VALOR;
}
