import { describe, expect, it } from "vitest";
import { resolveRange, valuePickerToWhatsApp, welcomeButtonsToWhatsApp } from "./formatter";

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

	// Bv2-01 / Bruna v1 #20 — moto SUBSTITUI servicos nos chips de boas-vindas
	// (web E WhatsApp). 3 chips: Imovel/Carro/Moto. Servicos não aparece.
	it("welcomeButtonsToWhatsApp inclui moto e NÃO inclui servicos", () => {
		const w = welcomeButtonsToWhatsApp();
		const buttons = w.interactive?.action?.buttons ?? [];
		const ids = buttons.map((b: { reply: { id: string } }) => b.reply.id);
		expect(ids, "deve conter category_moto").toContain("category_moto");
		expect(ids, "NÃO deve conter category_servicos").not.toContain("category_servicos");
	});

	it("welcomeButtonsToWhatsApp tem 3 botões (limite WhatsApp interactive button)", () => {
		const w = welcomeButtonsToWhatsApp();
		const buttons = w.interactive?.action?.buttons ?? [];
		expect(buttons.length).toBe(3);
	});

	it("welcomeButtonsToWhatsApp título do botão moto inclui 'Moto'", () => {
		const w = welcomeButtonsToWhatsApp();
		const buttons = w.interactive?.action?.buttons ?? [];
		const moto = buttons.find(
			(b: { reply: { id: string } }) => b.reply.id === "category_moto",
		) as { reply: { title: string } } | undefined;
		expect(moto?.reply.title).toMatch(/Moto/i);
	});
});
