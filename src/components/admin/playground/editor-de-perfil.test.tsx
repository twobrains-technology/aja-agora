// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PARTES_NA_TELA, PARTES_PADRAO } from "@/lib/agent/prompt-do-vendedor";
import { ler, serializar } from "@/lib/playground/orientacao-em-partes";
import { temPromessa } from "./chat-lado-a-lado";
import { EditorDePerfil } from "./editor-de-perfil";

const ROTULOS_DAS_PARTES = [
	"Abertura",
	"Descoberta",
	"Contato",
	"Cartas e cards",
	"Objeções",
	"Proposta e fechamento",
	"Atendimento humano",
];
const parte = (r: string) => screen.getByRole("group", { name: `Parte: ${r}` });
const vazio = serializar({ partes: {}, contato: "carta-primeiro", livre: "" });

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
		expect(screen.getByText(/^22\/8000 caracteres/)).toBeTruthy();
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

	it("T5.1 mostra Estilo geral antes das 7 partes, na ordem da tela", () => {
		render(
			<EditorDePerfil
				atributos={attrs}
				orientacao={vazio}
				onAtributos={() => {}}
				onOrientacao={() => {}}
			/>,
		);
		expect(PARTES_NA_TELA.length).toBe(7);
		const estilo = screen.getByRole("group", { name: "Estilo geral" });
		expect(within(estilo).getAllByRole("combobox").length).toBe(4);
		const grupos = screen.getAllByRole("group").map((g) => g.getAttribute("aria-label"));
		expect(grupos).toEqual(["Estilo geral", ...ROTULOS_DAS_PARTES.map((r) => `Parte: ${r}`)]);
	});

	it("T5.2 editar uma parte emite envelope em que só ela difere do padrão", () => {
		const onOrientacao = vi.fn();
		render(
			<EditorDePerfil
				atributos={attrs}
				orientacao={vazio}
				onAtributos={() => {}}
				onOrientacao={onOrientacao}
			/>,
		);
		expect(within(parte("Descoberta")).getByText("padrão")).toBeTruthy();
		fireEvent.change(within(parte("Descoberta")).getByRole("textbox"), {
			target: { value: "Novo texto." },
		});
		const env = ler(onOrientacao.mock.calls[0][0]);
		expect(env.partes).toEqual({ descoberta: "Novo texto." });
		expect(env.livre).toBe("");
	});

	it("T5.3 restaurar padrão volta o texto e o rótulo para padrão", () => {
		const onOrientacao = vi.fn();
		const editada = serializar({ partes: { abertura: "X" }, contato: "carta-primeiro", livre: "" });
		render(
			<EditorDePerfil
				atributos={attrs}
				orientacao={editada}
				onAtributos={() => {}}
				onOrientacao={onOrientacao}
			/>,
		);
		expect(within(parte("Abertura")).getByText("editada")).toBeTruthy();
		fireEvent.click(
			within(parte("Abertura")).getByRole("button", { name: "Restaurar padrão da parte" }),
		);
		expect(ler(onOrientacao.mock.calls[0][0]).partes).toEqual({});
		cleanup();
		render(
			<EditorDePerfil
				atributos={attrs}
				orientacao={vazio}
				onAtributos={() => {}}
				onOrientacao={() => {}}
			/>,
		);
		expect((within(parte("Abertura")).getByRole("textbox") as HTMLTextAreaElement).value).toBe(
			PARTES_PADRAO.abertura,
		);
	});

	it("T5.4 contato: padrão é carta primeiro; trocar emite telefone-antes", () => {
		const onOrientacao = vi.fn();
		render(
			<EditorDePerfil
				atributos={attrs}
				orientacao={vazio}
				onAtributos={() => {}}
				onOrientacao={onOrientacao}
			/>,
		);
		const sel = within(parte("Contato")).getByRole("combobox") as HTMLSelectElement;
		expect(sel.value).toBe("carta-primeiro");
		expect(within(sel).getByText("Carta primeiro, WhatsApp depois (padrão)")).toBeTruthy();
		fireEvent.change(sel, { target: { value: "telefone-antes" } });
		expect(ler(onOrientacao.mock.calls[0][0]).contato).toBe("telefone-antes");
	});

	it("T5.5 promessa numa parte dá ERRO só naquela parte", () => {
		const env = serializar({
			partes: { objecoes: "contemplação garantida" },
			contato: "carta-primeiro",
			livre: "",
		});
		render(
			<EditorDePerfil
				atributos={attrs}
				orientacao={env}
				onAtributos={() => {}}
				onOrientacao={() => {}}
			/>,
		);
		expect(within(parte("Objeções")).getByRole("alert").textContent).toMatch(/^ERRO: /);
		expect(within(parte("Abertura")).queryByRole("alert")).toBeNull();
		expect(screen.getAllByRole("alert").length).toBe(1);
	});

	it("T5.6 perfil legado aparece em Orientação adicional, não nas partes", () => {
		render(
			<EditorDePerfil
				atributos={attrs}
				orientacao="Seja objetivo."
				onAtributos={() => {}}
				onOrientacao={() => {}}
			/>,
		);
		expect((screen.getByLabelText("Orientação adicional") as HTMLTextAreaElement).value).toBe(
			"Seja objetivo.",
		);
		for (const r of ROTULOS_DAS_PARTES) {
			expect(within(parte(r)).getByText("padrão")).toBeTruthy();
		}
	});

	it("marca promessa na fala do vendedor", () => {
		expect(temPromessa("Sua contemplação é garantida!")).toBe(true);
		expect(temPromessa("Contemplação é por sorteio ou lance.")).toBe(false);
	});
});
