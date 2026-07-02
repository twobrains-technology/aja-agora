// Camada 1 (unit) — FIX-204/205: validação do form de template + builder de
// componentes no shape da Meta. Lógica pura (roda em test:unit, sem DB).
// Design: docs/design/specs/2026-07-02-whatsapp-templates-meta-design.md.
import { describe, expect, it } from "vitest";
import {
	buildTemplateComponents,
	createTemplateSchema,
	updateTemplateSchema,
} from "./whatsapp-template";

describe("FIX-204/205 — createTemplateSchema", () => {
	const valid = {
		metaName: "aja_confirmacao_v1",
		category: "UTILITY",
		body: "Olá {{1}}, sua contratação foi confirmada!",
	};

	it("aceita o mínimo obrigatório (metaName, category, corpo) e default de language", () => {
		const parsed = createTemplateSchema.safeParse(valid);
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.language).toBe("pt_BR");
			expect(parsed.data.usageKey).toBeUndefined();
		}
	});

	it("aceita usageKey opcional (D1 — não é obrigatório no cadastro)", () => {
		const parsed = createTemplateSchema.safeParse({
			...valid,
			usageKey: "confirmacao_contratacao",
		});
		expect(parsed.success).toBe(true);
		if (parsed.success) expect(parsed.data.usageKey).toBe("confirmacao_contratacao");
	});

	it("trata usageKey vazio como ausente (não vira string vazia)", () => {
		const parsed = createTemplateSchema.safeParse({ ...valid, usageKey: "  " });
		expect(parsed.success).toBe(true);
		if (parsed.success) expect(parsed.data.usageKey).toBeUndefined();
	});

	it("rejeita quando falta o corpo (BODY é obrigatório)", () => {
		const { body: _omit, ...noBody } = valid;
		expect(createTemplateSchema.safeParse(noBody).success).toBe(false);
	});

	it("rejeita metaName sem snake_case (Meta exige minúsculas/números/_)", () => {
		expect(createTemplateSchema.safeParse({ ...valid, metaName: "Aja Confirmação!" }).success).toBe(
			false,
		);
	});

	it("rejeita categoria fora do enum da Meta", () => {
		expect(createTemplateSchema.safeParse({ ...valid, category: "PROMO" }).success).toBe(false);
	});
});

describe("FIX-204 — updateTemplateSchema", () => {
	it("permite editar só o usageKey (parcial)", () => {
		const parsed = updateTemplateSchema.safeParse({ usageKey: "confirmacao_contratacao" });
		expect(parsed.success).toBe(true);
	});

	it("permite limpar o usageKey via null", () => {
		const parsed = updateTemplateSchema.safeParse({ usageKey: null });
		expect(parsed.success).toBe(true);
		if (parsed.success) expect(parsed.data.usageKey).toBeNull();
	});
});

describe("FIX-204/205 — buildTemplateComponents (form → shape Meta)", () => {
	it("gera só BODY quando não há header/footer, com bodyPreview denormalizado", () => {
		const { components, bodyPreview } = buildTemplateComponents({ body: "Olá, tudo certo!" });
		expect(components).toEqual([{ type: "BODY", text: "Olá, tudo certo!" }]);
		expect(bodyPreview).toBe("Olá, tudo certo!");
	});

	it("inclui HEADER/FOOTER na ordem canônica quando presentes", () => {
		const { components } = buildTemplateComponents({
			header: "Aja Agora",
			body: "Corpo",
			footer: "Rodapé",
		});
		expect(components.map((c) => c.type)).toEqual(["HEADER", "BODY", "FOOTER"]);
		expect(components[0]).toEqual({ type: "HEADER", format: "TEXT", text: "Aja Agora" });
		expect(components[2]).toEqual({ type: "FOOTER", text: "Rodapé" });
	});

	it("ignora header/footer vazios ou só espaços", () => {
		const { components } = buildTemplateComponents({ header: "   ", body: "Corpo", footer: "" });
		expect(components.map((c) => c.type)).toEqual(["BODY"]);
	});

	it("preenche example.body_text quando o corpo tem variáveis {{n}} (submit-ready)", () => {
		const { components } = buildTemplateComponents({
			body: "Olá {{1}}, seu grupo {{2}} está pronto.",
		});
		const body = components.find((c) => c.type === "BODY");
		expect(body?.example).toEqual({ body_text: [["exemplo1", "exemplo2"]] });
	});

	it("não adiciona example quando o corpo não tem variáveis", () => {
		const { components } = buildTemplateComponents({ body: "Sem variável aqui." });
		expect(components.find((c) => c.type === "BODY")?.example).toBeUndefined();
	});
});
