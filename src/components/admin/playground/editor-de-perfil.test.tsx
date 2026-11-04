// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { temPromessa } from "./chat-lado-a-lado";
import { EditorDePerfil } from "./editor-de-perfil";

const attrs = {
	agressividade: "equilibrada",
	proatividade: "media",
	tecnicidade: "neutro",
	tom: "neutro",
} as const;

afterEach(cleanup);

describe("EditorDePerfil", () => {
	it("mostra os 4 seletores com rótulo escrito e muda o atributo", () => {
		const onAtributos = vi.fn();
		render(
			<EditorDePerfil
				atributos={attrs}
				orientacao=""
				onAtributos={onAtributos}
				onOrientacao={() => {}}
			/>,
		);
		for (const r of [
			"Agressividade comercial",
			"Proatividade de follow-up",
			"Tecnicidade",
			"Tom",
		]) {
			expect(screen.getByLabelText(r)).toBeTruthy();
		}
		fireEvent.change(screen.getByLabelText("Tom"), { target: { value: "coloquial" } });
		expect(onAtributos).toHaveBeenCalledWith({ ...attrs, tom: "coloquial" });
	});

	it("conta caracteres e mostra o motivo do detector em texto", () => {
		render(
			<EditorDePerfil
				atributos={attrs}
				orientacao="contemplação garantida"
				onAtributos={() => {}}
				onOrientacao={() => {}}
			/>,
		);
		expect(screen.getByText(/22\/2000 caracteres/)).toBeTruthy();
		expect(screen.getByRole("alert").textContent).toMatch(/^ERRO: .+/);
	});

	it("sem promessa não há erro", () => {
		render(
			<EditorDePerfil
				atributos={attrs}
				orientacao="Seja objetivo."
				onAtributos={() => {}}
				onOrientacao={() => {}}
			/>,
		);
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("marca promessa na fala do vendedor", () => {
		expect(temPromessa("Sua contemplação é garantida!")).toBe(true);
		expect(temPromessa("Contemplação é por sorteio ou lance.")).toBe(false);
	});
});
