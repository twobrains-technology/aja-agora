/**
 * Camada 1 — FIX-233 (handoff agente-vendas-consorcio, 2026-07-09): o gate
 * `desire` (não bloqueante) coleta `motivation` (o motivo de agora) por texto
 * livre. O pedido do handoff: espelhar isso no discurso UMA vez, não a cada
 * turno. Seção DINÂMICA `motivationMirrorSection(motivation)` — mesmo padrão
 * de `contractClosedSection`/`whatsappOptinSection`.
 */

import { describe, expect, it } from "vitest";
import { desireFollowUpSection, motivationMirrorSection } from "./system-prompt";

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

// FIX-238 (Fable r1, D3.3, gap P1 #5): a 2ª pergunta do gate `desire` ("o que
// fez você decidir agora?" → motivation) NUNCA era feita — não existe gate
// próprio pra ela (desiredItem/motivation são capturados por texto livre,
// FIX-233), então precisa de uma instrução de sistema pra o modelo perguntar
// como CONTINUAÇÃO natural, uma vez só, depois que desiredItem for conhecido.
describe("FIX-238 — desireFollowUpSection (2ª pergunta do gate desire: motivation)", () => {
	it("desiredItem conhecido + motivation ainda ausente → instrui a perguntar o motivo", () => {
		const s = desireFollowUpSection("um Corolla", null);
		expect(s).toMatch(/um Corolla/);
		expect(s.toLowerCase()).toMatch(/motivo|decidir/);
	});

	it("instrui a checar o histórico e NÃO repetir se já perguntou antes", () => {
		const s = desireFollowUpSection("um Corolla", null);
		expect(s.toUpperCase()).toMatch(/N[ÃA]O REPITA|J[ÁA] PERGUNTOU/);
	});

	it("motivation já capturada → seção vazia (pergunta resolvida, não repete)", () => {
		expect(desireFollowUpSection("um Corolla", "carro vive na oficina")).toBe("");
	});

	it("sem desiredItem ainda → seção vazia (nada pra encadear)", () => {
		expect(desireFollowUpSection(null, null)).toBe("");
		expect(desireFollowUpSection(undefined, null)).toBe("");
		expect(desireFollowUpSection("", null)).toBe("");
	});
});
