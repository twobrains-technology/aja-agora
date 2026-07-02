import { describe, expect, it } from "vitest";
import { resolveRange, valuePickerToWhatsApp, welcomeButtonsToWhatsApp } from "./formatter";

describe("WhatsApp formatter — categoria moto (bug #02)", () => {
	// FIX-109: o valor virou CONVERSA — value_picker não renderiza mais lista de
	// faixas (vira texto). O rótulo da categoria segue presente na fala.
	it("valuePickerToWhatsApp vira conversa (texto), sem lista de faixas", () => {
		const moto = valuePickerToWhatsApp({ category: "moto" });
		expect(moto.type).toBe("text");
		expect(moto.interactive?.action?.sections).toBeUndefined();
	});

	it("resolveRange segue resolvendo um rangeId de moto (RANGES preservado)", () => {
		const resolved = resolveRange("range_moto_25");
		expect(resolved?.category).toBe("moto");
	});

	it("rótulo da categoria moto aparece na conversa (não cai em 'bem' genérico)", () => {
		const body = valuePickerToWhatsApp({ category: "moto" }).text ?? "";
		expect(body).toMatch(/moto/i);
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
		const moto = buttons.find((b: { reply: { id: string } }) => b.reply.id === "category_moto") as
			| { reply: { title: string } }
			| undefined;
		expect(moto?.reply.title).toMatch(/Moto/i);
	});
});
