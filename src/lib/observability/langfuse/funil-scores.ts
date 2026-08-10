// Ponte TurnTraceRecord → scores do Langfuse.
//
// Por que existe: o gate JÁ era conhecido em produção (vira output do span
// `route`/`routeFinal` e campo do `[turn-trace]` no log), mas ficava preso
// DENTRO do payload de um span. Dava pra ler abrindo o trace na mão; não dava
// pra filtrar, contar nem montar dashboard. Era dado, não dimensão.
//
// A escolha de virar SCORE (e não tag/metadata) não é estilo — é o que o
// servidor permite agregar. Medido na Metrics API do nosso Langfuse v3.225.1:
//   • view `traces` só aceita dimensão id, name, tags, userId, sessionId,
//     release, version, environment, timestampMonth — **metadata não é
//     dimensionável**, então gate em metadata nunca viraria gráfico;
//   • dimensão `tags` agrupa pelo ARRAY INTEIRO ("channel:web,gate:credit" é
//     um bucket diferente de "channel:web,gate:identify"), então tag explode a
//     cardinalidade e não soma por gate;
//   • view `scores-categorical` tem dimensão `stringValue` — agrupar por valor
//     do score é nativo. É o único caminho que dá funil de verdade.
// O canal não precisa de score: `traceName` (`turn:web` / `turn:whatsapp`) já
// é dimensão em TODAS as views de score, então todo gráfico daqui cruza com
// canal de graça.
//
// Lei da casa: observabilidade NUNCA derruba o turno. Tudo aqui é try/catch e
// no-op sem credencial.
import type { TurnTraceRecord } from "@/lib/telemetry/turn-trace";
import { getLangfuseClient } from "./client";

/**
 * Régua de profundidade do funil, para a métrica "quão longe a conversa foi".
 *
 * A ORDEM canônica de execução é do código (`nextGate`, qualify-state.ts) —
 * este mapa não compete com ela, é a tradução daquela cascata numa escala
 * numérica para conseguir `max(value) por sessão` = ponto mais fundo que o
 * cliente alcançou. Sem escala não existe gráfico de conversão.
 *
 * `doubts-wait` está de fora DE PROPÓSITO: é pausa (o cliente perguntou algo e
 * o funil segura), não posição. Pontuá-lo afundaria a média de quem está indo
 * bem e só fez uma pergunta. Ele continua aparecendo no score categórico
 * `gate` — dá pra contar quanto tempo o funil passa em espera — só não conta
 * como profundidade.
 */
const PROFUNDIDADE_DO_GATE: Record<string, number> = {
	name: 1,
	desire: 2,
	experience: 3,
	credit: 4,
	timeframe: 5,
	identify: 6,
	search: 7,
	"reco-consent": 8,
	lance: 9,
	"lance-value": 10,
	"lance-embutido": 11,
	"simulator-offer": 12,
	decision: 13,
	contract: 14,
};

/** Maior profundidade da régua — o denominador de "% do funil percorrido". */
export const PROFUNDIDADE_MAXIMA = Math.max(...Object.values(PROFUNDIDADE_DO_GATE));

export function profundidadeDoGate(gate: string | null): number | null {
	if (!gate) return null;
	return PROFUNDIDADE_DO_GATE[gate] ?? null;
}

type Score = {
	name: string;
	value: string | number;
	dataType: "CATEGORICAL" | "NUMERIC" | "BOOLEAN";
	comment?: string;
};

/**
 * Traduz o registro fechado de um turno na lista de scores que ele merece.
 *
 * Função PURA — é ela que os testes exercitam. A publicação (efeito) fica em
 * `publicarFunilNoLangfuse`, que só existe para ser um try/catch em volta
 * disto. Score só é emitido quando o dado EXISTE: campo ausente vira ausência
 * de score, nunca um zero inventado (zero é uma medição, `null` não é).
 */
export function scoresDoTurno(record: TurnTraceRecord): Score[] {
	const scores: Score[] = [];

	// O funil, nas duas formas que a Metrics API sabe agregar: categórico pra
	// contar turnos por gate (barra), numérico pra medir profundidade (conversão).
	if (record.gate) {
		scores.push({ name: "gate", value: record.gate, dataType: "CATEGORICAL" });
		const passo = profundidadeDoGate(record.gate);
		if (passo !== null) {
			scores.push({ name: "funil_passo", value: passo, dataType: "NUMERIC" });
		}
	}

	// Turno mudo: o agente processou e não escreveu UMA letra. Do lado do
	// cliente é a app travada. Hoje isso só aparecia se alguém lesse o log.
	scores.push({
		name: "turno_mudo",
		value: record.textChars === 0 ? 1 : 0,
		dataType: "BOOLEAN",
	});

	// Guard engoliu um card que o modelo tentou emitir (reveal-loop,
	// post-closure, contract-gate, single-option…). Um é higiene; recorrente é
	// o agente batendo na porta trancada — sintoma de prompt/estado errado.
	scores.push({
		name: "artefato_suprimido",
		value: record.suppressed.length > 0 ? 1 : 0,
		dataType: "BOOLEAN",
		...(record.suppressed.length > 0 ? { comment: record.suppressed.join(", ") } : {}),
	});

	scores.push({
		name: "handoff",
		value: record.handoff ? 1 : 0,
		dataType: "BOOLEAN",
	});

	scores.push({
		name: "tools_chamadas",
		value: record.toolCount,
		dataType: "NUMERIC",
		...(record.toolsCalled.length > 0 ? { comment: record.toolsCalled.join(", ") } : {}),
	});

	// `finish_reason` é o mais barato dos sinais de defeito: "tool-error-
	// recovered" e afins já são emitidos pelo orquestrador e nunca chegavam a
	// lugar nenhum que desse pra somar.
	if (record.finishReason) {
		scores.push({
			name: "finish_reason",
			value: record.finishReason,
			dataType: "CATEGORICAL",
		});
	}
	if (record.leadStage) {
		scores.push({ name: "lead_stage", value: record.leadStage, dataType: "CATEGORICAL" });
	}
	if (record.persona) {
		scores.push({ name: "persona", value: record.persona, dataType: "CATEGORICAL" });
	}

	return scores;
}

/**
 * Publica os scores do turno no trace Langfuse ATIVO.
 *
 * Depende de estar dentro do callback de `withLangfuseTurn` — é o caso nos
 * dois canais: web finaliza dentro do wrapper (route.ts) e WhatsApp finaliza
 * no `finally` do generator, que roda dentro de `consumeEventsInner`.
 * Fora de contexto o SDK simplesmente descarta, sem lançar.
 */
export function publicarFunilNoLangfuse(record: TurnTraceRecord): void {
	const client = getLangfuseClient();
	if (!client) return;
	try {
		for (const score of scoresDoTurno(record)) {
			client.score.activeTrace(score);
		}
	} catch (err) {
		console.error("[langfuse] publicar scores do funil falhou (ignorado):", err);
	}
}
