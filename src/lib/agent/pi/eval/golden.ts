// O JOGO DE REGRA DO CONDUCT — avaliado OFFLINE, na transcription.
//
// O eval roda SEM modelo juiz: cada regra é uma checagem determinística sobre os turnos
// gravados, porque o que se quer é o CONTRATO, não a opinião. As seis regras do padrão
// ouro:
//
//  1. `pergunta-repetida`      — a mesma pergunta em dois turnos.
//  2. `pergunta-fechada-sem-chip` — o modelo lista opções no texto e não mostra chip.
//  3. `contexto-nao-dito`       — número que o cliente nunca disse, sem card que o sustente.
//  4. `card-relistado`          — relista o card em texto (a skill manda comentar só a recomendada).
//  5. `pedido-repetido`         — o mesmo SLOT pedido de novo depois de o cliente ter respondido.
//  6. `dado-repetido`           — o mesmo número no texto e no card do turno, ou em dois turnos.
//
// 5 e 6 medem duplicidade de CONTEÚDO, não de string (`docs/qa/criterios-do-chat.md` § DUPLICIDADE,
// D-01/D-02/D-03): o medidor antigo casava pergunta por string e via 46 achados onde o medidor por
// slot vê 472. Eles são MEDIDA OFFLINE — nunca guarda de runtime, nunca guarda de balão.

import { opcoesDePerguntaFechada } from "@/lib/agent/pi/chips";

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
		| "contexto-nao-dito"
		| "card-relistado"
		| "pedido-repetido"
		| "dado-repetido";
	turno: number;
	evidencia: string;
};

/** Os sete slots do Q1 de `scripts/qa/medidor-duplicidade.sql:16-24`, com os mesmos nomes: sem
 *  isso a contagem do TS não é comparável com a do SQL. */
export type Slot = "tipo_de_bem" | "valor" | "parcela" | "cpf" | "nome" | "lance" | "aceite";

// O que põe a ESCOLHA na tela como algo clicável. Não é só quick_reply: a comparison_table e a
// group_card têm botão em cada linha — o cliente responde ali. A regra pergunta: a pergunta
// fechada teve AFORDANÇA de resposta na tela, não "saiu quick_reply".
export const CARTAO_CLICAVEL = [
	"quick_reply",
	"value_picker",
	"topic_picker",
	"comparison_table",
	"group_card",
	"decision_prompt",
	"two_paths",
	"recommendation_card",
	"welcome_categories",
];

// ─── O QUE O BALÃO PEDE (D-01) ────────────────────────────────────────────────────────────────
//
// Os padrões espelham o Q1 do SQL (`scripts/qa/medidor-duplicidade.sql:16-24`), inclusive na
// largueza dos de `cpf`/`parcela`/`lance`: é o que deixa as duas contagens no mesmo denominador.
// O que a regra acusa é o PEDIDO repetido, não a menção — quem decide se o balão pede é a mesma
// leitura que o SQL faz do balão.
const PADROES_DE_SLOT: Record<Slot, RegExp> = {
	tipo_de_bem:
		/\b(?:qual|que)\s+(?:tipo\s+de\s+)?(?:bem|ve[íi]culo)\b|\bo\s+que\s+voc[êe]\s+(?:quer|pretende)\s+(?:comprar|adquirir|conquistar)\b|\b(?:carro|moto|im[oó]vel)\s+ou\s+(?:carro|moto|im[oó]vel)\b/i,
	valor:
		/\bvalor\b|\bquanto\s+(?:custa|custaria|pretende|voc[êe]\s+quer|quer\s+gastar)\b|\bfaixa\s+de\s+valor\b/i,
	parcela: /\bparcela\b|\bpresta[çc][ãa]o\b|\bmensalidade\b|\bpor\s+m[êe]s\b/i,
	cpf: /\bcpf\b/i,
	nome: /\bseu\s+nome\b|\bcomo\s+(?:voc[êe]\s+)?se\s+chama\b|\bnome\s+completo\b/i,
	lance: /\blance\b/i,
	aceite:
		/\bposso\s+(?:seguir|criar|gerar|mandar)\b|\bseguimos\b|\bfechamos\b|\bconfirma\b|\best[áa]\s+bom\s+assim\b/i,
};

/** Os slots que o balão do agente PEDE. Um balão pode pedir mais de um. */
export function slotsPedidos(texto: string): Slot[] {
	return (Object.keys(PADROES_DE_SLOT) as Slot[]).filter((slot) =>
		PADROES_DE_SLOT[slot].test(texto),
	);
}

const CPF_RESPOSTA_RE = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/;
const NOME_PROPRIO_CURTO_RE = /^\p{Lu}[\p{L}']*(?:\s+\p{Lu}[\p{L}']*){0,2}$/u;

/** O cliente RESPONDEU o slot no turno dele. É o que separa "pedir de novo porque a pessoa já
 *  contou" (defeito) de "insistir porque ela não respondeu" (outra conversa). */
export function respondeuSlot(slot: Slot, textoDoCliente: string): boolean {
	const t = textoDoCliente.trim();
	switch (slot) {
		case "cpf":
			return CPF_RESPOSTA_RE.test(t) || /\d{11}/.test(t.replace(/[.\-\s]/g, ""));
		case "valor":
		case "parcela":
			return /\d/.test(t);
		case "tipo_de_bem":
			return /\b(carro|moto|im[oó]vel|caminh[ãa]o|terreno|casa|apartamento|servi[çc]o)\b/i.test(t);
		case "nome":
			return (
				/\bme\s+chamo\b|\bmeu\s+nome\s+(?:é|e)\b/i.test(t) ||
				(t.length <= 20 && !/\d/.test(t) && NOME_PROPRIO_CURTO_RE.test(t))
			);
		case "lance":
			return /\d/.test(t) || /\b(?:sim|n[ãa]o|talvez|tenho|n[ãa]o\s+tenho)\b/i.test(t);
		case "aceite":
			return /\b(?:sim|pode|de\s+acordo|claro|vamos|confirmo|t[áa])\b/i.test(t);
	}
}

// ─── O MESMO NÚMERO DUAS VEZES (D-02 e D-03) ─────────────────────────────────────────────────
//
// O piso de 100 é o mesmo do Q3b do SQL: sem ele, id de conversa, data e "3 meses" poluem a
// contagem e o número deixa de ser "dado de conversa".
const PISO_DE_DADO_DE_CONVERSA = 100;

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

/** Os números como aparecem escritos — é a comparação do Q2 do SQL (token a token). */
function numerosBrutosDoTexto(texto: string): string[] {
	return [...texto.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => m[0]);
}

/** Leituras numéricas de TODOS os números de um texto (não de uma token isolado). */
function leiturasDoTexto(texto: string): number[] {
	const out: number[] = [];
	for (const bruto of numerosBrutosDoTexto(texto)) out.push(...leiturasNumericas(bruto));
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
	const ditoPeloCliente = new Set<string>();
	const slotsJaPedidos = new Map<Slot, { turno: number; respondido: boolean }>();
	const numerosJaDitosPeloAgente = new Set<number>();

	for (let i = 0; i < turnos.length; i++) {
		const turno = turnos[i];
		if (turno.role === "user") {
			for (const n of numerosDeDinheiro(turno.content)) ditoPeloCliente.add(n);
			// 5. o cliente respondeu um slot que já tinha sido pedido
			for (const [slot, estado] of slotsJaPedidos) {
				if (!estado.respondido && respondeuSlot(slot, turno.content)) estado.respondido = true;
			}
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
			!turno.cards.some((c) => CARTAO_CLICAVEL.includes(c))
		) {
			achados.push({
				regra: "pergunta-fechada-sem-chip",
				turno: i,
				evidencia: turno.content.trim(),
			});
		}

		// 3. número que o agente afirma, que o cliente nunca disse e que nenhum card mostrou
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

		// 4. card relistado em texto
		if (turno.cards.includes("comparison_table")) {
			const linhas = turno.content.split(/\n+/).filter((l) => /^\s*(?:\d+[).:]|[-*–—•])\s/.test(l));
			if (linhas.length >= 3) {
				achados.push({ regra: "card-relistado", turno: i, evidencia: linhas.join(" | ") });
			}
		}

		// 5. pedido repetido por slot — o primeiro pedido de cada slot nunca acusa
		for (const slot of slotsPedidos(turno.content)) {
			const anterior = slotsJaPedidos.get(slot);
			if (anterior?.respondido) {
				achados.push({
					regra: "pedido-repetido",
					turno: i,
					evidencia: `${slot}: ${turno.content.trim()}`,
				});
			}
			slotsJaPedidos.set(slot, { turno: i, respondido: false });
		}

		// 6. dado repetido — (i) no texto e no card do MESMO turno; (ii) em dois turnos do agente
		const numerosDoCard = new Set<string>();
		for (const valor of turno.valores ?? []) {
			for (const bruto of numerosBrutosDoTexto(String(valor))) numerosDoCard.add(bruto);
		}
		const numerosJaNoTurno = new Set<string>();
		const leiturasJaAcusadasNoTurno = new Set<number>();
		for (const bruto of numerosBrutosDoTexto(turno.content)) {
			if (numerosJaNoTurno.has(bruto)) continue;
			numerosJaNoTurno.add(bruto);
			const leituras = leiturasNumericas(bruto).filter((n) => n >= PISO_DE_DADO_DE_CONVERSA);
			if (!leituras.length) continue;
			if (numerosDoCard.has(bruto)) {
				achados.push({ regra: "dado-repetido", turno: i, evidencia: `texto×card: ${bruto}` });
			}
			for (const n of leituras) {
				// um achado por número: "733" e "733,00" no mesmo turno são o mesmo dado
				if (leiturasJaAcusadasNoTurno.has(n)) continue;
				leiturasJaAcusadasNoTurno.add(n);
				if (numerosJaDitosPeloAgente.has(n)) {
					achados.push({ regra: "dado-repetido", turno: i, evidencia: `dois turnos: ${n}` });
				}
				numerosJaDitosPeloAgente.add(n);
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
