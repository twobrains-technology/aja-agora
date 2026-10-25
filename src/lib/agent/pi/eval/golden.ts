// O JOGO DE REGRA DO CONDUCT — avaliado OFFLINE, na transcription.
//
// O eval roda SEM modelo juiz: cada regra é uma checagem determinística sobre os turnos
// gravados, porque o que se quer é o CONTRATO, não a opinião. As cinco regras que o
// padrão ouro cobra:
//
//  1. `pergunta-repetida`      — a mesma pergunta em dois turnos.
//  2. `pergunta-fechada-sem-chip` — o modelo lista opções no texto e não mostra chip.
//  3. `dado-sem-aviso`          — pediu CPF/celular antes do aviso da LGPD.
//  4. `contexto-nao-dito`       — número que o cliente nunca disse, sem card que o sustente.
//  5. `card-relistado`          — relista o card em texto (a skill manda comentar só a recomendada).

import { opcoesDePerguntaFechada } from "@/lib/agent/pi/chips";
import { AVISO_LGPD_RE, PEDE_DADO_RE } from "@/lib/agent/pi/lgpd";

export type TurnoDeConversa = {
	role: "user" | "assistant";
	content: string;
	/** tipos dos cards daquele turno (vazio quando o turno é só texto) */
	cards: string[];
	/** números que o card daquele turno mostra (payload persistido). Sem isto, um número vindo
	 *  de um card ANTERIOR viraria "invenção" — e não é: foi mostrado. */
	valores?: string[];
};

export type Achado = {
	regra:
		| "pergunta-repetida"
		| "pergunta-fechada-sem-chip"
		| "dado-sem-aviso"
		| "contexto-nao-dito"
		| "card-relistado";
	turno: number;
	evidencia: string;
};

const CARD_DE_ESCOLHA = ["quick_reply", "value_picker", "topic_picker"];

function normalizarPergunta(texto: string): string {
	return texto.toLowerCase().replace(/\s+/g, " ").trim();
}

function perguntasDoTurno(texto: string): string[] {
	return texto
		.split(/(?<=[?!])\s+|\n+/)
		.map((f) => f.trim())
		.filter((f) => f.endsWith("?"))
		.map(normalizarPergunta);
}

/** Números de dinheiro que o texto afirma. */
function numerosDeDinheiro(texto: string): string[] {
	return [...texto.matchAll(/R\$\s?[\d.]+(?:\s?mil)?/gi)].map((m) => normalizarPergunta(m[0]));
}

/** Leituras possíveis de um número monetário ("60.000" pode ser 60000 ou 60,000). */
function leiturasNumericas(bruto: string): number[] {
	const limpo = bruto
		.replace(/R\$/i, "")
		.replace(/\s+|mil/gi, "")
		.trim();
	if (!limpo) return [];
	const out: number[] = [];
	const inteiro = Number(limpo.replace(/[.,]/g, ""));
	const decimal = Number(limpo.replace(",", "."));
	if (Number.isFinite(inteiro)) out.push(inteiro);
	if (Number.isFinite(decimal) && decimal !== inteiro) out.push(decimal);
	return out;
}

/** Leituras numéricas de TODOS os números de um texto (não de uma token isolado). */
function leiturasDoTexto(texto: string): number[] {
	const out: number[] = [];
	for (const m of texto.matchAll(/\d+(?:[.,]\d+)?/g)) out.push(...leiturasNumericas(m[0]));
	return out;
}

function cobertoPorCard(valor: number, mostrados: Set<number>): boolean {
	for (const c of mostrados) if (Math.abs(c - valor) <= 1) return true; // o texto arredonda: "R$ 787" e o card 787,64
	return false;
}

/**
 * Mensagens consecutivas do MESMO turno viram UM turno: o stream manda o texto e o card
 * em mensagens separadas, e o que sustenta um número é o card do turno, não da mensagem.
 * Sem isto, "parcela de R$ 733" virava invenção quando a tabela do mesmo turno existia.
 */
export function agruparEmTurnos(mensagens: TurnoDeConversa[]): TurnoDeConversa[] {
	const turnos: TurnoDeConversa[] = [];
	for (const m of mensagens) {
		const anterior = turnos[turnos.length - 1];
		if (m.role === "assistant" && anterior?.role === "assistant") {
			turnos[turnos.length - 1] = {
				role: "assistant",
				content: `${anterior.content}\n${m.content}`,
				cards: [...anterior.cards, ...m.cards],
				valores: [...(anterior.valores ?? []), ...(m.valores ?? [])],
			};
			continue;
		}
		turnos.push({ ...m, cards: [...m.cards] });
	}
	return turnos;
}

export function avaliarConversa(turnos: TurnoDeConversa[]): Achado[] {
	const achados: Achado[] = [];
	const perguntasJaFeitas = new Set<string>();
	let avisoVistoEm = -1;
	const ditoPeloCliente = new Set<string>();

	for (let i = 0; i < turnos.length; i++) {
		const turno = turnos[i];
		if (turno.role === "user") {
			for (const n of numerosDeDinheiro(turno.content)) ditoPeloCliente.add(n);
			continue;
		}

		// 1. pergunta repetida
		for (const p of perguntasDoTurno(turno.content)) {
			if (perguntasJaFeitas.has(p)) {
				achados.push({ regra: "pergunta-repetida", turno: i, evidencia: p });
			} else {
				perguntasJaFeitas.add(p);
			}
		}

		// 2. pergunta fechada sem chip
		if (
			opcoesDePerguntaFechada(turno.content).length >= 2 &&
			!turno.cards.some((c) => CARD_DE_ESCOLHA.includes(c))
		) {
			achados.push({
				regra: "pergunta-fechada-sem-chip",
				turno: i,
				evidencia: turno.content.trim(),
			});
		}

		// 3. dado antes do aviso
		if (AVISO_LGPD_RE.test(turno.content) && avisoVistoEm < 0) avisoVistoEm = i;
		if (PEDE_DADO_RE.test(turno.content) && avisoVistoEm < 0) {
			achados.push({ regra: "dado-sem-aviso", turno: i, evidencia: turno.content.trim() });
		}

		// 4. número que o agente afirma, que o cliente nunca disse e que nenhum card mostrou
		const mostrados = new Set<number>();
		for (let j = 0; j <= i; j++) {
			for (const v of turnos[j].valores ?? []) {
				const n = Number(String(v).replace(",", "."));
				if (Number.isFinite(n)) mostrados.add(n);
			}
		}
		const ditos = new Set<number>();
		for (let j = 0; j < i; j++) {
			if (turnos[j].role !== "user") continue;
			for (const v of leiturasDoTexto(turnos[j].content)) ditos.add(v);
		}
		for (const bruto of numerosDeDinheiro(turno.content)) {
			const leituras = leiturasNumericas(bruto);
			if (!leituras.length) continue;
			if (leituras.some((v) => ditos.has(v))) continue;
			if (leituras.some((v) => cobertoPorCard(v, mostrados))) continue;
			achados.push({ regra: "contexto-nao-dito", turno: i, evidencia: bruto });
		}

		// 5. card relistado em texto
		if (turno.cards.includes("comparison_table")) {
			const linhas = turno.content.split(/\n+/).filter((l) => /^\s*(?:\d+[).:]|[-*–—•])\s/.test(l));
			if (linhas.length >= 3) {
				achados.push({ regra: "card-relistado", turno: i, evidencia: linhas.join(" | ") });
			}
		}
	}
	return achados;
}

/** O placar por regra, para colar no relatório. */
export function placar(achados: Achado[]): Record<string, number> {
	const p: Record<string, number> = {};
	for (const a of achados) p[a.regra] = (p[a.regra] ?? 0) + 1;
	return p;
}
