// Camada 1 (unit) — FIX-204/205: validação do form de template + builder de
// componentes no shape da Meta. Lógica pura (roda em test:unit, sem DB).
// Bloco 3 (remarketing com arte) acrescenta: header de imagem, botão de resposta
// rápida e carrossel de 3 cards — e as regras de categoria/copy que a Meta exige.
// Design: docs/design/specs/2026-07-02-whatsapp-templates-meta-design.md.
import { describe, expect, it } from "vitest";
import type { ComponenteDeTemplate } from "./whatsapp-template";
import {
	buildTemplateComponents,
	createTemplateSchema,
	OBJETIVOS_DE_REMARKETING,
	QUICK_REPLY_PADRAO,
	recusaDaArte,
	recusaDeSubmissao,
	updateTemplateSchema,
} from "./whatsapp-template";

/** Estreita o union para os componentes que têm `example` (testes de payload). */
function acharBody(components: ComponenteDeTemplate[]) {
	const body = components.find((c) => c.type === "BODY");
	if (!body || body.type !== "BODY") throw new Error("BODY ausente");
	return body;
}

const HANDLE = "4::anBlZw==:ARa525ZJ1g0J:100089620928913";

const CARDS_DA_CAMPANHA = [
	{
		headerHandle: `${HANDLE}-1`,
		body: "Mais de 30 mil famílias atendidas.",
		buttonText: QUICK_REPLY_PADRAO,
	},
	{
		headerHandle: `${HANDLE}-2`,
		body: "Administradora regulada pelo Banco Central.",
		buttonText: QUICK_REPLY_PADRAO,
	},
	{
		headerHandle: `${HANDLE}-3`,
		body: "Menor custo da faixa, sem juros.",
		buttonText: QUICK_REPLY_PADRAO,
	},
];

describe("FIX-204/205 — createTemplateSchema", () => {
	const valid = {
		metaName: "aja_confirmacao_v1",
		category: "UTILITY",
		body: "Olá {{1}}, sua reserva de cota foi confirmada!",
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
		expect(acharBody(components).example).toEqual({
			body_text: [["exemplo1", "exemplo2"]],
		});
	});

	it("não adiciona example quando o corpo não tem variáveis", () => {
		const { components } = buildTemplateComponents({ body: "Sem variável aqui." });
		expect(acharBody(components).example).toBeUndefined();
	});
});

describe("Bloco 3 — header de IMAGEM (arte)", () => {
	const base = {
		metaName: "aja_remarketing_abertura_v1",
		category: "MARKETING",
		body: "A parcela que cabe no seu bolso, sem juros.",
	};

	it("monta HEADER de imagem com example.header_handle (o formato que a Meta exige)", () => {
		const { components } = buildTemplateComponents({
			headerFormat: "IMAGE",
			headerHandle: HANDLE,
			body: base.body,
			quickReplyText: QUICK_REPLY_PADRAO,
		});

		expect(components[0]).toEqual({
			type: "HEADER",
			format: "IMAGE",
			example: { header_handle: [HANDLE] },
		});
		expect(components[1]).toEqual({ type: "BODY", text: base.body });
		expect(components[2]).toEqual({
			type: "BUTTONS",
			buttons: [{ type: "QUICK_REPLY", text: QUICK_REPLY_PADRAO }],
		});
	});

	it("recusa header de imagem SEM handle (a Meta não aceita URL aqui)", () => {
		const parsed = createTemplateSchema.safeParse({
			...base,
			headerFormat: "IMAGE",
			headerHandle: "",
		});
		expect(parsed.success).toBe(false);
		if (!parsed.success) {
			expect(parsed.error.issues.some((i) => i.path.includes("headerHandle"))).toBe(true);
		}
	});

	it("aceita header de imagem sem botão em UTILITY (imagem não força Marketing sozinha)", () => {
		const parsed = createTemplateSchema.safeParse({
			metaName: "aja_comprovante_v1",
			category: "UTILITY",
			headerFormat: "IMAGE",
			headerHandle: HANDLE,
			body: "Segue o comprovante da sua proposta.",
		});
		expect(parsed.success).toBe(true);
	});

	it("recusa arte de campanha (imagem + botão) fora de MARKETING", () => {
		const parsed = createTemplateSchema.safeParse({
			...base,
			category: "UTILITY",
			headerFormat: "IMAGE",
			headerHandle: HANDLE,
			quickReplyText: QUICK_REPLY_PADRAO,
		});
		expect(parsed.success).toBe(false);
		if (!parsed.success) {
			expect(parsed.error.issues.some((i) => i.path.includes("category"))).toBe(true);
		}
	});

	it("recusa copy que promete contemplação garantida ou data", () => {
		const garantida = createTemplateSchema.safeParse({
			...base,
			body: "Contemplação garantida no primeiro mês!",
		});
		expect(garantida.success).toBe(false);

		const data = createTemplateSchema.safeParse({
			...base,
			body: "Sua contemplação em 15/12 já está reservada.",
		});
		expect(data.success).toBe(false);

		const limpa = createTemplateSchema.safeParse({
			...base,
			body: "Lance para antecipar a contemplação — o grupo curto costuma girar mais rápido.",
		});
		expect(limpa.success).toBe(true);
	});
});

describe("Bloco 3 — carrossel de 3 cards", () => {
	const base = {
		metaName: "aja_autoridade_carrossel_v1",
		category: "MARKETING",
		headerFormat: "IMAGE" as const,
		headerHandle: HANDLE,
		body: "Três motivos para escolher a Aja Agora.",
		carousel: CARDS_DA_CAMPANHA,
	};

	it("monta CAROUSEL com 3 cards, cada um com HEADER IMAGE + BODY + BUTTONS (contrato da Meta)", () => {
		const { components } = buildTemplateComponents({
			headerFormat: "IMAGE",
			headerHandle: HANDLE,
			body: base.body,
			carousel: CARDS_DA_CAMPANHA,
		});

		expect(components.map((c) => c.type)).toEqual(["BODY", "CAROUSEL"]);

		const carousel = components.find((c) => c.type === "CAROUSEL");
		if (carousel?.type !== "CAROUSEL") throw new Error("CAROUSEL ausente");

		const cards = carousel.cards ?? [];
		expect(cards).toHaveLength(3);
		expect(cards[0]?.components[0]).toEqual({
			type: "HEADER",
			format: "IMAGE",
			example: { header_handle: [`${HANDLE}-1`] },
		});
		expect(cards[0]?.components[1]).toEqual({
			type: "BODY",
			text: "Mais de 30 mil famílias atendidas.",
		});
		expect(cards[0]?.components[2]).toEqual({
			type: "BUTTONS",
			buttons: [{ type: "QUICK_REPLY", text: QUICK_REPLY_PADRAO }],
		});
	});

	it("recusa carrossel com 2 ou 4 cards (a campanha é de 3; 2 ou 4 significa card perdido)", () => {
		const dois = createTemplateSchema.safeParse({
			...base,
			carousel: CARDS_DA_CAMPANHA.slice(0, 2),
		});
		expect(dois.success).toBe(false);
		if (!dois.success) {
			expect(dois.error.issues.some((i) => i.path.includes("carousel"))).toBe(true);
		}

		const quatro = createTemplateSchema.safeParse({
			...base,
			carousel: [...CARDS_DA_CAMPANHA, { headerHandle: `${HANDLE}-4`, body: "Quarto." }],
		});
		expect(quatro.success).toBe(false);
	});

	it("aceita os 3 cards completos", () => {
		expect(createTemplateSchema.safeParse(base).success).toBe(true);
	});

	it("não emite header de topo no carrossel (a Meta só aceita corpo + cards)", () => {
		const { components } = buildTemplateComponents({
			headerFormat: "IMAGE",
			headerHandle: HANDLE,
			body: base.body,
			carousel: CARDS_DA_CAMPANHA,
		});
		expect(components.some((c) => c.type === "HEADER")).toBe(false);
	});

	it("recusa card sem arte ou sem corpo", () => {
		const semArte = createTemplateSchema.safeParse({
			...base,
			carousel: [{ headerHandle: "", body: "x" }, ...CARDS_DA_CAMPANHA.slice(1)],
		});
		expect(semArte.success).toBe(false);

		const semCorpo = createTemplateSchema.safeParse({
			...base,
			carousel: [{ headerHandle: `${HANDLE}-1`, body: "  " }, ...CARDS_DA_CAMPANHA.slice(1)],
		});
		expect(semCorpo.success).toBe(false);
	});

	it("recusa carrossel fora de MARKETING (a Meta só aceita carrossel em marketing)", () => {
		const parsed = createTemplateSchema.safeParse({ ...base, category: "UTILITY" });
		expect(parsed.success).toBe(false);
		if (!parsed.success) {
			expect(parsed.error.issues.some((i) => i.path.includes("category"))).toBe(true);
		}
	});

	it("recusa carrossel cuja copy promete contemplação garantida", () => {
		const parsed = createTemplateSchema.safeParse({
			...base,
			carousel: [
				{ headerHandle: `${HANDLE}-1`, body: "Contemplação garantida." },
				...CARDS_DA_CAMPANHA.slice(1),
			],
		});
		expect(parsed.success).toBe(false);
	});
});

describe("Bloco 3 — chaves canônicas do motor (contrato, não sugestão de UI)", () => {
	it("lista exatamente os quatro usageKeys que o motor consome", () => {
		expect(OBJETIVOS_DE_REMARKETING.map((o) => o.usageKey)).toEqual([
			"remarketing_oportunidade_carro",
			"remarketing_oportunidade_moto",
			"remarketing_oportunidade_imovel",
			"remarketing_autoridade_v1",
		]);
	});

	it("a autoridade é carrossel e as oportunidades são arte de imagem — todas MARKETING", () => {
		const autoridade = OBJETIVOS_DE_REMARKETING.find(
			(o) => o.usageKey === "remarketing_autoridade_v1",
		);
		expect(autoridade?.modo).toBe("CARROSSEL");
		for (const objetivo of OBJETIVOS_DE_REMARKETING) {
			if (objetivo.modo === "IMAGE") expect(objetivo.arte).toMatch(/\.png$/);
		}
	});
});

describe("Bloco 3 — recusaDaArte (upload antes de gastar viagem à Meta)", () => {
	it("aceita JPEG/PNG dentro do limite", () => {
		expect(recusaDaArte({ type: "image/png", size: 1024 })).toBeNull();
		expect(recusaDaArte({ type: "image/jpeg", size: 1024 })).toBeNull();
	});

	it("recusa formato não suportado, arquivo vazio e acima de 5 MB", () => {
		expect(recusaDaArte({ type: "image/webp", size: 1024 })).toContain("JPEG ou PNG");
		expect(recusaDaArte({ type: "image/png", size: 0 })).toContain("vazio");
		expect(recusaDaArte({ type: "image/png", size: 6 * 1024 * 1024 })).toContain("5 MB");
	});
});

describe("Bloco 3 — recusaDeSubmissao (barreira ancorada no que está persistido)", () => {
	it("recusa carrossel persistido com categoria não-Marketing", () => {
		const { components } = buildTemplateComponents({
			headerFormat: "IMAGE",
			headerHandle: HANDLE,
			body: "Corpo",
			carousel: CARDS_DA_CAMPANHA,
		});
		expect(recusaDeSubmissao({ category: "UTILITY", components })).toContain("Marketing");
	});

	it("deixa passar o carrossel de campanha em Marketing", () => {
		const { components } = buildTemplateComponents({
			headerFormat: "IMAGE",
			headerHandle: HANDLE,
			body: "Corpo",
			carousel: CARDS_DA_CAMPANHA,
		});
		expect(recusaDeSubmissao({ category: "MARKETING", components })).toBeNull();
	});

	it("avisa quando o header de imagem ficou sem handle", () => {
		expect(
			recusaDeSubmissao({
				category: "MARKETING",
				components: [{ type: "HEADER", format: "IMAGE" }],
			}),
		).toContain("handle");
	});
});
