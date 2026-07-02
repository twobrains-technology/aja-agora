// @vitest-environment happy-dom
/**
 * Camada 1 — FIX-198 (a11y/WCAG): o slider do contemplation_dial (role="slider")
 * precisa ser operável por TECLADO — setas ±1, PageUp/PageDown em passo maior,
 * Home/End nos extremos do prazo — com aria-valuenow/min/max corretos. Antes só
 * respondia a clique/arraste por posição (defeito D da rodada qa-dono-produto).
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ContemplationDialPayload } from "@/lib/chat/types";
import { ContemplationDial } from "./contemplation-dial";

const payload: ContemplationDialPayload = {
	administradora: "BANCO DO BRASIL",
	category: "auto",
	creditValue: 131_042,
	termMonths: 72,
	monthlyPayment: 2_365.57,
	initialTargetMonth: 6,
};

const now = () => screen.getByRole("slider").getAttribute("aria-valuenow");

describe("FIX-198 — slider do dial operável por teclado (WCAG)", () => {
	afterEach(cleanup);

	it("aria-valuemin/max/now refletem o prazo e a posição inicial", () => {
		render(<ContemplationDial payload={payload} />);
		const s = screen.getByRole("slider");
		expect(s.getAttribute("aria-valuemin")).toBe("1");
		expect(s.getAttribute("aria-valuemax")).toBe("72");
		expect(s.getAttribute("aria-valuenow")).toBe("6");
	});

	it("ArrowRight/ArrowUp movem +1 mês; ArrowLeft/ArrowDown movem -1", () => {
		render(<ContemplationDial payload={payload} />);
		const s = screen.getByRole("slider");
		fireEvent.keyDown(s, { key: "ArrowRight" });
		expect(now()).toBe("7");
		fireEvent.keyDown(s, { key: "ArrowLeft" });
		expect(now()).toBe("6");
		fireEvent.keyDown(s, { key: "ArrowUp" });
		expect(now()).toBe("7");
		fireEvent.keyDown(s, { key: "ArrowDown" });
		expect(now()).toBe("6");
	});

	it("Home vai pro mínimo (1); End vai pro máximo (prazo)", () => {
		render(<ContemplationDial payload={payload} />);
		const s = screen.getByRole("slider");
		fireEvent.keyDown(s, { key: "End" });
		expect(now()).toBe("72");
		fireEvent.keyDown(s, { key: "Home" });
		expect(now()).toBe("1");
	});

	it("PageUp/PageDown movem em passo maior (>1) e clampam nos limites", () => {
		render(<ContemplationDial payload={payload} />);
		const s = screen.getByRole("slider");
		fireEvent.keyDown(s, { key: "PageUp" });
		expect(Number(now())).toBeGreaterThan(7); // de 6, passo > 1
		fireEvent.keyDown(s, { key: "PageDown" });
		fireEvent.keyDown(s, { key: "PageDown" });
		expect(Number(now())).toBe(1); // clampou no mínimo
	});

	it("teclas irrelevantes não movem o mês nem previnem o default", () => {
		render(<ContemplationDial payload={payload} />);
		const s = screen.getByRole("slider");
		fireEvent.keyDown(s, { key: "a" });
		expect(now()).toBe("6");
	});
});
