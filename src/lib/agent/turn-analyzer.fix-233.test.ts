import { describe, expect, it } from "vitest";
import { BASE_SYSTEM_INSTRUCTION, turnAnalysisSchema } from "./turn-analyzer";

// ============================================================================
// FIX-233 (handoff agente-vendas-consorcio, 2026-07-09) — Camada 1
// ----------------------------------------------------------------------------
// 3ª saída do gate `lance` ("não quero comprometer nada além da parcela") só
// existe hoje via texto livre — não há botão pra ela (o gate `lance` segue
// "yes"/"maybe"/"no" via chips). O analyzer precisa reconhecer essa intenção
// específica no enum `hasLance` (valor novo `so_parcela`) pra `qualify-state.ts`
// pular lance-value/lance-embutido/simulator-offer e ir direto pra
// `present_two_paths` (ver qualify-state.sequence.test.ts).
//
// Além disso, o gate `desire` (não bloqueante, sem card) coleta `desiredItem`
// (bem específico) e `motivation` (motivo de agora) por texto livre — sem
// extração no analyzer, os slots nunca populam (o gate não bloqueia, mas os
// dados também não chegam a lugar nenhum).
// ============================================================================

describe("FIX-233 — hasLance ganha o valor 'so_parcela' (3ª saída do gate lance)", () => {
	it("o enum hasLance inclui so_parcela", () => {
		expect(turnAnalysisSchema.shape.hasLance.unwrap().options).toContain("so_parcela");
	});

	it("preserva os 3 valores originais (yes/maybe/no)", () => {
		const opts = turnAnalysisSchema.shape.hasLance.unwrap().options;
		for (const v of ["yes", "maybe", "no"]) {
			expect(opts).toContain(v);
		}
	});

	it("a descrição do schema define so_parcela como recusa explícita de qualquer lance", () => {
		const desc = turnAnalysisSchema.shape.hasLance.description ?? "";
		expect(desc).toMatch(/so_parcela\s*=/);
		expect(desc.toLowerCase()).toMatch(/parcela/);
	});

	it("tem exemplo few-shot mapeando a recusa explícita de lance → so_parcela", () => {
		expect(BASE_SYSTEM_INSTRUCTION).toMatch(
			/n[ãa]o quero comprometer[\s\S]{0,60}so_parcela/i,
		);
	});
});

describe("FIX-233 — slots do gate `desire` (desiredItem/motivation) no analyzer", () => {
	it("o schema tem os campos desiredItem e motivation, nullable", () => {
		expect(turnAnalysisSchema.shape.desiredItem).toBeDefined();
		expect(turnAnalysisSchema.shape.motivation).toBeDefined();
	});

	it("BASE_SYSTEM_INSTRUCTION explica quando preencher desiredItem/motivation", () => {
		expect(BASE_SYSTEM_INSTRUCTION).toMatch(/desiredItem/);
		expect(BASE_SYSTEM_INSTRUCTION).toMatch(/motivation/);
	});
});
