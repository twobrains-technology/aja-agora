// @vitest-environment happy-dom
/**
 * FIX-353 — os dois botões do CTA final do Footer ("Fale com a AJA" e
 * "Encontre o consórcio certo") eram <button> sem onClick (réplica só visual do
 * Figma, nunca integrada ao Modo Teatro). Cobre o mesmo padrão de wiring de
 * `closing.tsx`/`brand-footer.tsx`: clicar chama onOpenChat com seed vazio +
 * o elemento clicado.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KvFooter } from "./kv-footer";

afterEach(() => {
	cleanup();
});

describe("FIX-353 — CTAs finais do Footer abrem o Modo Teatro", () => {
	it("clicar em 'Fale com a AJA' chama onOpenChat com seed vazio e o elemento clicado", () => {
		const onOpenChat = vi.fn();
		render(<KvFooter onOpenChat={onOpenChat} />);

		const button = screen.getByRole("button", { name: "Fale com a AJA" });
		fireEvent.click(button);

		expect(onOpenChat).toHaveBeenCalledTimes(1);
		expect(onOpenChat).toHaveBeenCalledWith("", button);
	});

	it("clicar em 'Encontre o consórcio certo' chama onOpenChat com seed vazio e o elemento clicado", () => {
		const onOpenChat = vi.fn();
		render(<KvFooter onOpenChat={onOpenChat} />);

		const button = screen.getByRole("button", { name: "Encontre o consórcio certo" });
		fireEvent.click(button);

		expect(onOpenChat).toHaveBeenCalledTimes(1);
		expect(onOpenChat).toHaveBeenCalledWith("", button);
	});
});
