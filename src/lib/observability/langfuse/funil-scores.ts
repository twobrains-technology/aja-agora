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
import { ambienteLangfuse } from "./env";

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

/** Como o gate chegou (ou não) ao cliente no WhatsApp. */
export type EntregaDoGate = "interactive" | "text" | "none";

/**
 * O gate disparou — ele chegou ao cliente?
 *
 * Nasceu de um defeito que passou por TODAS as redes existentes (trace
 * `be5cc1e6dd32923553d18a61a0dc505c`, produção, 2026-08-10): o cliente mandou
 * "oi" e recebeu "Oi, Kairo! Tudo certo?" — cortesia pura, gate `desire` sem
 * entrega nenhuma, venda parada no primeiro turno. Nada acusou:
 *
 *   • `turno_mudo` = 0 — o modelo ESCREVEU (só não perguntou nada);
 *   • `artefato_suprimido` = 0 — nenhum guard rodou;
 *   • `judge_resolved` = 1, `judge_tone` = 0.75 — os três juízes aprovaram,
 *     e com razão: a frase é educada, verdadeira e bem escrita. Juiz de
 *     qualidade de PROSA não enxerga funil que não andou.
 *
 * O único sinal existente era um `console.error("[gate-undelivered]")` — vivo
 * só no CloudWatch, invisível no Langfuse, impossível de agregar ou alertar.
 * Foram 8 ocorrências em 4 dias antes de alguém reparar, e o mesmo gate
 * reincidiu na mesma conversa (`credit` às 10:20 e de novo às 14:29).
 *
 * Booleano de propósito: a média vira "taxa de entrega do gate" num widget só,
 * e cruza de graça com o score categórico `gate` (qual gate afunda) e com
 * `traceName` (`turn:web` × `turn:whatsapp`) — as duas dimensões que dizem
 * ONDE consertar. É determinístico e custa zero: não depende de LLM julgar.
 */
export function scoreDeEntregaDoGate(gate: string, via: EntregaDoGate): Score[] {
	const scores: Score[] = [
		{
			name: "gate_entregue",
			value: via === "none" ? 0 : 1,
			dataType: "BOOLEAN",
			comment: `${gate} — ${via}`,
		},
	];
	// A taxa diz QUANTO afunda; só o categórico diz QUAL gate — e é o "qual"
	// que aponta o arquivo a consertar. `comment` não é dimensão no Langfuse
	// (nem `metadata`), então sem este score o painel mostraria um número que
	// ninguém consegue destrinchar. Emitido só no afundamento: gate entregue é
	// o caso normal e não precisa de cardinalidade.
	if (via === "none") {
		scores.push({ name: "gate_afundado", value: gate, dataType: "CATEGORICAL" });
	}
	return scores;
}

/** Publica a entrega do gate no trace ATIVO (o adapter do WhatsApp roda dentro
 * do callback de `withLangfuseTurn`, então há trace). No-op sem credencial. */
export function registrarEntregaDoGate(gate: string, via: EntregaDoGate): void {
	const client = getLangfuseClient();
	if (!client) return;
	try {
		const environment = ambienteLangfuse();
		for (const score of scoreDeEntregaDoGate(gate, via)) {
			client.score.activeTrace({ ...score, environment });
		}
	} catch (err) {
		console.error("[langfuse] registrar entrega do gate falhou (ignorado):", err);
	}
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
		// `environment` explícito em CADA score, e não é redundância: o
		// LangfuseSpanProcessor recebe o ambiente na construção e carimba os
		// spans, mas o LangfuseClient não aceita `environment` no construtor —
		// então score criado por ele cai em "default" mesmo com o trace em
		// "production". Visto ao vivo no primeiro turno após o deploy: trace em
		// production, scores do funil em default. Como o filtro de ambiente da UI
		// é global, isso sumiria com o funil inteiro de quem filtrasse produção.
		const environment = ambienteLangfuse();
		for (const score of scoresDoTurno(record)) {
			client.score.activeTrace({ ...score, environment });
		}
	} catch (err) {
		console.error("[langfuse] publicar scores do funil falhou (ignorado):", err);
	}
}
