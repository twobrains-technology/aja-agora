import { describe, expect, it } from "vitest";
import { gateQuestion } from "./gate-questions";

// FIX-312 (rodada 10, onda 4) — juiz Sonnet (veredito rodada A.2, dossiê
// Madalena, turnos 4/5/6) achou "esse **um** Corolla": o `desiredItem`
// capturado pelo analyzer vem com o artigo indefinido embutido ("um Corolla"),
// e a copy do gate `credit` prefixava "esse " sem remover esse artigo — erro
// de concordância. Corrige (a) a concordância, usando o PRÓPRIO artigo
// capturado como sinal de género (mais confiável que supor pela categoria: um
// item de `imovel`/`servicos` pode ser masculino OU feminino, "um apartamento"
// vs. "uma casa") e (b) a repetição verbatim quando o gate é re-perguntado
// (2ª+ tentativa) — reconhece a tentativa anterior em vez de repetir o texto.
describe("FIX-312 — copy do gate credit: concordância de género + variação em re-ask", () => {
	it("cassette Madalena: 'um Corolla' (auto) → 'esse Corolla', nunca 'esse um Corolla'", () => {
		const q = gateQuestion("credit", "auto", undefined, "web", undefined, "um Corolla");
		expect(q).toBe("E quanto custa esse Corolla hoje?");
		expect(q).not.toMatch(/esse um /i);
	});

	it.each([
		["auto" as const, "um Corolla", "esse Corolla hoje?"],
		["imovel" as const, "um apartamento", "esse apartamento hoje?"],
		["imovel" as const, "uma casa", "essa casa hoje?"],
		["moto" as const, "uma Honda CG", "essa Honda CG hoje?"],
		["servicos" as const, "uma reforma", "essa reforma hoje?"],
	])(
		"categoria %s + item '%s' → concorda pelo ARTIGO capturado, sem artigo residual",
		(category, item, expectedTail) => {
			const q = gateQuestion("credit", category, undefined, "web", undefined, item);
			expect(q).toBe(`E quanto custa ${expectedTail}`);
			expect(q).not.toMatch(/\besse um\b|\bessa uma\b/i);
		},
	);

	it("desiredItem SEM artigo (fallback pela categoria) — auto=esse, moto=essa", () => {
		expect(gateQuestion("credit", "auto", undefined, "web", undefined, "Corolla")).toBe(
			"E quanto custa esse Corolla hoje?",
		);
		expect(gateQuestion("credit", "moto", undefined, "web", undefined, "CG 160")).toBe(
			"E quanto custa essa CG 160 hoje?",
		);
	});

	it("1ª tentativa (default, attempt=1) e re-ask (attempt=2) NÃO repetem o texto verbatim — caminho desiredItem", () => {
		const first = gateQuestion("credit", "auto", undefined, "web", undefined, "um Corolla");
		const second = gateQuestion("credit", "auto", undefined, "web", undefined, "um Corolla", 2);
		expect(second).not.toBe(first);
		expect(second).not.toMatch(/esse um /i);
	});

	it("re-ask também varia no caminho de confirmação (creditMentionedAtDesire)", () => {
		const first = gateQuestion("credit", "auto", undefined, "web", 90_000);
		const second = gateQuestion("credit", "auto", undefined, "web", 90_000, undefined, 2);
		expect(second).not.toBe(first);
	});

	it("re-ask também varia no fallback genérico (sem desiredItem nem creditMentionedAtDesire)", () => {
		const first = gateQuestion("credit", "auto");
		const second = gateQuestion("credit", "auto", undefined, "web", undefined, undefined, 2);
		expect(second).not.toBe(first);
	});

	it("attempt omitido (chamador antigo) preserva o comportamento default (1ª tentativa)", () => {
		expect(gateQuestion("credit", "auto", undefined, "web", undefined, "um Corolla")).toBe(
			"E quanto custa esse Corolla hoje?",
		);
	});
});
