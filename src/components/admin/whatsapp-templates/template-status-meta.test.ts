// Camada 1 (unit) — FIX-205: mapa status → badge. Roda em test:unit.
import { describe, expect, it } from "vitest";
import { TEMPLATE_STATUS_META, templateStatusMeta } from "./template-status-meta";

describe("FIX-205 — templateStatusMeta", () => {
	it("cobre todos os 6 status do enum com rótulo PT-BR", () => {
		expect(Object.keys(TEMPLATE_STATUS_META).sort()).toEqual(
			["APPROVED", "DISABLED", "DRAFT", "PAUSED", "PENDING", "REJECTED"].sort(),
		);
		for (const meta of Object.values(TEMPLATE_STATUS_META)) {
			expect(meta.label.length).toBeGreaterThan(0);
		}
	});

	it("APPROVED usa variante default; REJECTED usa destructive", () => {
		expect(templateStatusMeta("APPROVED").variant).toBe("default");
		expect(templateStatusMeta("REJECTED").variant).toBe("destructive");
		expect(templateStatusMeta("APPROVED").label).toBe("Aprovado");
	});

	it("status desconhecido faz fallback (não quebra a UI)", () => {
		const meta = templateStatusMeta("ALIEN");
		expect(meta.label).toBe("ALIEN");
		expect(meta.variant).toBe("outline");
	});
});
