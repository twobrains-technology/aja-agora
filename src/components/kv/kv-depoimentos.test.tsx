// @vitest-environment happy-dom
/**
 * FIX-353 — botão final "Fale com a AJA" da seção Depoimentos era um
 * <button> sem onClick (réplica só visual do Figma, nunca integrada ao Modo
 * Teatro). Cobre o mesmo padrão de wiring de `closing.tsx`/`brand-footer.tsx`:
 * clicar chama onOpenChat com seed vazio (saudação) + o elemento clicado.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
	// biome-ignore lint/suspicious/noExplicitAny: mock simples de next/image pro teste
	default: ({ fill, priority, ...rest }: any) => createElement("img", rest),
}));

import { KvDepoimentos } from "./kv-depoimentos";

afterEach(() => {
	cleanup();
});

describe("FIX-353 — CTA final de Depoimentos abre o Modo Teatro", () => {
	it("clicar em 'Fale com a AJA' chama onOpenChat com seed vazio e o elemento clicado", () => {
		const onOpenChat = vi.fn();
		render(<KvDepoimentos onOpenChat={onOpenChat} />);

		const button = screen.getByRole("button", { name: "Fale com a AJA" });
		fireEvent.click(button);

		expect(onOpenChat).toHaveBeenCalledTimes(1);
		expect(onOpenChat).toHaveBeenCalledWith("", button);
	});
});
