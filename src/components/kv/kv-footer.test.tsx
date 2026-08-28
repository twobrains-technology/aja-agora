// @vitest-environment happy-dom
/**
 * FIX-353 — o CTA final do Footer era <button> sem onClick (réplica só visual do
 * Figma, nunca integrada ao Modo Teatro). Cobre o mesmo padrão de wiring de
 * `closing.tsx`/`brand-footer.tsx`: clicar chama onOpenChat com seed vazio + o
 * elemento clicado.
 *
 * Eram dois botões ("Fale com a AJA" e "Encontre o consórcio certo") num bloco
 * "Busque a melhor alternativa". Em 28/08 (Figma 731:6575, comentário #145) o
 * bloco saiu e o fecho virou um "Comparar agora" só, dentro da faixa da
 * assinatura — o defeito que este arquivo trava é o mesmo, e a superfície é
 * menor. Onde ele mora e por que é um só está em `kv-footer.independente.test.tsx`.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KvFooter } from "./kv-footer";

afterEach(() => {
	cleanup();
});

describe("FIX-353 — o CTA final do Footer abre o Modo Teatro", () => {
	it("clicar em 'Comparar agora' chama onOpenChat com seed vazio e o elemento clicado", () => {
		const onOpenChat = vi.fn();
		render(<KvFooter onOpenChat={onOpenChat} />);

		const button = screen.getByRole("button", { name: "Comparar agora" });
		fireEvent.click(button);

		expect(onOpenChat).toHaveBeenCalledTimes(1);
		expect(onOpenChat).toHaveBeenCalledWith("", button);
	});
});
