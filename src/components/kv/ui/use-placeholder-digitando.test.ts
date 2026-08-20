// @vitest-environment happy-dom
/**
 * O placeholder que se digita sozinho no campo do hero (mobile).
 *
 * Três coisas podem dar errado aqui, e as três são chatas em produção:
 *
 * 1. **disputar o campo com quem está escrevendo** — timer rodando enquanto a
 *    pessoa digita é render gasto num texto que nem aparece;
 * 2. **piscar na primeira carga** — o hook só sabe da preferência de movimento
 *    depois do primeiro efeito, então o instante 0 do estado animado TEM que ser
 *    igual ao do congelado, senão o campo mostra a frase, esvazia e redigita;
 * 3. **rodar onde não devia** — com `prefers-reduced-motion` não pode agendar
 *    timer nenhum.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PERGUNTAS_DO_CAMPO, usePlaceholderDigitando } from "./use-placeholder-digitando";

const FRASES = ["abc", "xy"] as const;

/**
 * Avança UM passo da máquina de estados.
 *
 * Um `advanceTimersByTime` grande não serve: o timer seguinte só é agendado
 * depois que o React re-renderiza, e o re-render só acontece ao sair do `act`.
 * Passar 5000ms de uma vez dispara um tique só e dá a impressão de que a
 * animação travou.
 */
function tique(ms: number) {
	act(() => {
		vi.advanceTimersByTime(ms);
	});
}

/** Ajusta o que `useIsMobile` e `useReducedMotion` enxergam. */
function ambiente({ mobile, reduzido }: { mobile: boolean; reduzido: boolean }) {
	window.innerWidth = mobile ? 390 : 1440;
	window.matchMedia = vi.fn().mockImplementation((query: string) => ({
		matches: query.includes("prefers-reduced-motion") ? reduzido : mobile,
		media: query,
		onchange: null,
		addListener: vi.fn(),
		removeListener: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
	})) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("usePlaceholderDigitando", () => {
	it("começa com a frase inteira e depois apaga — nunca pisca vazio", () => {
		ambiente({ mobile: true, reduzido: false });

		const { result } = renderHook(() =>
			usePlaceholderDigitando({ valor: "", focado: false, frases: FRASES }),
		);

		expect(result.current).toBe("abc");

		// Segura, e só então começa a apagar.
		tique(1600);
		expect(result.current).toBe("abc");

		tique(30);
		expect(result.current).toBe("ab");
	});

	it("chega na frase seguinte depois de apagar a primeira", () => {
		ambiente({ mobile: true, reduzido: false });

		const { result } = renderHook(() =>
			usePlaceholderDigitando({ valor: "", focado: false, frases: FRASES }),
		);

		tique(1600); // fim do "segura" → passa a apagar
		tique(30); // "ab"
		tique(30); // "a"
		tique(30); // ""
		expect(result.current).toBe("");

		tique(320); // respiro de troca → frase 2, digitando
		tique(55); // primeira tecla

		expect(result.current).toBe("x");
	});

	it("com o campo preenchido não mexe: devolve a frase 1 e não agenda nada", () => {
		ambiente({ mobile: true, reduzido: false });

		const { result } = renderHook(() =>
			usePlaceholderDigitando({ valor: "Quero um carro", focado: false, frases: FRASES }),
		);

		expect(result.current).toBe("abc");
		expect(vi.getTimerCount()).toBe(0);

		tique(10_000);
		expect(result.current).toBe("abc");
	});

	it("com o campo focado também congela — animação não disputa cursor", () => {
		ambiente({ mobile: true, reduzido: false });

		const { result } = renderHook(() =>
			usePlaceholderDigitando({ valor: "", focado: true, frases: FRASES }),
		);

		tique(10_000);

		expect(result.current).toBe("abc");
		expect(vi.getTimerCount()).toBe(0);
	});

	it("anima em qualquer largura — o gate de mobile saiu", () => {
		// Nasceu só no mobile (2026-08-20) e perdeu o `useIsMobile` quando o desktop
		// foi alinhado ao mesmo desenho. Um campo que convida no celular e fica
		// parado no monitor eram dois produtos na mesma página.
		ambiente({ mobile: false, reduzido: false });

		const { result } = renderHook(() =>
			usePlaceholderDigitando({ valor: "", focado: false, frases: FRASES }),
		);

		tique(1600);
		tique(30);

		expect(result.current).toBe("ab");
	});

	it("com prefers-reduced-motion fica estático mesmo no mobile", () => {
		ambiente({ mobile: true, reduzido: true });

		const { result } = renderHook(() =>
			usePlaceholderDigitando({ valor: "", focado: false, frases: FRASES }),
		);

		tique(10_000);

		expect(result.current).toBe("abc");
		expect(vi.getTimerCount()).toBe(0);
	});

	it("as perguntas de exemplo cobrem as três categorias, em português", () => {
		// Elas induzem o cliente a entender que dá pra pedir por valor do bem OU
		// por parcela — era o ponto da marcação. Perder uma categoria aqui é perder
		// metade do recado.
		const tudo = PERGUNTAS_DO_CAMPO.join(" ").toLowerCase();

		expect(tudo).toContain("carro");
		expect(tudo).toContain("casa");
		expect(tudo).toContain("moto");
		expect(tudo).toContain("parcela");
	});
});
