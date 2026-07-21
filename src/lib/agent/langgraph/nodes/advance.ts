// Nó `advance` — FIX-360 (funil completo, Rodada 1). Roda ENTRE `route` e
// `converse`: transições de RAPPORT (motivo/espelho) e os marcadores de
// dispatch/resposta dos gates pós-reveal (reco-consent, simulator-offer,
// lance-embutido, lance-value) que `nextGate`/`decideShowGate`
// (qualify-state.ts, reusados tal-e-qual em `route.ts`) LEEM mas não
// ESCREVEM — esses são side-effects de o SISTEMA ter mostrado/reconhecido
// uma resposta, não algo que o analyzer extrai do texto livre.
//
// NÃO ENGESSAR: este nó nunca decide O QUE o modelo fala nem TRAVA a
// conversa — só atualiza flags de estado que `nextGate`/`decideShowGate` já
// consultam. O `converse` (nó seguinte) sempre gera a fala via
// `model.stream()`, cego a este nó.

import { parseAssetValue } from "@/lib/agent/parse-asset-value";
import type { Category } from "@/lib/agent/personas";
import { LANCE_EMBUTIDO_DEFAULT_PERCENT } from "@/lib/agent/qualify-config";
import {
	shouldAskMotive,
	shouldMirrorMotivation,
	type UserIntent,
} from "@/lib/agent/qualify-state";
import { projectToMeta } from "../emit";
import type { AgentGraphStateType, FunnelState } from "../state";

/** Heurística determinística de sim/não em texto livre — mesmo papel de
 * `detectYesNoText` (orchestrator/index.ts): consome os gates
 * reco-consent/simulator-offer/lance-embutido quando a resposta vem
 * digitada. Duplicada aqui (não importada) de propósito — módulo
 * `langgraph/` é ownership isolado desta onda; `index.ts` está sob mudança
 * paralela em outros blocos. Mesma lista de marcadores, mesmo filtro de
 * intent (pergunta/dúvida/confuso/off-topic/quer-mais-opções nunca contam). */
const YES_TEXT_MARKERS =
	/\b(sim|quero|considero|considerar|pode|pode ser|mostra|mostrar|topo|bora|vamos|manda ver|isso mesmo|show|beleza|claro|positivo|certo|ok)\b/i;
const NO_TEXT_MARKERS = /\bn[ãa]o\b/i;

export function detectYesNoText(text: string, intent: UserIntent): boolean | null {
	if (
		intent === "asking_question" ||
		intent === "expressing_doubt" ||
		intent === "confused" ||
		intent === "off_topic" ||
		intent === "wants_more_options"
	) {
		return null;
	}
	const t = text.trim();
	if (!t) return null;
	if (NO_TEXT_MARKERS.test(t)) return false;
	if (YES_TEXT_MARKERS.test(t)) return true;
	return null;
}

export function advanceFunnelNode(state: AgentGraphStateType): Partial<AgentGraphStateType> {
	if (!state.isUserTurn) return {};

	const meta = projectToMeta(state);
	const intent: UserIntent = state.intent ?? "neutral";
	let funnel: FunnelState = state.funnel;

	// ── Rapport: motivo (turno próprio) → espelho (turno seguinte) ──
	// Reusa os predicados PUROS do runtime Vercel tal-e-qual (mesma
	// suppressão já aplicada por `decideShowGate` dentro de `route.ts`) — só
	// marca o beat como já rodado, uma vez cada, nunca os dois no mesmo turno.
	if (shouldAskMotive(meta) && !funnel.motivationAsked) {
		funnel = { ...funnel, motivationAsked: true };
	} else if (shouldMirrorMotivation(meta) && !funnel.motivationMirrored) {
		funnel = { ...funnel, motivationMirrored: true };
	}

	// ── reco-consent: dispatch na 1ª vez, resposta reconhecida depois ──
	if (state.gate === "reco-consent") {
		if (!funnel.recoConsentDispatched) {
			funnel = { ...funnel, recoConsentDispatched: true };
		} else if (!funnel.recoConsentAnswered && detectYesNoText(state.userText, intent) === true) {
			funnel = { ...funnel, recoConsentAnswered: true };
		}
	}

	// ── simulator-offer: dispatch na EMISSÃO (mesmo padrão do runtime
	// Vercel, comentário em qualify-state.ts:200) — `nextGate` só consulta
	// `simulatorOfferDispatched` (nunca `simulatorOfferAnswered`), então o
	// convite é estruturalmente um passe de 1 turno: assim que `routeFinal`
	// recomputa com a flag já true, o funil já avança pra "decision" no
	// PRÓXIMO turno, independente de o usuário confirmar o dial (o card
	// numérico do dial em si é o "what-if" de sempre, tool-call do modelo —
	// TODO(rodada-2): tool dedicada de contemplation_dial no toolset). ──
	if (state.gate === "simulator-offer" && !funnel.simulatorOfferDispatched) {
		funnel = { ...funnel, simulatorOfferDispatched: true };
	}

	// ── lance-embutido: educa + opt-in por texto livre ──
	if (state.gate === "lance-embutido" && funnel.qualifyAnswers.lanceEmbutido === undefined) {
		const answer = detectYesNoText(state.userText, intent);
		if (answer !== null) {
			funnel = {
				...funnel,
				qualifyAnswers: {
					...funnel.qualifyAnswers,
					lanceEmbutido: answer,
					lanceEmbutidoPercent: answer ? LANCE_EMBUTIDO_DEFAULT_PERCENT : undefined,
				},
			};
		}
	}

	// ── lance-value: backstop determinístico (mesmo padrão do FIX-115 pro
	// creditMax) — o valor do lance nunca é derivado, só lido do texto do
	// usuário quando ele traz um marcador explícito (R$/mil/milhão/k). ──
	if (state.gate === "lance-value" && funnel.qualifyAnswers.lanceValue === undefined) {
		const parsed = parseAssetValue(state.userText, {
			gate: "lance-value",
			category: funnel.currentCategory as Category | undefined,
		});
		if (parsed !== null) {
			funnel = {
				...funnel,
				qualifyAnswers: { ...funnel.qualifyAnswers, lanceValue: parsed },
			};
		}
	}

	return { funnel };
}
