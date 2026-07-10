/**
 * Camada 1 — FIX-233 (handoff agente-vendas-consorcio, 2026-07-09): o gate
 * `desire` (não bloqueante) coleta `motivation` (o motivo de agora) por texto
 * livre. O pedido do handoff: espelhar isso no discurso UMA vez, não a cada
 * turno. Seção DINÂMICA `motivationMirrorSection(motivation)` — mesmo padrão
 * de `contractClosedSection`/`whatsappOptinSection`.
 */

import { describe, expect, it } from "vitest";
import { motivationMirrorSection } from "./system-prompt";

describe("FIX-233 — motivationMirrorSection (espelhar o motivo do gate desire)", () => {
	it("com motivation presente, injeta o motivo e instrui a espelhar UMA vez", () => {
		const s = motivationMirrorSection("carro vive na oficina");
		expect(s).toMatch(/carro vive na oficina/);
		expect(s.toUpperCase()).toMatch(/UMA ÚNICA VEZ|UMA VEZ/);
	});

	it("instrui a NÃO repetir se já mencionado antes (checar histórico)", () => {
		const s = motivationMirrorSection("família cresceu");
		expect(s.toUpperCase()).toMatch(/N[ÃA]O REPITA/);
	});

	it("sem motivation (null/undefined/vazio) → seção vazia (não polui o prompt)", () => {
		expect(motivationMirrorSection(null)).toBe("");
		expect(motivationMirrorSection(undefined)).toBe("");
		expect(motivationMirrorSection("")).toBe("");
		expect(motivationMirrorSection("   ")).toBe("");
	});
});
