// FIX-32 (bloco-r) — Defeito 2: a detecção de "fundo" por IntersectionObserver
// do sentinel (h-20, threshold 0.5) confunde POSIÇÃO com INTENÇÃO — um artifact
// alto tira o sentinel da viewport sem o usuário ter rolado. A intenção passa a
// ser medida pela posição REAL do scroll do container.
import { describe, expect, it } from "vitest";
import { BOTTOM_THRESHOLD_PX, isNearBottom } from "./scroll-intent";

describe("FIX-32 — isNearBottom (posição real do scroll, não visibilidade do sentinel)", () => {
	it("true quando o fundo está dentro do threshold", () => {
		// 1000 - 920 - 80 = 0 <= 80
		expect(isNearBottom({ scrollTop: 920, scrollHeight: 1000, clientHeight: 80 })).toBe(true);
	});

	it("false quando o usuário rolou bem acima do fundo", () => {
		// 1000 - 100 - 80 = 820 > 80
		expect(isNearBottom({ scrollTop: 100, scrollHeight: 1000, clientHeight: 80 })).toBe(false);
	});

	it("usa o threshold default exportado", () => {
		const m = { scrollTop: 1000 - 80 - BOTTOM_THRESHOLD_PX, scrollHeight: 1000, clientHeight: 80 };
		expect(isNearBottom(m)).toBe(true); // exatamente no limite
		expect(isNearBottom({ ...m, scrollTop: m.scrollTop - 1 })).toBe(false); // 1px além
	});

	it("respeita threshold custom", () => {
		// 1000 - 800 - 80 = 120 <= 200
		expect(isNearBottom({ scrollTop: 800, scrollHeight: 1000, clientHeight: 80 }, 200)).toBe(true);
	});
});
