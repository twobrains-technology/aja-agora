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

	it("anti-atropelo segue valendo: outros gates NÃO furam artifacts", () => {
		expect(allowGateWithArtifacts("experience", ["recommendation_card"])).toBe(false);
		expect(allowGateWithArtifacts("lance-embutido", ["simulation_result"])).toBe(false);
		expect(allowGateWithArtifacts("decision", ["recommendation_card"])).toBe(false);
	});

	it("simulator-offer NÃO fura artifacts que não são do reveal (ex.: optin)", () => {
		expect(allowGateWithArtifacts("simulator-offer", ["whatsapp_optin"])).toBe(false);
		expect(allowGateWithArtifacts("simulator-offer", ["lead_form"])).toBe(false);
	});
});
