// Bv2-02 — landing copy: tirar foco em "IA" e priorizar benefícios do consórcio.
// Regulatório: CDC art. 37 §1º (overclaim de "IA" = publicidade enganosa se
// expectativa criada não bate com entregue).
//
// Critério literal do plano consolidado v2 (PO Lead): vetar 6 frases
// específicas em qualquer texto visível da landing. Não é vetar "IA" como
// palavra — apenas frases que projetam autonomia/totalidade que não temos.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const LANDING_DIR = join(__dirname);
const HERO25_FILE = join(
	__dirname,
	"..",
	"shadcn-studio",
	"blocks",
	"hero-section-25",
	"hero-section-25.tsx",
);

const FILES = [
	join(LANDING_DIR, "how-it-works.tsx"),
	join(LANDING_DIR, "benefits-section.tsx"),
	join(LANDING_DIR, "faq-section.tsx"),
	join(LANDING_DIR, "cta-section.tsx"),
	join(LANDING_DIR, "social-proof.tsx"),
	join(LANDING_DIR, "footer.tsx"),
	HERO25_FILE,
];

const FORBIDDEN_PATTERNS = [
	/100\s*%\s*ia/i,
	/agente inteligente/i,
	/powered by ai/i,
	/intelig[êe]ncia artificial/i,
	/automa[çc][ãa]o inteligente/i,
	/ai[-\s]first/i,
] as const;

const BENEFIT_KEYWORDS = [
	/sem juros/i,
	/parcela (menor|mais baixa)/i,
	/\blance\b/i,
	/contempla(ção|cao)/i,
	/assembleia/i,
	/\bgrupo\b/i,
] as const;

describe("Landing copy (Bv2-02) — sem overclaim de IA, foco em benefícios", () => {
	for (const file of FILES) {
		describe(file.split("/").slice(-3).join("/"), () => {
			const content = readFileSync(file, "utf8");

			for (const pattern of FORBIDDEN_PATTERNS) {
				it(`não contém frase vetada ${pattern}`, () => {
					const match = content.match(pattern);
					expect(match, `encontrado: "${match?.[0] ?? ""}"`).toBeNull();
				});
			}
		});
	}

	it("HowItWorks contém ≥4 keywords de benefício do consórcio (Bv2-02 Happy)", () => {
		const content = readFileSync(join(LANDING_DIR, "how-it-works.tsx"), "utf8");
		const hits = BENEFIT_KEYWORDS.filter((kw) => kw.test(content));
		expect(hits.length, `keywords encontradas: ${hits.map((k) => k.toString())}`).toBeGreaterThanOrEqual(
			4,
		);
	});

	it("HowItWorks mantém stepper de 5 passos (anti-regressão #19 v1)", () => {
		const content = readFileSync(join(LANDING_DIR, "how-it-works.tsx"), "utf8");
		// Cada passo do stepper tem `title:` no array — espera ≥5
		const titleCount = (content.match(/title:\s*"/g) ?? []).length;
		expect(titleCount).toBeGreaterThanOrEqual(5);
	});
});
