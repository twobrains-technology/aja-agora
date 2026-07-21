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

/** Sim/não em texto livre — FONTE ÚNICA, importada do orchestrator. Era
 * duplicada aqui, e a cópia ficou para trás: mantinha o bug em que o "não"
 * ganhava sempre por ser testado primeiro, então "não sei, pode mostrar sim"
 * virava recusa. Duas cópias da mesma heurística = uma delas sempre desatualiza.
 */
import { detectYesNoText } from "@/lib/agent/orchestrator/yes-no";

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
		} else if (!funnel.recoConsentAnswered) {
			// O convite aceita SIM e NÃO — os dois resolvem o gate. Só o SIM
			// resolvia, então "não quero" congelava o funil para sempre (nunca vinha
			// decisão, nunca vinha contrato) e a venda morria em silêncio.
			const resposta = detectYesNoText(state.userText, intent);
			if (resposta === true) {
				funnel = { ...funnel, recoConsentAnswered: true };
			} else if (resposta === false) {
				funnel = { ...funnel, recoConsentAnswered: true, recoConsentDeclined: true };
			}
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
