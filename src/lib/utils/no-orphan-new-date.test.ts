// src/lib/utils/no-orphan-new-date.test.ts
//
// Anti-regressão (P0-21 do test plan): nenhum `new Date()` (sem args) pode
// aparecer em arquivos do caminho do turno simulado sem estar marcado como
// "tempo real intencional" via comentário allow-list.
//
// Falhar este teste = o clock simulado vaza pra ter um campo gravado com
// `new Date()` puro, drift na simulação.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..", "..");

const WATCHED_FILES = [
	"src/lib/memory/letta-adapter.ts",
	"src/lib/memory/extractor.ts",
	"src/lib/memory/inspect.ts",
	"src/lib/agent/orchestrator/index.ts",
	"src/lib/agent/orchestrator/lead-collection.ts",
	"src/lib/agent/tools/ai-sdk.ts",
	"src/lib/agent/system-prompt.ts",
	"src/lib/whatsapp/proxy.ts",
	"src/lib/whatsapp/simulator-bus.ts",
	"src/lib/conversation/messages.ts",
	"src/lib/conversation/meta.ts",
	"src/app/api/chat/route.ts",
];

// Padrão de uso legítimo de `new Date(<algo>)` — parsing de ISO string:
//   new Date(isoA)
//   new Date(iso)
//   new Date(`...`)
// `new Date()` SEM args é o que queremos pegar.
const ORPHAN_RE = /new\s+Date\s*\(\s*\)/g;

// Linhas marcadas explicitamente como "tempo real intencional" via comentário
// `// real-time-intentional` na mesma linha são puladas. Mantém escape válvula
// pra logs, health checks, etc.
const ALLOW_MARKER = /real-time-intentional/;

describe("anti-regressão: new Date() órfão em paths do turno simulado", () => {
	for (const rel of WATCHED_FILES) {
		it(`${rel} não contém \`new Date()\` órfão`, () => {
			const src = readFileSync(join(ROOT, rel), "utf-8");
			const lines = src.split("\n");
			const orphans: Array<{ line: number; text: string }> = [];
			for (let i = 0; i < lines.length; i++) {
				const text = lines[i];
				if (ALLOW_MARKER.test(text)) continue;
				// Ignora linhas que começam com // ou estão em bloco /** */
				// (heurística simples — não trata comments multilinha exóticos).
				const stripped = text.replace(/\/\/.*$/, "");
				if (/^\s*\*/.test(stripped)) continue; // linha de block comment
				ORPHAN_RE.lastIndex = 0;
				if (ORPHAN_RE.test(stripped)) {
					orphans.push({ line: i + 1, text: text.trim() });
				}
			}
			if (orphans.length > 0) {
				const msg = orphans.map((o) => `  ${rel}:${o.line}  ${o.text}`).join("\n");
				throw new Error(
					`Encontrei \`new Date()\` órfão (sem args) em arquivos do path do turno.\nUse \`simulatorNow()\` (de @/lib/utils/simulator-clock) ou marque a linha com \`// real-time-intentional\` se for caso legítimo (log, audit, health-check).\n\n${msg}`,
				);
			}
			expect(orphans).toEqual([]);
		});
	}
});
