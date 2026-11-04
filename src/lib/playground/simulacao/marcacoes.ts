// Marcações da simulação: funções puras sobre as transcrições lidas do NDJSON. Sem I/O.
//
// Regras (determinísticas; as heurísticas estão marcadas):
//  · chegou-a-proposta (SUCESSO): tool-call `fazer_proposta` E artifact em ARTIFACTS_DE_PROPOSTA.
//  · pedido-repetido (DEFEITO): `avaliarConversa` de golden.ts, regra `pedido-repetido`, filtrada: só
//    vale quando uma PERGUNTA do vendedor pede o dado (menção em afirmação ou oferta não conta).
//  · card-que-nao-apareceu (DEFEITO): (a) `mostrar_card` de tipo X sem artifact do tipo X no turno (o servidor emite o artifact com
//    outro id, então não casa por toolCallId) ou, em comparison_table, com ids diferentes dos pedidos;
//    (b) HEURÍSTICA: texto com verbo de mostrar + substantivo de card e nenhum artifact no turno.
//    A direção inversa (card com carta que o texto não cita) NÃO é defeito (P10).
//  · resposta-cortada (DEFEITO): HEURÍSTICA — último balão sem pontuação final, stream sem `final`
//    com texto parcial, ou `erro` depois de texto. O finishReason do modelo não chega (o motor
//    emite sempre "complete"), então isto é só texto.
//  · turno-sem-resposta (DEFEITO): sem texto, ou balão igual à frase de reserva do motor.
//  · numero-sem-ferramenta (DEFEITO): `R$ …` afirmado que nenhum card, fala do cliente ou catálogo
//    conhecido sustenta (±1, `contexto-nao-dito` de golden.ts). Só valores em R$.
//  · chamou-fila (INFORMATIVA): tool-call `falar_com_humano`; o veredito decide se era esperado.
//  · falou-prazo (DEFEITO): HEURÍSTICA — P8 proíbe prometer prazo de atendimento.

import { avaliarConversa, slotsPedidos, type TurnoDeConversa } from "@/lib/agent/pi/eval/golden";
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

/** Pergunta que só oferece (seguir, saber mais, buscar) ou aponta outra opção não pede o dado. */
const OFERTA_NAO_PEDIDO =
	/\bquer\s+(?:saber|seguir|que\s+eu)\b|\boutr[ao]s?\s+(?:faixas?|valores?|parcelas?)\b/i;

/** O vendedor PEDE o slot: alguma frase com `?` que não seja oferta casa o padrão do slot. */
function perguntaPedeSlot(texto: string, slot: string): boolean {
	return texto
		.split(/(?<=[?!.])\s+|\n+/)
		.map((f) => f.trim())
		.filter((f) => f.endsWith("?") && !OFERTA_NAO_PEDIDO.test(f))
		.some((f) => (slotsPedidos(f) as string[]).includes(slot));
}

export function pedidoRepetido(t: TurnoDaSimulacao[]): Marcacao {
	const oc = avaliarConversa(conversaDe(t))
		.filter((a) => a.regra === "pedido-repetido")
		.filter((a) => {
			const turno = t[Math.floor(a.turno / 2)];
			const slot = a.evidencia.split(":", 1)[0];
			return turno ? perguntaPedeSlot(textoDoVendedor(turno.vendedor), slot) : true;
		})
		.map((a) => ({ turno: turnoDaPosicao(t, a.turno), evidencia: corto(a.evidencia) }));
	return montar("pedido-repetido", oc);
}

const VERBO_DE_MOSTRAR =
	/\b(segue|seguem|olha|olhe|mostrei|mandei|veja|confira|d[áa]\s+uma\s+olhada)\b/i;
const SUBSTANTIVO_DE_CARD = /\b(tabela|card|cards|op[çc][õo]es|op[çc][ãa]o|cartas?)\b/i;

function pedidoDoCard(input: unknown): { tipo: string; ids: string[] | null } | null {
	if (typeof input !== "object" || input === null) return null;
	const { tipo, payload } = input as { tipo?: unknown; payload?: unknown };
	if (typeof tipo !== "string") return null;
	const ids = (payload as { ids?: unknown } | null | undefined)?.ids;
	const lista = Array.isArray(ids) ? ids.filter((i): i is string => typeof i === "string") : null;
	return { tipo, ids: tipo === "comparison_table" && lista && lista.length > 0 ? lista : null };
}

/** Sem ids pedidos, qualquer artifact do tipo serve; com ids, todos têm de estar nos `groups`. */
function idsBatem(pedidos: string[] | null, payload: Record<string, unknown>): boolean {
	if (!pedidos) return true;
	const groups = Array.isArray(payload.groups) ? payload.groups : [];
	const naTela = new Set(
		groups.flatMap((g) => {
			const r = g as { id?: unknown; groupId?: unknown };
			return [r.id, r.groupId].filter((x): x is string => typeof x === "string");
		}),
	);
	return pedidos.every((id) => naTela.has(id));
}

export function cardQueNaoApareceu(t: TurnoDaSimulacao[]): Marcacao {
	const oc: Ocorrencia[] = [];
	for (const turno of t) {
		const v = turno.vendedor;
		const livres = [...v.artifacts];
		for (const c of v.toolCalls) {
			if (c.toolName !== "mostrar_card") continue;
			const pedido = pedidoDoCard(c.input);
			if (!pedido) continue;
			const mesmoTipo = livres.filter((x) => x.artifactType === pedido.tipo);
			if (mesmoTipo.length === 0) {
				oc.push({
					turno: turno.indice,
					evidencia: `mostrar_card ${pedido.tipo} (${c.toolCallId}) sem artifact desse tipo`,
				});
				continue;
			}
			const achado = mesmoTipo.find((x) => idsBatem(pedido.ids, x.payload)) ?? null;
			if (!achado) {
				oc.push({
					turno: turno.indice,
					evidencia: `mostrar_card ${pedido.tipo} (${c.toolCallId}): ids do card diferem dos pedidos (${pedido.ids?.join(", ")})`,
				});
				continue;
			}
			livres.splice(livres.indexOf(achado), 1);
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
