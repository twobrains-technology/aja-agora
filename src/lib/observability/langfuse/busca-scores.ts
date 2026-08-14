// Os sinais da BUSCA — o que faltava para a conversa de 13/08 ter acusado algo.
//
// Naquela sessão (`fa0533a0-…`), medidos no Langfuse de produção: `tool_falhou`
// = 0, `turno_mudo` = 0, `card_sem_fala` = 0. Nada acusou, e não por acaso: a
// busca RODOU e devolveu resposta — a pergunta é que estava errada — e o agente
// ESCREVEU em todos os turnos. Todo sinal existente media "a máquina falhou?".
// Nenhum media "a máquina fez a pergunta certa?".
//
// Estes medem exatamente isso, e só com fato de servidor:
//
//   `busca_abaixo_do_piso`   o alvo que saiu é impossível para a administradora
//   `busca_vazia`            a busca voltou em branco
//   `busca_esgotada`         voltou em branco de novo, mesmo alvo
//   `estado_incoerente`      piso acima do teto, ou alvo que contradiz a busca
//   `oferta_contradiz_parcela`  o card na tela nega, na aritmética, o que ele pediu
//
// Nenhum lê a fala do agente. Fala se mede com juiz sobre volume (Langfuse),
// não com guard — é a regra do CLAUDE.md deste projeto, e a razão de o último
// sinal olhar `monthlyPayment` (um número do servidor) em vez de procurar
// "encontrei ótimas opções" no texto.
//
// Booleanos de propósito: no Langfuse a média de um score booleano É a taxa, e
// é sobre ela que o Monitor alerta.
import type { Category } from "@/lib/agent/personas";
import { creditoBuscavel } from "@/lib/consorcio/credito-minimo";
import { getLangfuseClient } from "./client";
import { ambienteLangfuse } from "./env";
import type { Score } from "./funil-scores";

/** A partir de quantas buscas vazias seguidas o alvo é dado como esgotado.
 *  Mesmo limiar que o funil já usa para trocar de estratégia (`nextGate`). */
const STREAK_ESGOTADO = 2;

/** Quantas vezes a parcela da oferta pode passar da pedida antes de virar
 *  contradição. Duas: a carta real vem em denominações do grupo e nunca bate
 *  exato — o que não se explica é uma parcela 31× maior, que foi o caso. */
const FATOR_TOLERADO = 2;
const FATOR_GRAVE = 3;

export type BuscaDespachada = {
	alvo: "valor" | "parcela";
	categoria: Category;
	creditMax?: number;
	creditMin?: number;
	parcelaAlvo?: number;
	/** Piso que a própria Bevi informou nesta conversa — precede o default. */
	creditoMinimoInformado?: number;
	/** A busca voltou sem nenhuma oferta utilizável. */
	vazia?: boolean;
	/** Quantas vazias seguidas, contando esta. */
	streak?: number;
};

/**
 * Os scores de uma busca despachada.
 *
 * `busca_abaixo_do_piso` deveria ser sempre 0 por construção — o `route` não
 * despacha faixa impossível. Ele existe justamente por isso: qualquer 1 é a
 * prova de que a barreira furou, que foi o que aconteceu quatro vezes seguidas.
 */
export function scoresDeBuscaDespachada(b: BuscaDespachada): Score[] {
	const scores: Score[] = [{ name: "busca_alvo", value: b.alvo, dataType: "CATEGORICAL" }];

	// O piso vale para o crédito. Quem busca por parcela não tem crédito-alvo —
	// medi-lo contra o piso produziria alarme falso em todo cliente de menor
	// renda, exatamente quem o caminho por parcela existe para atender.
	const abaixoDoPiso =
		b.alvo === "valor" && !creditoBuscavel(b.creditMax, b.creditoMinimoInformado);
	scores.push({
		name: "busca_abaixo_do_piso",
		value: abaixoDoPiso ? 1 : 0,
		dataType: "BOOLEAN",
		...(abaixoDoPiso
			? { comment: `creditMax=${b.creditMax ?? "ausente"} categoria=${b.categoria}` }
			: {}),
	});

	const streak = b.streak ?? 0;
	const alvoDescrito =
		b.alvo === "parcela" ? `parcela=${b.parcelaAlvo}` : `creditMax=${b.creditMax}`;
	scores.push({
		name: "busca_vazia",
		value: b.vazia ? 1 : 0,
		dataType: "BOOLEAN",
		...(b.vazia ? { comment: `streak=${streak} ${alvoDescrito} categoria=${b.categoria}` } : {}),
	});
	scores.push({
		name: "busca_esgotada",
		value: b.vazia && streak >= STREAK_ESGOTADO ? 1 : 0,
		dataType: "BOOLEAN",
		...(b.vazia && streak >= STREAK_ESGOTADO
			? { comment: `${alvoDescrito} streak=${streak}` }
			: {}),
	});

	return scores;
}

export type EstadoDoFunil = {
	creditMin?: number;
	creditMax?: number;
	alvo?: "valor" | "parcela";
	/** Como a busca do turno de fato saiu — quando saiu. */
	buscaDespachadaPor?: "valor" | "parcela";
};

/**
 * O estado que vai para a administradora é aritmeticamente possível?
 *
 * Duas incoerências, ambas verificáveis sem opinião: piso acima do teto (o par
 * `18000 > 6424` que produção gravou), e alvo declarado por parcela cuja busca
 * saiu por valor — os "trilhos paralelos" que fizeram a Bevi receber uma
 * pergunta que ninguém fez.
 */
export function scoresDeEstadoIncoerente(e: EstadoDoFunil): Score[] {
	const motivos: string[] = [];
	if (e.creditMin !== undefined && e.creditMax !== undefined && e.creditMin > e.creditMax) {
		motivos.push(`faixa invertida: min=${e.creditMin} > max=${e.creditMax}`);
	}
	if (e.alvo && e.buscaDespachadaPor && e.alvo !== e.buscaDespachadaPor) {
		motivos.push(`alvo=${e.alvo} mas a busca saiu por ${e.buscaDespachadaPor}`);
	}
	return [
		{
			name: "estado_incoerente",
			value: motivos.length > 0 ? 1 : 0,
			dataType: "BOOLEAN",
			...(motivos.length > 0 ? { comment: motivos.join(" · ") } : {}),
		},
	];
}

/**
 * A oferta que está indo para a tela cabe no que ele disse que pode pagar?
 *
 * É aritmética pura, e é o único sinal que teria pego o turno das 23:32:35: o
 * cliente pediu R$ 200 por mês e o card mostrou R$ 6.270,48 — 31 vezes mais.
 * Nenhum sinal existente viu (a busca rodou, o card saiu, o agente falou), e os
 * três juízes aprovaram o turno.
 */
export function scoresDeOfertaContradizParcela(o: {
	parcelaAlvo?: number;
	monthlyPayment?: number;
}): Score[] {
	if (!o.parcelaAlvo || o.parcelaAlvo <= 0 || !o.monthlyPayment || o.monthlyPayment <= 0) return [];

	const fator = o.monthlyPayment / o.parcelaAlvo;
	const contradiz = fator > FATOR_TOLERADO;
	const scores: Score[] = [
		{
			name: "oferta_contradiz_parcela",
			value: contradiz ? 1 : 0,
			dataType: "BOOLEAN",
			...(contradiz
				? {
						comment: `pediu R$ ${o.parcelaAlvo}/mês, card com R$ ${o.monthlyPayment.toFixed(2)} (${fator.toFixed(1)}×)`,
					}
				: {}),
		},
	];
	// A gravidade vira dimensão própria: `comment` não é filtrável no Langfuse, e
	// sem ela o painel mostra uma taxa que ninguém consegue destrinchar (mesma
	// lição de `gate_afundado` e `tool_falha_nome`).
	if (contradiz) {
		scores.push({
			name: "oferta_contradiz_parcela_gravidade",
			value: fator > FATOR_GRAVE ? "acima_de_3x" : "acima_de_2x",
			dataType: "CATEGORICAL",
		});
	}
	return scores;
}

/** Publica no trace ATIVO. No-op sem credencial — alerta nunca derruba turno. */
function publicar(scores: Score[], contexto: string): void {
	if (scores.length === 0) return;
	const client = getLangfuseClient();
	if (!client) return;
	try {
		const environment = ambienteLangfuse();
		for (const score of scores) client.score.activeTrace({ ...score, environment });
	} catch (err) {
		console.error(`[langfuse] ${contexto} falhou (ignorado):`, err);
	}
}

export function registrarBuscaDespachada(b: BuscaDespachada): void {
	publicar(scoresDeBuscaDespachada(b), "registrar busca despachada");
}

export function registrarEstadoDoFunil(e: EstadoDoFunil): void {
	publicar(scoresDeEstadoIncoerente(e), "registrar estado do funil");
}

export function registrarOfertaExibida(o: { parcelaAlvo?: number; monthlyPayment?: number }): void {
	publicar(scoresDeOfertaContradizParcela(o), "registrar oferta exibida");
}
