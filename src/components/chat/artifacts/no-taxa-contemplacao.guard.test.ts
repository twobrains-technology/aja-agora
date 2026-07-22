// FIX-231 (spec 05-compliance-e-dados.md): `taxaContemplacao` é campo do
// domínio Bevi com semântica não documentada — PROIBIDO vazar pra UI (payload
// de artifact, tool schema ou string de card). A camada de mapeamento Bevi→
// domínio já tem guard (offer-mapper.test.ts, partner-offer-mapper.test.ts);
// este é o guard da camada de UI/tools, que ainda não existia.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");

const FIXED_FILES = [
	"src/lib/chat/types.ts",
	"src/lib/agent/tools/schemas.ts",
	"src/lib/agent/tools/ai-sdk.ts",
];

const ARTIFACTS_DIR = join(ROOT, "src", "components", "chat", "artifacts");

function artifactComponentFiles(): string[] {
	return readdirSync(ARTIFACTS_DIR)
		.filter((f) => f.endsWith(".tsx") && !f.includes(".test."))
		.map((f) => join("src", "components", "chat", "artifacts", f));
}

const FORBIDDEN = /taxaContemplacao/;

/** Remove comentários de bloco e de linha antes de checar — o objetivo é
 * travar o campo em PAYLOAD/CÓDIGO, não proibir comentários que documentam a
 * regra de não usá-lo (ex.: `// nunca taxaContemplacao`). */
function stripComments(src: string): string {
	return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("guard: taxaContemplacao NUNCA aparece na camada de UI/tools (fora de comentário)", () => {
	const watched = [...FIXED_FILES, ...artifactComponentFiles()];

	for (const rel of watched) {
		it(`${rel} não contém "taxaContemplacao" em código`, () => {
			const src = stripComments(readFileSync(join(ROOT, rel), "utf-8"));
			expect(src).not.toMatch(FORBIDDEN);
		});
	}
});
