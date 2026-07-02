/**
 * FIX-130 (D21) — trava a FONTE ÚNICA das categorias de entrada do chat web.
 * Regra da jornada (Passo 1 + regra-mãe de paridade): exatamente 3 categorias
 * clicáveis — Imóvel, Automóvel, Moto — em paridade com o WhatsApp. `servicos`
 * segue vivo no domínio (texto livre), mas NUNCA como chip de entrada.
 */

import { describe, expect, it } from "vitest";
import { welcomeButtonsToWhatsApp } from "@/lib/whatsapp/formatter";
import { WELCOME_OPTIONS } from "./welcome-options";

describe("WELCOME_OPTIONS (fonte única — FIX-130)", () => {
	it("tem exatamente 3 categorias: imovel, auto, moto", () => {
		const values = WELCOME_OPTIONS.map((o) => o.value).sort();
		expect(values).toEqual(["auto", "imovel", "moto"]);
	});

	it("NÃO expõe 'servicos'/'Outros' como chip de entrada", () => {
		expect(WELCOME_OPTIONS.map((o) => o.value)).not.toContain("servicos");
		expect(WELCOME_OPTIONS.map((o) => o.label)).not.toContain("Outros");
	});

	it("está em paridade com os botões de welcome do WhatsApp", () => {
		const webValues = WELCOME_OPTIONS.map((o) => o.value).sort();
		const wa = welcomeButtonsToWhatsApp();
		const waCategories = (wa.interactive?.action?.buttons ?? [])
			.map((b) => b.reply.id.replace(/^category_/, ""))
			.sort();
		expect(waCategories).toEqual(webValues);
	});
});
