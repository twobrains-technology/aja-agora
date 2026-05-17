import { describe, expect, it } from "vitest";
import { resolveRange, valuePickerToWhatsApp } from "./formatter";

describe("WhatsApp formatter — categoria moto (bug #02)", () => {
	it("valuePickerToWhatsApp aceita category='moto' e retorna lista com faixas reais (não cai no fallback auto)", () => {
		const auto = valuePickerToWhatsApp({ category: "auto" });
		const moto = valuePickerToWhatsApp({ category: "moto" });

		expect(moto.type).toBe("interactive");
		// rows do auto e moto devem ser distintos (provar que moto tem faixas próprias)
		const autoIds = auto.interactive?.action?.sections?.[0]?.rows?.map((r) => r.id) ?? [];
		const motoIds = moto.interactive?.action?.sections?.[0]?.rows?.map((r) => r.id) ?? [];
		expect(motoIds.length).toBeGreaterThan(0);
		expect(motoIds).not.toEqual(autoIds);
	});

	it("rangeId de moto resolve via resolveRange e retorna category='moto'", () => {
		const moto = valuePickerToWhatsApp({ category: "moto" });
		const firstId = moto.interactive?.action?.sections?.[0]?.rows?.[0]?.id;
		expect(firstId).toBeTruthy();
		const resolved = resolveRange(firstId as string);
		expect(resolved?.category).toBe("moto");
	});

	it("rótulo da categoria moto é 'Moto' (não cai em 'bem' genérico)", () => {
		const moto = valuePickerToWhatsApp({ category: "moto" });
		const body = moto.interactive?.body?.text ?? "";
		expect(body).toMatch(/Moto/i);
		expect(body).not.toMatch(/\bbem\b/);
	});
});
