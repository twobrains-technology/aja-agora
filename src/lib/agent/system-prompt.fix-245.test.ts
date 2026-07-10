import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// FIX-245 (rodada 2, Fable r1, §D4.e + gap #10) — contradição TRIPLA de emoji
// no system-prompt.ts: ":21" dizia "NUNCA use emoji, nenhum" × ":126"/":1157"
// diziam "emoji com PARCIMÔNIA... não é proibição total" (com RATIOS
// diferentes: 1 a cada 3-4 vs 1 a cada 2-3). Fonte única: parcimônia, ~1 a
// cada 3-4 balões — a mesma regra em todo lugar do prompt.

const SYSTEM_PROMPT_PATH = path.join(process.cwd(), "src/lib/agent/system-prompt.ts");

describe("FIX-245 — regra de emoji é UMA fonte coerente no system-prompt.ts", () => {
	const src = fs.readFileSync(SYSTEM_PROMPT_PATH, "utf8");
	const emojiLines = src.split("\n").filter((l) => /emoji/i.test(l));

	it("existe pelo menos uma regra de emoji no prompt (não sumiu)", () => {
		expect(emojiLines.length).toBeGreaterThan(0);
	});

	it("NENHUMA linha proíbe emoji totalmente ('nunca use emoji, nenhum, em hipótese alguma')", () => {
		// Regra estreita legítima ("nunca ao lado do nome/assinatura") convive
		// com parcimônia — só a proibição TOTAL/incondicional é o defeito. O
		// marcador "em hipótese alguma"/"nenhum" é exclusivo da frase-bug real
		// (a regra estreita nunca usa essa formulação).
		const totalBan = emojiLines.filter(
			(l) => /nunca\s+use\s+emoji\b/i.test(l) && /hip[óo]tese\s+alguma/i.test(l),
		);
		expect(totalBan, `proibição total sobrevivendo: ${JSON.stringify(totalBan)}`).toEqual([]);
	});

	it("toda menção de RATIO (1 a cada N) usa o MESMO N em todo o prompt", () => {
		const ratios = emojiLines
			.map((l) => l.match(/1\s+\S*\s*(?:a\s+cada|em\s+cada)\s+(\d+-\d+)/i)?.[1])
			.filter((r): r is string => Boolean(r));
		expect(ratios.length, "esperava achar pelo menos 1 ratio explícito").toBeGreaterThan(0);
		const distinct = new Set(ratios);
		expect(distinct.size, `ratios divergentes: ${JSON.stringify([...distinct])}`).toBe(1);
	});
});
