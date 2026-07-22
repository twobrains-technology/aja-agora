// Camada 1 (FIX-212) — ZERO emoji na copy do WhatsApp.
//
// Kairo: "sem emoticons por favor" (regra pra TODA a copy). C3 do spec: nenhum
// codepoint de emoji na copy fixa do WhatsApp. Esta varredura percorre os módulos
// de copy (formatter/gate-questions/identify-capture) e FALHA se achar qualquer
// emoji — a rede que impede o emoji de voltar por um card novo.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SPECIALIST_BASE_PROMPT, SYSTEM_PROMPT } from "@/lib/agent/system-prompt";

// Ranges de emoji reais. NÃO inclui setas (→ U+2192) nem pontuação (• — …) que
// são símbolos tipográficos legítimos no source, não emoticons.
const EMOJI =
	// biome-ignore lint/suspicious/noMisleadingCharacterClass: faixa FE00-FE0F (variation selectors) é intencional — o teste caça emoji no source, inclusive os seletores. Flag u garante code points, não surrogate pairs.
	/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;
const EMOJI_G = new RegExp(EMOJI.source, "gu");

function read(rel: string): string {
	return readFileSync(resolve(process.cwd(), rel), "utf-8");
}

function emojiHits(src: string): string[] {
	const hits: string[] = [];
	src.split("\n").forEach((line, i) => {
		const m = line.match(EMOJI_G);
		if (m) hits.push(`L${i + 1}: ${m.join(" ")}  → ${line.trim().slice(0, 80)}`);
	});
	return hits;
}

describe("FIX-212 — varredura anti-emoji na copy do WhatsApp", () => {
	for (const rel of [
		"src/lib/whatsapp/formatter.ts",
		"src/lib/agent/orchestrator/gate-questions.ts",
		"src/lib/whatsapp/identify-capture.ts",
	]) {
		it(`${rel} não contém NENHUM emoji`, () => {
			const hits = emojiHits(read(rel));
			expect(hits, `emojis encontrados em ${rel}:\n${hits.join("\n")}`).toEqual([]);
		});
	}

	// FIX-234 (2026-07-09) relaxou a regra DURA original do FIX-212 pra
	// PARCIMÔNIA (1 emoji a cada 3-4 balões) — decisão de produto posterior,
	// não revogada. FIX-245 (rodada 2, Fable r1) removeu a contradição: o
	// prompt tinha as DUAS regras ao mesmo tempo (proibição total + parcimônia,
	// com ratios divergentes). Esta asserção passa a exigir a regra VIGENTE
	// (parcimônia), não mais a proibição total superada.
	it("o system-prompt tem a regra de parcimônia de emoji (fonte única, sem proibição total residual)", () => {
		const prompt = `${SYSTEM_PROMPT}\n${SPECIALIST_BASE_PROMPT}`.toLowerCase();
		expect(prompt).toMatch(/emoji com parcim[oô]nia/);
		expect(prompt).toMatch(/1 a cada 3-4/);
		// nenhuma proibição total incondicional sobrevivendo ao lado da parcimônia
		expect(prompt).not.toMatch(/nunca use emoji\.?\s*nenhum,?\s*em hip[oó]tese alguma/);
		// e não sobrou o "use emojis com moderação" antigo
		expect(prompt).not.toMatch(/emojis com moderação/);
	});

	// Bug QA 2026-07-03: o "Olá 👋" vazou pra saudação porque estava no
	// CONCIERGE_PROMPT_BODY (fora das constantes varridas). Varrer o system-prompt
	// inteiro daria falso-positivo nos marcadores ❌/✅ de instrução (não são copy).
	// A distinção: emoji DENTRO DE ASPAS = exemplo de fala que o LLM COPIA pro cliente
	// (proibido); emoji solto = marcador de instrução (ok). Esta rede pega o "Olá 👋".
	it("system-prompt não tem emoji em copy de exemplo (dentro de aspas)", () => {
		const src = read("src/lib/agent/system-prompt.ts");
		const quotedEmoji = new RegExp(`"[^"\\n]*${EMOJI.source}[^"\\n]*"`, "u");
		const hits = src
			.split("\n")
			.map((line, i) => ({ line, n: i + 1 }))
			.filter(({ line }) => quotedEmoji.test(line))
			.map(({ line, n }) => `L${n}: ${line.trim().slice(0, 80)}`);
		expect(hits, `emoji em copy de exemplo (o LLM ecoa pro cliente):\n${hits.join("\n")}`).toEqual(
			[],
		);
	});
});
