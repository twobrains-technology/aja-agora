// @vitest-environment happy-dom
/**
 * FIX-222 (Ata 2026-07-04): logo da administradora no card ("traz
 * confiabilidade e o cara sabe pra onde vai"). Assets reais são PENDENTE —
 * este componente prova o pipeline + o fallback gracioso (nunca quebra).
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AdministradoraLogo } from "./administradora-logo";

describe("AdministradoraLogo", () => {
	afterEach(() => {
		cleanup();
	});

	it("renderiza a imagem quando logoUrl está presente", () => {
		render(<AdministradoraLogo administradora="BANCO DO BRASIL" logoUrl="https://cdn/bb.png" />);
		const img = screen.getByRole("img", { name: /banco do brasil/i });
		expect(img).toHaveProperty("src", "https://cdn/bb.png");
	});

	it("cai no fallback (iniciais) quando não há logo — nunca quebra", () => {
		render(<AdministradoraLogo administradora="BANCO DO BRASIL" />);
		expect(screen.queryByRole("img")).toBeNull();
		expect(screen.getByText("BA")).toBeTruthy();
	});

	it("fallback funciona com nome de 1 palavra também", () => {
		render(<AdministradoraLogo administradora="ÂNCORA" />);
		expect(screen.getByText("ÂN")).toBeTruthy();
	});
});
