// Landing copy — sem overclaim de "IA", foco em benefícios do consórcio.
// Regulatório: CDC art. 37 §1º (overclaim de "IA" = publicidade enganosa se
// expectativa criada não bate com entregue).
//
// Pós-rebranding (handoff): a landing virou Nav·Hero·Trust·Process·Demo·
// Institucional·Closing·Footer. O Process passou a ter 3 passos (marca), e as
// palavras-chave educativas (sem juros, parcela, lance, contemplação,
// assembleia, grupo) foram re-ancoradas em Process + Demo. O chip do hero NÃO
// menciona "IA" — por isso agora vetamos "IA" isolado em toda a landing.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const LANDING_DIR = join(__dirname);
const LAYOUT_FILE = join(__dirname, "..", "..", "app", "layout.tsx");

const LANDING_FILES = [
	"brand-nav.tsx",
	"hero.tsx",
	"trust.tsx",
	"process.tsx",
	"demo.tsx",
	"institutional.tsx",
	"closing.tsx",
	"brand-footer.tsx",
].map((f) => join(LANDING_DIR, f));

const FILES = [...LANDING_FILES, LAYOUT_FILE];

const FORBIDDEN_PATTERNS = [
	/100\s*%\s*ia/i,
	/agente inteligente/i,
	/powered by ai/i,
	/intelig[êe]ncia artificial/i,
	/automa[çc][ãa]o inteligente/i,
	/ai[-\s]first/i,
	/\bIA\b/, // chip do hero foi reescrito sem "IA" — trava a regra de produto
] as const;

const BENEFIT_KEYWORDS = [
	/sem juros/i,
	/\bparcela\b/i,
	/\blance\b/i,
	/contempla(ção|cao)/i,
	/assembleia/i,
	/\bgrupo\b/i,
] as const;

describe("Landing copy — sem overclaim de IA, foco em benefícios", () => {
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

	it("a landing re-ancora TODAS as keywords educativas do consórcio", () => {
		const all = LANDING_FILES.map((f) => readFileSync(f, "utf8")).join("\n");
		const missing = BENEFIT_KEYWORDS.filter((kw) => !kw.test(all));
		expect(missing, `keywords ausentes: ${missing.map((k) => k.toString())}`).toHaveLength(0);
	});
});
