// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SunMark } from "./sun-mark";

afterEach(cleanup);

describe("SunMark — símbolo do sol da marca", () => {
	it("renderiza os 10 raios (sol completo, à prova de print/reduced-motion)", () => {
		const { container } = render(<SunMark variant="color" />);
		expect(container.querySelectorAll("path")).toHaveLength(10);
	});

	it("expõe rótulo acessível da marca", () => {
		const { container } = render(<SunMark variant="white" />);
		const svg = container.querySelector("svg");
		expect(svg?.getAttribute("aria-label")).toBe("Aja Agora");
	});

	it("variante color/navy usa o gradiente do sol; 1 raio é navy sólido", () => {
		const { container } = render(<SunMark variant="color" />);
		expect(container.querySelector("linearGradient")).not.toBeNull();
		const fills = [...container.querySelectorAll("path")].map((p) => p.getAttribute("fill"));
		expect(fills.filter((f) => f === "#052440")).toHaveLength(1);
		expect(fills.some((f) => f?.startsWith("url(#"))).toBe(true);
	});

	it("variante white pinta todos os raios de branco (sem gradiente)", () => {
		const { container } = render(<SunMark variant="white" />);
		expect(container.querySelector("linearGradient")).toBeNull();
		const fills = [...container.querySelectorAll("path")].map((p) => p.getAttribute("fill"));
		expect(fills.every((f) => f === "#fff")).toBe(true);
	});
});
