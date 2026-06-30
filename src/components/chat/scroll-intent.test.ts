// FIX-32 (bloco-r) — Defeito 2: a detecção de "fundo" por IntersectionObserver
// do sentinel (h-20, threshold 0.5) confunde POSIÇÃO com INTENÇÃO — um artifact
// alto tira o sentinel da viewport sem o usuário ter rolado. A intenção passa a
// ser medida pela posição REAL do scroll do container.
import { describe, expect, it } from "vitest";
import {
	BOTTOM_THRESHOLD_PX,
	distanceToBottom,
	isNearBottom,
	nextStickState,
	STICK_ENTER_PX,
	STICK_EXIT_PX,
} from "./scroll-intent";

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

// FIX-111 (uso manual Kairo, 2026-06-30): "o scroll fica bugado indo e voltando".
// Causa: handleScroll fazia setStick(isNearBottom(el)) com um ÚNICO threshold (80px)
// — perto do fim, cada delta de token / reflow movia a distância em torno do limite
// e o stick alternava true/false a cada px, e o auto-scroll (keyed no stick) ligava
// e desligava → oscilação visível. A correção é HISTERESE: dois limiares com banda
// morta, o estado só troca quando cruza a borda OPOSTA. Função pura, sem waitForTimeout.
describe("FIX-111 — nextStickState (histerese, sem flip-flop perto do fim)", () => {
	// Gera métricas de scroll cuja distância até o fundo é exatamente `dist`.
	function mk(dist: number) {
		const clientHeight = 80;
		const scrollHeight = 1000;
		return { scrollTop: scrollHeight - clientHeight - dist, scrollHeight, clientHeight };
	}

	it("a banda morta existe (enter < exit)", () => {
		expect(STICK_ENTER_PX).toBeLessThan(STICK_EXIT_PX);
	});

	it("distanceToBottom mede a distância real até o fundo", () => {
		expect(distanceToBottom({ scrollTop: 920, scrollHeight: 1000, clientHeight: 80 })).toBe(0);
		expect(distanceToBottom({ scrollTop: 800, scrollHeight: 1000, clientHeight: 80 })).toBe(120);
	});

	it("grudado (true): permanece grudado dentro da banda morta", () => {
		expect(nextStickState(true, mk(100))).toBe(true);
	});

	it("grudado: só solta quando afasta ALÉM do exit", () => {
		expect(nextStickState(true, mk(STICK_EXIT_PX))).toBe(true); // no limite ainda gruda
		expect(nextStickState(true, mk(STICK_EXIT_PX + 1))).toBe(false);
	});

	it("solto (false): permanece solto dentro da banda morta", () => {
		expect(nextStickState(false, mk(100))).toBe(false);
	});

	it("solto: só re-gruda quando chega bem perto do fim (<= enter)", () => {
		expect(nextStickState(false, mk(STICK_ENTER_PX))).toBe(true);
		expect(nextStickState(false, mk(STICK_ENTER_PX + 1))).toBe(false);
	});

	it("NÃO oscila: distância variando dentro da banda morta mantém o estado", () => {
		// reflow/token durante o stream faz a distância pular dentro de (enter, exit).
		let stick = true;
		for (const d of [50, 150, 60, 140, 80, 120, 50]) {
			stick = nextStickState(stick, mk(d));
			expect(stick, `distância ${d}px não pode soltar o stick`).toBe(true);
		}
		let loose = false;
		for (const d of [50, 150, 60, 140, 80, 120, 50]) {
			loose = nextStickState(loose, mk(d));
			expect(loose, `distância ${d}px não pode re-grudar sozinho`).toBe(false);
		}
	});
});
