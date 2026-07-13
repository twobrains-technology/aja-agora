// FIX-272 (rodada 8, veredito Fable r7, D4 residual — "outra emenda"): a
// costura entre a resposta do turno principal do modelo (que às vezes termina
// em pergunta, ex. "...outro prazo?") e o lead-in do directive seguinte
// (scarcity/so_parcela, disparados no bloco `nextGateToFire === "decision"`)
// colava SEM espaço no MESMO balão — achado ao vivo: "outro prazo?Ah, Madalena,
// e um detalhe...". Mesma classe do FIX-268 (que já fechou a costura entre o
// scarcity e o decision_prompt, MAIS ADIANTE no mesmo bloco), só que faltava
// fechar o balão do turno ANTERIOR antes de sequer começar este bloco.
//
// Camada 1 (estrutural): index.ts embute um async generator profundo
// (DB real, múltiplos yield* runTurn aninhados) — a prova comportamental fica
// pro integration test (index.fix-246-server-cards.integration.test.ts, que já
// cobre a emissão de artifacts deste mesmo bloco); aqui travamos a invariante
// de que o boundary existe e vem ANTES de qualquer directive do bloco.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("FIX-272 — boundary fecha o balão do turno anterior ANTES do bloco de decisão", () => {
	const src = readFileSync(
		join(process.cwd(), "src/lib/agent/orchestrator/index.ts"),
		"utf8",
	);
	const blockStart = src.indexOf('if (result.nextGateToFire === "decision") {');
	const isSoParcelaIdx = src.indexOf("const isSoParcela", blockStart);
	const scarcityCallIdx = src.indexOf("buildScarcityDirective()", blockStart);
	const firstBoundaryIdx = src.indexOf('type: "text-boundary"', blockStart);

	it("o bloco de decisão existe e está isolado", () => {
		expect(blockStart).toBeGreaterThan(-1);
		expect(isSoParcelaIdx).toBeGreaterThan(blockStart);
		expect(scarcityCallIdx).toBeGreaterThan(blockStart);
	});

	it("emite text-boundary ANTES de decidir entre scarcity e so_parcela — cobre os DOIS caminhos", () => {
		expect(firstBoundaryIdx).toBeGreaterThan(-1);
		expect(firstBoundaryIdx).toBeLessThan(isSoParcelaIdx);
	});

	it("o boundary também vem ANTES do directive de scarcity (fecha o balão do turno principal)", () => {
		expect(firstBoundaryIdx).toBeLessThan(scarcityCallIdx);
	});
});
