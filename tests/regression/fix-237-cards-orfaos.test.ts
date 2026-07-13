import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// FIX-237 (Fable r1, D2.1 gap #3): `present_embedded_bid` e `present_scarcity`
// existiam (tool + schema + allowlist em tool-policy) mas eram ÓRFÃOS — ZERO
// directive/prompt instruía o modelo a chamá-los, então nunca apareciam em 4
// conduções reais. `directives.test.ts` trava que os directives EXISTEM;
// estes testes source-level travam que eles são de fato DISPARADOS nos pontos
// certos do funil (route.ts do gate lance-embutido; index.ts/route.ts do
// gate decision) — sem isso, a função existir não basta (o card continuaria
// órfão, exatamente o defeito original).

function readSource(rel: string): string {
	return readFileSync(resolve(process.cwd(), rel), "utf-8");
}

describe("FIX-237 — embedded_bid disparado no gate lance-embutido (route.ts)", () => {
	const route = readSource("src/app/api/chat/route.ts");

	it("importa buildEmbeddedBidDirective", () => {
		expect(route).toMatch(/buildEmbeddedBidDirective/);
	});

	it("todo pipeGatePrompt do gate lance-embutido é precedido por um directive turn de embedded_bid", () => {
		// Cada ocorrência de `gate: "lance-embutido"` no route deve ter, na janela
		// IMEDIATAMENTE anterior, a chamada do directive — senão o chip aparece
		// sozinho (texto puro) e o card nunca é mostrado, reproduzindo o gap.
		const marker = 'gate: "lance-embutido"';
		let idx = route.indexOf(marker);
		let occurrences = 0;
		while (idx !== -1) {
			occurrences++;
			const windowBefore = route.slice(Math.max(0, idx - 400), idx);
			expect(
				windowBefore,
				`ocorrência de gate:"lance-embutido" em offset ${idx} sem buildEmbeddedBidDirective nos 400 chars anteriores`,
			).toMatch(/buildEmbeddedBidDirective/);
			idx = route.indexOf(marker, idx + marker.length);
		}
		expect(occurrences, "esperava pelo menos 1 pipeGatePrompt do gate lance-embutido").toBeGreaterThan(
			0,
		);
	});
});

describe("FIX-237 — scarcity disparado antes do card de decisão (index.ts + route.ts)", () => {
	// FIX-331 (rodada 10): o bloco inline `nextGateToFire === "decision"` foi
	// extraído pra `dispatchDecisionCascade` (chamada tanto do caminho
	// pós-modelo quanto de um intercepto pré-modelo novo) — mesmo padrão de
	// extração que `pipeClosingCeremony` (route.ts) já usa, checado abaixo.
	it("orchestrator/index.ts: dispatchDecisionCascade (caminho normal, não so_parcela) dispara buildScarcityDirective antes de buildDecisionPromptDirective", () => {
		const idx = readSource("src/lib/agent/orchestrator/index.ts");
		expect(idx).toMatch(/buildScarcityDirective/);
		expect(idx).toMatch(/nextGateToFire === "decision"/);
		expect(idx).toMatch(/dispatchDecisionCascade/);
		const helperStart = idx.indexOf("async function* dispatchDecisionCascade");
		expect(helperStart, "dispatchDecisionCascade não encontrada em index.ts").toBeGreaterThan(-1);
		const nextFnStart = idx.indexOf("\nexport async function* runTurn", helperStart + 1);
		const decisionBlock = idx.slice(
			helperStart,
			nextFnStart > -1 ? nextFnStart : helperStart + 3000,
		);
		expect(decisionBlock).toMatch(/buildScarcityDirective/);
		expect(decisionBlock).toMatch(/buildDecisionPromptDirective/);
		// scarcity precede decision no texto (é disparado ANTES do card de decisão).
		expect(decisionBlock.indexOf("buildScarcityDirective")).toBeLessThan(
			decisionBlock.indexOf("buildDecisionPromptDirective"),
		);
	});

	// FIX-311 (r10-4, happy-path-ceremony): a cerimônia scarcity->decision_prompt
	// foi extraída pra uma função comum (pipeClosingCeremony) — os DOIS ramos do
	// simulator-offer (yes/aceite do simulador, no/recusa) religam nela, em vez
	// de cada um chamar buildScarcityDirective/buildDecisionPromptDirective
	// inline. O teste original (pré-FIX-311) checava as chamadas inline; agora
	// checa que os dois ramos religam o helper E que o PRÓPRIO helper dispara
	// scarcity antes de decision_prompt.
	it("route.ts: simulator-offer (yes e no) religam pipeClosingCeremony, que dispara buildScarcityDirective antes de buildDecisionPromptDirective", () => {
		const route = readSource("src/app/api/chat/route.ts");
		expect(route).toMatch(/buildScarcityDirective/);

		const simulatorBlockStart = route.indexOf('action.gate === "simulator-offer"');
		expect(simulatorBlockStart, "bloco simulator-offer não encontrado").toBeGreaterThan(-1);
		const nextBlockStart = route.indexOf("if (action.gate ===", simulatorBlockStart + 1);
		const simulatorBlock = route.slice(
			simulatorBlockStart,
			nextBlockStart > -1 ? nextBlockStart : simulatorBlockStart + 2000,
		);
		expect(simulatorBlock).toMatch(/pipeClosingCeremony/);
		const religamentos = simulatorBlock.match(/pipeClosingCeremony/g)?.length ?? 0;
		expect(
			religamentos,
			"os DOIS ramos (yes/aceite do simulador, no/recusa) precisam religar pipeClosingCeremony",
		).toBeGreaterThanOrEqual(2);

		const helperStart = route.indexOf("async function pipeClosingCeremony");
		expect(helperStart, "pipeClosingCeremony não encontrada").toBeGreaterThan(-1);
		const nextFnStart = route.indexOf("async function pipeAndSaveClosingItems", helperStart + 1);
		const helperBody = route.slice(
			helperStart,
			nextFnStart > -1 ? nextFnStart : helperStart + 1500,
		);
		expect(helperBody).toMatch(/buildScarcityDirective/);
		expect(helperBody).toMatch(/buildDecisionPromptDirective/);
		expect(helperBody.indexOf("buildScarcityDirective")).toBeLessThan(
			helperBody.indexOf("buildDecisionPromptDirective"),
		);
	});
});
