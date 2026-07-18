// @vitest-environment happy-dom
/**
 * FIX-351 (topo de funil /kv) — o botão "Comparar agora" do menu era um
 * <button> sem onClick: réplica visual do Figma que nunca recebeu a
 * integração com o Modo Teatro (onOpenChat/TheaterOpener) que a landing de
 * produção já tem. Cobre também o toggle do menu mobile (nav só existia em
 * `lg:flex`, sem alternativa abaixo de 1024px).
 */

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { KvMenu } from "./kv-menu";

afterEach(() => {
	cleanup();
});

describe("FIX-351 — KvMenu chama onOpenChat", () => {
	it("clicar em 'Comparar agora' chama onOpenChat com seed vazio", () => {
		const onOpenChat = vi.fn();
		render(<KvMenu onOpenChat={onOpenChat} />);

		fireEvent.click(screen.getByRole("button", { name: "Comparar agora" }));

		expect(onOpenChat).toHaveBeenCalledTimes(1);
		expect(onOpenChat.mock.calls[0][0]).toBe("");
	});

	it("'Entrar' fica inerte (desabilitado) — não existe login de cliente ainda", () => {
		const onOpenChat = vi.fn();
		render(<KvMenu onOpenChat={onOpenChat} />);

		const entrar = screen.getByRole("button", { name: "Entrar" });
		fireEvent.click(entrar);

		expect(entrar).toBeDisabled();
		expect(onOpenChat).not.toHaveBeenCalled();
	});

	it("menu mobile: toggle abre e fecha o painel com os anchors da nav", () => {
		render(<KvMenu onOpenChat={vi.fn()} />);

		expect(document.getElementById("kv-menu-mobile-nav")).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: /abrir menu/i }));
		const mobileNav = document.getElementById("kv-menu-mobile-nav") as HTMLElement;
		expect(mobileNav).not.toBeNull();
		const mobileLink = within(mobileNav).getByRole("link", { name: "Dúvidas" });

		fireEvent.click(mobileLink);
		expect(document.getElementById("kv-menu-mobile-nav")).toBeNull();
	});
});
