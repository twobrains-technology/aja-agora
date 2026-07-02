// @vitest-environment happy-dom
/**
 * FIX-131 (D21, paridade landing) — a coluna "Consórcio" do footer da landing
 * expunha 4 categorias de ENTRADA (Imóvel/Automóvel/Moto/Serviços). Cada uma é
 * um <button> que ABRE O CHAT com um seed de categoria (onStart) — ou seja, é
 * uma porta de entrada da jornada, não link informativo. O hero, o welcome do
 * chat (FIX-130) e o WhatsApp têm só 3 (decisão Bv2-01: moto substituiu
 * serviços). Este footer ficou com a 4ª.
 *
 * REGRA (jornada canônica, Passo 1 / D21): 3 categorias de entrada. servicos
 * segue vivo por texto livre, só não é chip clicável de entrada.
 *
 * Falha ANTES do fix (botão "Serviços" presente / 4 chips na coluna Consórcio).
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrandFooter } from "./brand-footer";

afterEach(() => {
	cleanup();
});

describe("FIX-131 — footer da landing com 3 categorias de entrada", () => {
	it("NÃO oferece 'Serviços' como chip de entrada da jornada", () => {
		render(<BrandFooter onStart={vi.fn()} />);
		expect(screen.queryByRole("button", { name: "Serviços" })).toBeNull();
	});

	it("expõe exatamente 3 categorias de entrada — Imóvel, Automóvel, Moto", () => {
		render(<BrandFooter onStart={vi.fn()} />);
		// os chips de entrada são <button> (têm seed → onStart); os demais itens
		// do footer são <a> (âncora). Então os buttons são só os chips de categoria.
		const chips = screen.getAllByRole("button");
		expect(chips.map((b) => b.textContent)).toEqual(["Imóvel", "Automóvel", "Moto"]);
	});
});
