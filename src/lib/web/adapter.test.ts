import { describe, expect, it } from "vitest";
import { welcomeButtonsToWhatsApp } from "@/lib/whatsapp/formatter";
import { WELCOME_OPTIONS } from "./adapter";

describe("WELCOME_OPTIONS (bug #02: moto ausente nos cards da landing)", () => {
	it("inclui 'moto' como uma das categorias do welcome", () => {
		const values = WELCOME_OPTIONS.map((o) => o.value);
		expect(values).toContain("moto");
	});

	// FIX-121 (D21): moto SUBSTITUIU "serviços"/"Outros" nos chips de entrada
	// (decisão Bv2-01 / Bruna v1 #20). WhatsApp e landing já mostram só 3; o chat
	// web precisa ficar em paridade. A categoria `servicos` NÃO some do domínio —
	// só deixa de ser opção CLICÁVEL de entrada (segue acessível por texto livre).
	it("tem exatamente 3 categorias: imovel, auto, moto", () => {
		const values = WELCOME_OPTIONS.map((o) => o.value).sort();
		expect(values).toEqual(["auto", "imovel", "moto"]);
	});

	it("não expõe 'servicos'/'Outros' como opção clicável de entrada", () => {
		const values = WELCOME_OPTIONS.map((o) => o.value);
		expect(values).not.toContain("servicos");
	});

	it("'moto' tem label exibido como 'Moto'", () => {
		const moto = WELCOME_OPTIONS.find((o) => o.value === "moto");
		expect(moto?.label).toBe("Moto");
	});

	// FIX-121: paridade explícita web↔WhatsApp — os value's do welcome web batem
	// com as categorias oferecidas pelo WhatsApp (welcomeButtonsToWhatsApp → ids
	// category_imovel/category_auto/category_moto). Uma futura divergência entre
	// os canais quebra este teste.
	it("está em paridade com as categorias do WhatsApp (welcomeButtonsToWhatsApp)", () => {
		const webValues = WELCOME_OPTIONS.map((o) => o.value).sort();
		const wa = welcomeButtonsToWhatsApp();
		const waCategories = (wa.interactive?.action?.buttons ?? [])
			.map((b) => b.reply.id.replace(/^category_/, ""))
			.sort();
		expect(webValues).toEqual(waCategories);
	});
});
