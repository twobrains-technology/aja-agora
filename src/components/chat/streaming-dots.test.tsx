// @vitest-environment happy-dom
/**
 * FIX-288 — o chip de status ("Buscando grupos") ficava com o MESMO texto
 * estático por 50-64s enquanto search_groups/recommend_groups/simulate_quota/
 * get_rates estavam em voo (latências reais da Bevi, veredito-r9pos2-sonnet.md
 * §1/§3). `TOOL_LABELS` era um mapa estático sem noção de tempo decorrido.
 *
 * Este teste prova que `StreamingDots` agora evolui a copy com um timer
 * interno pras 4 tools de descoberta real (decisão registrada em
 * docs/decisoes/blocos/2026-07-12-bloco-r9-3-latencia-percebida.md), reseta o
 * timer quando o `tool` muda, e NÃO evolui copy pras demais tools
 * (present_*, capture_lead etc. — rápidas e determinísticas).
 *
 * As asserções leem o `aria-label` do `<output>` (role "status") em vez do
 * texto interno animado (AnimatePresence/motion) — o `aria-label` reflete o
 * estágio atual de forma síncrona a cada render, sem depender de a animação
 * de saída completar sob fake timers (o Framer Motion usa requestAnimationFrame
 * internamente, que não avança com `vi.advanceTimersByTime`).
 */

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StreamingDots } from "./streaming-dots";

function statusLabel(): string {
	return screen.getByRole("status").getAttribute("aria-label") ?? "";
}

beforeEach(() => {
	document.body.innerHTML = "";
	if (!window.matchMedia) {
		window.matchMedia = vi.fn().mockImplementation((query: string) => ({
			matches: false,
			media: query,
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn(),
		}));
	}
	vi.useFakeTimers();
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe("StreamingDots — FIX-288 chip evolui com o tempo (tools de descoberta real)", () => {
	it("mostra o texto do estágio 1 imediatamente ao montar", () => {
		render(<StreamingDots tool="search_groups" />);
		expect(statusLabel()).toBe("Buscando grupos…");
	});

	it("evolui pro estágio 2 após 8s decorridos no mesmo tool", () => {
		render(<StreamingDots tool="search_groups" />);
		act(() => {
			vi.advanceTimersByTime(8_000);
		});
		expect(statusLabel()).toMatch(/consultando/i);
	});

	it("evolui pro estágio 3 após 18s decorridos no mesmo tool", () => {
		render(<StreamingDots tool="recommend_groups" />);
		act(() => {
			vi.advanceTimersByTime(18_000);
		});
		expect(statusLabel()).toMatch(/quase lá/i);
	});

	it("reinicia o timer quando o tool muda — não pula direto pro estágio avançado do tool anterior", () => {
		const { rerender } = render(<StreamingDots tool="search_groups" />);
		act(() => {
			vi.advanceTimersByTime(18_000);
		});
		expect(statusLabel()).toMatch(/quase lá/i);

		rerender(<StreamingDots tool="recommend_groups" />);
		expect(statusLabel()).toBe("Comparando grupos…");
	});

	it("NÃO evolui copy pra tools rápidas/determinísticas (present_group_card) mesmo após tempo passar", () => {
		render(<StreamingDots tool="present_group_card" />);
		act(() => {
			vi.advanceTimersByTime(30_000);
		});
		expect(statusLabel()).toBe("Preparando opções…");
	});

	it("simulate_quota e get_rates também evoluem (são as outras 2 tools de descoberta real)", () => {
		const { rerender } = render(<StreamingDots tool="simulate_quota" />);
		act(() => {
			vi.advanceTimersByTime(8_000);
		});
		expect(statusLabel()).not.toBe("Simulando parcelas…");

		rerender(<StreamingDots tool="get_rates" />);
		expect(statusLabel()).toBe("Consultando taxas…");
		act(() => {
			vi.advanceTimersByTime(8_000);
		});
		expect(statusLabel()).not.toBe("Consultando taxas…");
	});
});
