import { describe, expect, it } from "vitest";
import { allowGateWithArtifacts } from "./runner";

// ============================================================================
// BUG-SIMULATOR-OFFER-ENGOLIDO (2026-06-04, achado pelo eval Camada 3 + revisor
// adversarial P0): o guard anti-atropelo do runner (`!producedArtifact`) NUNCA
// deixava o gate simulator-offer ser emitido — o turno do reveal produz cards
// (recommendation/simulation) e TODO turno seguinte também produzia artifact
// (whatsapp_optin → decision_prompt), então a oferta do simulador (docx passo 4,
// linha 39: "na sequência" do reveal) morria engolida e o usuário ia direto pro
// card de decisão sem nunca ver o simulador do Bernardo.
//
// Fix: o gate simulator-offer é EXCEÇÃO do guard quando o turno apresentou os
// cards do reveal — cards + "que tal?" no MESMO turno, como o docx desenha.
// ============================================================================

describe("allowGateWithArtifacts — exceção do simulator-offer no turno do reveal", () => {
	it("simulator-offer é elegível no MESMO turno que apresentou o reveal", () => {
		expect(
			allowGateWithArtifacts("simulator-offer", ["recommendation_card", "simulation_result"]),
		).toBe(true);
		expect(allowGateWithArtifacts("simulator-offer", ["simulation_result"])).toBe(true);
		expect(allowGateWithArtifacts("simulator-offer", ["group_card"])).toBe(true);
	});

	it("anti-atropelo segue valendo: gates de coleta NÃO furam artifacts", () => {
		expect(allowGateWithArtifacts("lance-embutido", ["simulation_result"])).toBe(false);
		expect(allowGateWithArtifacts("decision", ["recommendation_card"])).toBe(false);
		expect(allowGateWithArtifacts("reco-consent", ["comparison_table"])).toBe(false);
		expect(allowGateWithArtifacts("timeframe", ["recommendation_card"])).toBe(false);
	});

	it("simulator-offer NÃO fura artifacts que não são do reveal (ex.: optin)", () => {
		expect(allowGateWithArtifacts("simulator-offer", ["whatsapp_optin"])).toBe(false);
		expect(allowGateWithArtifacts("simulator-offer", ["lead_form"])).toBe(false);
	});
});

// ============================================================================
// FIX-320 (rodada 10, veredito Sonnet A.4 — P0 novo): `nextGate()` calcula
// "experience" como o PRIMEIRO gate pós-reveal (qualify-state.ts:266-267) — ou
// seja, no MESMO turno em que `revealCompleted` vira true (o turno que
// apresenta os cards do reveal). Mas o guard anti-atropelo só perdoava
// `simulator-offer`: qualquer turno que reapresentasse um REVEAL_ARTIFACT (ex.:
// "Quero ver todas" reabrindo comparison_table) matava a chance de
// "experience" disparar. Como TODA a cascata pós-reveal (reco-consent,
// timeframe, lance…) fica bloqueada atrás de `experience` (nextGate só avança
// quando `experiencePrev` está setado), o gate nunca encontrava um turno
// "limpo" — o usuário real NUNCA via "Você já fez consórcio antes?" (achado ao
// vivo, dossiês Madalena+Mario onda 4). Mesma receita do BUG-SIMULATOR-OFFER-
// ENGOLIDO: `experience` também é elegível no turno que apresenta o reveal.
// ============================================================================
describe("allowGateWithArtifacts — FIX-320: exceção do experience no turno do reveal", () => {
	it("experience é elegível no MESMO turno que apresentou o reveal (mesma receita do simulator-offer)", () => {
		expect(allowGateWithArtifacts("experience", ["recommendation_card"])).toBe(true);
		expect(allowGateWithArtifacts("experience", ["comparison_table"])).toBe(true);
		expect(allowGateWithArtifacts("experience", ["group_card"])).toBe(true);
		expect(allowGateWithArtifacts("experience", ["simulation_result"])).toBe(true);
	});

	it("experience NÃO fura artifacts que não são do reveal (ex.: optin)", () => {
		expect(allowGateWithArtifacts("experience", ["whatsapp_optin"])).toBe(false);
		expect(allowGateWithArtifacts("experience", ["lead_form"])).toBe(false);
	});
});
