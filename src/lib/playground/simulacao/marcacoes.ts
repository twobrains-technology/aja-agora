// Marcações da simulação: funções puras sobre as transcrições lidas do NDJSON. Sem I/O.
//
// Regras (determinísticas; as heurísticas estão marcadas):
//  · chegou-a-proposta (SUCESSO): tool-call `fazer_proposta` E artifact em ARTIFACTS_DE_PROPOSTA.
//  · pedido-repetido (DEFEITO): `avaliarConversa` de golden.ts, regra `pedido-repetido`.
//  · card-que-nao-apareceu (DEFEITO): (a) `mostrar_card` sem artifact de mesmo toolCallId E
//    sem artifact de mesmo artifactType que o `tipo` do input (o servidor emite o artifact com
//    toolCallId próprio); (b) HEURÍSTICA: texto com verbo de mostrar + substantivo de card e
//    nenhum artifact no turno.
//    A direção inversa (card com carta que o texto não cita) NÃO é defeito (P10).
//  · resposta-cortada (DEFEITO): HEURÍSTICA — último balão sem pontuação final, stream sem `final`
//    com texto parcial, ou `erro` depois de texto. O finishReason do modelo não chega (o motor
//    emite sempre "complete"), então isto é só texto.
//  · turno-sem-resposta (DEFEITO): sem texto, ou balão igual à frase de reserva do motor.
//  · numero-sem-ferramenta (DEFEITO): `R$ …` afirmado que nenhum card, fala do cliente ou catálogo
//    conhecido sustenta (±1, `contexto-nao-dito` de golden.ts). Só valores em R$.
//  · chamou-fila (INFORMATIVA): tool-call `falar_com_humano`; o veredito decide se era esperado.
//  · falou-prazo (DEFEITO): HEURÍSTICA — P8 proíbe prometer prazo de atendimento.

import {
	avaliarConversa,
	type Slot,
	slotsPedidos,
	type TurnoDeConversa,
} from "@/lib/agent/pi/eval/golden";
import type {
	ContextoDeMarcacao,
	DadosDaSimulacao,
	Gravidade,
	Marcacao,
	MarcacaoId,
	Ocorrencia,
	TurnoDaSimulacao,
	TurnoLido,
} from "./tipos";

/** Q7: `fazer_proposta` emite o fecho como `real_offer` (`realOfferPresentation` →
 *  `aplicarItensDoFecho`, tools-livres.ts). `signature_handoff` etc. vêm depois do aceite. */
export const ARTIFACTS_DE_PROPOSTA: readonly string[] = ["real_offer"];

/** Frases que o motor injeta quando o modelo não falou (turno-livre.ts:1777-1778). */
export const FRASES_DE_RESERVA_DO_MOTOR: readonly string[] = [
	"Achei essas opções pra você. Alguma te interessa?",
	"Desculpa, me perdi aqui. Pode me contar de novo o que você quer?",
];

const GRAVIDADE: Record<MarcacaoId, Gravidade> = {
	"chegou-a-proposta": "SUCESSO",
	"pedido-repetido": "DEFEITO",
	"card-que-nao-apareceu": "DEFEITO",
	"resposta-cortada": "DEFEITO",
	"turno-sem-resposta": "DEFEITO",
	"numero-sem-ferramenta": "DEFEITO",
	"chamou-fila": "INFORMATIVA",
	"falou-prazo": "DEFEITO",
};

function montar(id: MarcacaoId, ocorrencias: Ocorrencia[]): Marcacao {
	return {
		id,
		status: ocorrencias.length > 0 ? "ACIONADA" : "LIMPA",
		gravidade: GRAVIDADE[id],
		ocorrencias,
	};
}

function naoAplicavel(id: MarcacaoId, motivo: string): Marcacao {
	return {
		id,
		status: "NAO_APLICAVEL",
		gravidade: GRAVIDADE[id],
		ocorrencias: [],
		motivoNaoAplicavel: motivo,
	};
}

/** Balões do vendedor: os do `final`; sem `final`, os do stream. */
function baloesDoTurno(l: TurnoLido): string[] {
	const finais = l.baloesFinais.map((b) => b.texto).filter((t) => t.trim() !== "");
	if (finais.length > 0) return finais;
	return l.textoDosEventos.filter((t) => t.trim() !== "");
}

function textoDoVendedor(l: TurnoLido): string {
	return baloesDoTurno(l).join("\n\n");
}

/** Todos os números de um payload, recursivo: `number` finito e string numérica ("977,12"). */
export function numerosDoPayload(payload: unknown): number[] {
	const out: number[] = [];
	const visitar = (v: unknown): void => {
		if (typeof v === "number") {
			if (Number.isFinite(v)) out.push(v);
		} else if (typeof v === "string") {
			const s = v.trim();
			if (/^-?\d+(?:[.,]\d+)?$/.test(s)) {
				const n = Number(s.replace(",", "."));
				if (Number.isFinite(n)) out.push(n);
			}
		} else if (Array.isArray(v)) {
			for (const x of v) visitar(x);
		} else if (typeof v === "object" && v !== null) {
			for (const x of Object.values(v)) visitar(x);
		}
	};
	visitar(payload);
	return out;
}

const corto = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n)}…` : s);

export function chegouAProposta(t: TurnoDaSimulacao[]): Marcacao {
	const oc: Ocorrencia[] = [];
	for (const turno of t) {
		const v = turno.vendedor;
		const chamou = v.toolCalls.some((c) => c.toolName === "fazer_proposta");
		const card = v.artifacts.find((a) => ARTIFACTS_DE_PROPOSTA.includes(a.artifactType));
		if (chamou && card) {
			oc.push({ turno: turno.indice, evidencia: `fazer_proposta + ${card.artifactType}` });
		}
	}
	return montar("chegou-a-proposta", oc);
}

function conversaDe(t: TurnoDaSimulacao[], conhecidos: number[] = []): TurnoDeConversa[] {
	const conversa: TurnoDeConversa[] = [];
	for (const [i, turno] of t.entries()) {
		conversa.push({
			role: "user",
			content: turno.cliente.texto,
			cards: [],
			valores: i === 0 ? conhecidos.map(String) : [],
		});
		conversa.push({
			role: "assistant",
			content: textoDoVendedor(turno.vendedor),
			cards: turno.vendedor.artifacts.map((a) => a.artifactType),
			valores: turno.vendedor.artifacts.flatMap((a) => numerosDoPayload(a.payload).map(String)),
		});
	}
	return conversa;
}

/** Posição na conversa intercalada (user/assistant) → índice do turno da simulação. */
const turnoDaPosicao = (t: TurnoDaSimulacao[], pos: number): number =>
	t[Math.floor(pos / 2)]?.indice ?? Math.floor(pos / 2);

// Falso positivo do `pedido-repetido` (golden.ts): `slotsPedidos` casa o slot em qualquer
// frase, inclusive quando o agente só REafirma um valor ("as parcelas ficaram abaixo dos seus
// 1.300") sem pedir nada. A marcação só vale pedido: frase terminada em "?" com o slot, ou
// imperativo de pedido. A frase só declarativa não pede — e não acusa.
const PERGUNTA_OU_IMPERATIVO = /\?|\bme\s+(?:passa|diz|manda|confirma)\b/i;

function slotPerguntado(texto: string, slot: Slot): boolean {
	return texto
		.split(/(?<=[.!?…])\s+/)
		.some((frase) => slotsPedidos(frase).includes(slot) && PERGUNTA_OU_IMPERATIVO.test(frase));
}

export function pedidoRepetido(t: TurnoDaSimulacao[]): Marcacao {
	const oc = avaliarConversa(conversaDe(t))
		.filter((a) => a.regra === "pedido-repetido")
		.map((a) => ({
			achado: a,
			turno: turnoDaPosicao(t, a.turno),
			evidencia: corto(a.evidencia),
		}))
		// evidencia é `${slot}: …`; o nome do slot vem antes do primeiro ":".
		.filter((x) => {
			const l = t.find((y) => y.indice === x.turno);
			if (!l) return true;
			const slot = x.achado.evidencia.slice(0, x.achado.evidencia.indexOf(":")) as Slot;
			return slotPerguntado(textoDoVendedor(l.vendedor), slot);
		})
		.map(({ turno, evidencia }) => ({ turno, evidencia }));
	return montar("pedido-repetido", oc);
}

const VERBO_DE_MOSTRAR =
	/\b(segue|seguem|olha|olhe|mostrei|mandei|veja|confira|d[áa]\s+uma\s+olhada)\b/i;
const SUBSTANTIVO_DE_CARD = /\b(tabela|card|cards|op[çc][õo]es|op[çc][ãa]o|cartas?)\b/i;

/** O `tipo` do input do `mostrar_card`, se o input o traz. */
function tipoDoInput(input: unknown): string | null {
	if (typeof input !== "object" || input === null) return null;
	const tipo = (input as { tipo?: unknown }).tipo;
	return typeof tipo === "string" && tipo.trim() !== "" ? tipo : null;
}

export function cardQueNaoApareceu(t: TurnoDaSimulacao[]): Marcacao {
	const oc: Ocorrencia[] = [];
	for (const turno of t) {
		const v = turno.vendedor;
		const ids = new Set(v.artifacts.map((a) => a.toolCallId));
		for (const c of v.toolCalls) {
			if (c.toolName !== "mostrar_card") continue;
			if (ids.has(c.toolCallId)) continue; // artifact do mesmo toolCallId: apareceu
			const tipo = tipoDoInput(c.input);
			// Prova real (simulação): o artifact sai com toolCallId próprio; o que importa é o
			// artifactType == input.tipo. Só ausência de artifact é card ausente.
			if (tipo && v.artifacts.some((a) => a.artifactType === tipo)) continue;
			oc.push({
				turno: turno.indice,
				evidencia: `mostrar_card (${tipo ? `tipo ${tipo}, ` : ""}${c.toolCallId}) sem artifact correspondente`,
			});
		}
		const texto = textoDoVendedor(v);
		if (
			v.artifacts.length === 0 &&
			VERBO_DE_MOSTRAR.test(texto) &&
			SUBSTANTIVO_DE_CARD.test(texto)
		) {
			oc.push({
				turno: turno.indice,
				evidencia: `texto fala de card, nenhum card saiu: ${corto(texto)}`,
			});
		}
	}
	return montar("card-que-nao-apareceu", oc);
}

const TERMINA_BEM = /(?:[.!?…)"”»:]|\p{Extended_Pictographic}\uFE0F?)$/u;

export function respostaCortada(t: TurnoDaSimulacao[]): Marcacao {
	const oc: Ocorrencia[] = [];
	for (const turno of t) {
		const v = turno.vendedor;
		const baloes = baloesDoTurno(v);
		const ultimo = baloes[baloes.length - 1]?.trim();
		if (!ultimo) continue; // sem texto é do turno-sem-resposta
		if (!TERMINA_BEM.test(ultimo)) {
			oc.push({ turno: turno.indice, evidencia: `termina sem pontuação: …${ultimo.slice(-60)}` });
		} else if (!v.finalRecebido && v.baloesFinais.length === 0) {
			oc.push({ turno: turno.indice, evidencia: "stream acabou sem `final` com texto parcial" });
		} else if (v.erro) {
			oc.push({ turno: turno.indice, evidencia: `erro depois de texto: ${corto(v.erro)}` });
		}
	}
	return montar("resposta-cortada", oc);
}

export function turnoSemResposta(t: TurnoDaSimulacao[]): Marcacao {
	const oc: Ocorrencia[] = [];
	for (const turno of t) {
		const v = turno.vendedor;
		const baloes = baloesDoTurno(v);
		if (baloes.length === 0) {
			const causa = v.erro ? `erro: ${corto(v.erro)}` : `HTTP ${v.httpStatus}`;
			oc.push({ turno: turno.indice, evidencia: `sem texto (${causa})` });
			continue;
		}
		const reserva = baloes.find((b) => FRASES_DE_RESERVA_DO_MOTOR.includes(b.trim()));
		if (reserva)
			oc.push({ turno: turno.indice, evidencia: `frase de reserva do motor: ${reserva}` });
	}
	return montar("turno-sem-resposta", oc);
}

export function numeroSemFerramenta(
	t: TurnoDaSimulacao[],
	numerosConhecidos: number[] | null,
): Marcacao {
	if (numerosConhecidos === null) {
		return naoAplicavel("numero-sem-ferramenta", "sem fonte de números (catálogo desconhecido)");
	}
	const oc = avaliarConversa(conversaDe(t, numerosConhecidos))
		.filter((a) => a.regra === "contexto-nao-dito")
		.map((a) => ({ turno: turnoDaPosicao(t, a.turno), evidencia: a.evidencia }));
	return montar("numero-sem-ferramenta", oc);
}

export function chamouFila(t: TurnoDaSimulacao[], dados: DadosDaSimulacao): Marcacao {
	const oc: Ocorrencia[] = [];
	for (const turno of t) {
		if (turno.vendedor.toolCalls.some((c) => c.toolName === "falar_com_humano")) {
			oc.push({ turno: turno.indice, evidencia: "falar_com_humano" });
		}
	}
	if (oc.length > 0) return montar("chamou-fila", oc);
	const confirmado = t.some((x) => x.vendedor.dadosEcoados !== null);
	if (dados.fonteDeDados === "duble" && !confirmado) {
		return naoAplicavel("chamou-fila", "servidor não confirmou o dublê da fila");
	}
	return montar("chamou-fila", []);
}

const PRAZO: readonly RegExp[] = [
	/\bem\s+(?:alguns\s+|poucos\s+)?(?:minutos|instantes)\b/i,
	/\bdaqui\s+a\s+pouco\b/i,
	/\bem\s+at[ée]\s+\d+\s?(?:min|h|hora)/i,
	/\bj[áa]\s+j[áa]\b/i,
	/\blogo\s+menos\b/i,
];
const EM_BREVE_COM_ATENDIMENTO =
	/\bem\s+breve\b[\s\S]*\b(?:te\s+chama|te\s+atende|entra\s+em\s+contato)\b|\b(?:te\s+chama|te\s+atende|entra\s+em\s+contato)\b[\s\S]*\bem\s+breve\b/i;

export function falouPrazo(t: TurnoDaSimulacao[]): Marcacao {
	const oc: Ocorrencia[] = [];
	for (const turno of t) {
		for (const balao of baloesDoTurno(turno.vendedor)) {
			const re = PRAZO.find((r) => r.test(balao));
			const achou = re
				? balao.match(re)?.[0]
				: EM_BREVE_COM_ATENDIMENTO.test(balao)
					? "em breve"
					: null;
			if (achou) oc.push({ turno: turno.indice, evidencia: `"${achou}" em: ${corto(balao)}` });
		}
	}
	return montar("falou-prazo", oc);
}

export function marcarSimulacao(t: TurnoDaSimulacao[], ctx: ContextoDeMarcacao): Marcacao[] {
	return [
		chegouAProposta(t),
		pedidoRepetido(t),
		cardQueNaoApareceu(t),
		respostaCortada(t),
		turnoSemResposta(t),
		numeroSemFerramenta(t, ctx.numerosConhecidos),
		chamouFila(t, ctx.dados),
		falouPrazo(t),
	];
}
