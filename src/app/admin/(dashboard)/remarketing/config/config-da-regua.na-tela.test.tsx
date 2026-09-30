// @vitest-environment happy-dom
/**
 * A escala da régua NA TELA — o que o dono vê e o que o save devolve ao servidor.
 *
 * O caso que este arquivo existe para travar é o do save que APAGA a escala. A
 * tela renderiza um `<input type="number">` por parâmetro vigente e, no save,
 * reenvia TODOS os vigentes; a escala é uma LISTA (CSV) e não pode entrar nesse
 * mapa — se entrasse, o CSV voltaria como remoção e o motor cairia no padrão de
 * fábrica sem ninguém pedir. Ela tem bloco e estado próprios, e é isso que o
 * terceiro caso prova: salvar sem mexer em nada NÃO manda vazio para ela.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigDaRegua } from "./config-da-regua";

const CHAVE_DA_ESCALA = "escala_retomada_minutos";

const PARAMETROS_VIGENTES = [
	{
		chave: "espera_silencio_minutos",
		campo: "esperaSilencioMs",
		rotulo: "Silêncio que abre o toque 01",
		descricao: "Quanto tempo a pessoa precisa ficar sem responder.",
		unidade: "minutos",
		valor: 120,
		unidadeRotulo: "minutos",
		minimo: 1,
		maximo: 1440,
		origem: "fabrica",
		valorInvalido: null,
	},
];

const ESCALA_DA_FABRICA = {
	chave: CHAVE_DA_ESCALA,
	valor: "90,180,300",
	origem: "fabrica",
	valorInvalido: null,
	minimo: 1,
	maximo: 1440,
	maximoDePassos: 5,
};

interface CorpoDoPut {
	parametros: { chave: string; valor: string }[];
}

const originalFetch = global.fetch;
let chamadas: { init?: RequestInit }[];

function resposta(corpo: unknown): Response {
	return new Response(JSON.stringify(corpo), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}

function escalaDoCorpo(corpo: CorpoDoPut): string | undefined {
	return corpo.parametros.find((p) => p.chave === CHAVE_DA_ESCALA)?.valor;
}

beforeEach(() => {
	chamadas = [];
	global.fetch = vi.fn(async (_url: string | URL, init?: RequestInit) => {
		chamadas.push({ init });
		if (init?.method === "PUT") {
			const corpo = JSON.parse(String(init.body)) as CorpoDoPut;
			return resposta({
				parametros: PARAMETROS_VIGENTES,
				escalaDeRetomada: {
					...ESCALA_DA_FABRICA,
					valor: escalaDoCorpo(corpo) ?? "",
					origem: "cadastro",
				},
			});
		}
		return resposta({ parametros: PARAMETROS_VIGENTES, escalaDeRetomada: ESCALA_DA_FABRICA });
	}) as unknown as typeof global.fetch;
});

afterEach(() => {
	cleanup();
	global.fetch = originalFetch;
	vi.restoreAllMocks();
});

async function corpoDoPut(): Promise<CorpoDoPut> {
	const chamada = await waitFor(() => {
		const encontrada = chamadas.find((c) => c.init?.method === "PUT");
		expect(encontrada, "nenhum PUT foi enviado").toBeTruthy();
		return encontrada!;
	});
	return JSON.parse(String(chamada.init?.body)) as CorpoDoPut;
}

function campoDaEscala(): HTMLInputElement {
	return screen.getByLabelText("Escala de retomada") as HTMLInputElement;
}

describe("a escala da régua na tela", () => {
	it("mostra os três intervalos, a origem e a explicação da janela de 24 h", async () => {
		render(<ConfigDaRegua />);

		await screen.findByLabelText("Escala de retomada");
		expect(
			campoDaEscala()
				.value.split(",")
				.map((token) => token.trim()),
		).toEqual(["90", "180", "300"]);

		const bloco = screen.getByTestId("escala-da-regua");
		expect(bloco.textContent).toContain("Padrão de fábrica");
		expect(bloco.textContent).toContain("janela de 24 h");
		expect(bloco.textContent).toContain("5 intervalos");
	});

	it("editar e salvar envia a escala como CSV no corpo do PUT", async () => {
		render(<ConfigDaRegua />);

		const campo = await screen.findByLabelText("Escala de retomada");
		fireEvent.change(campo, { target: { value: "60,120" } });
		fireEvent.click(screen.getByRole("button", { name: "Salvar cadastro" }));

		expect(escalaDoCorpo(await corpoDoPut())).toBe("60,120");
	});

	it("salvar sem mexer na escala não manda vazio para ela", async () => {
		render(<ConfigDaRegua />);

		await screen.findByLabelText("Escala de retomada");
		fireEvent.click(screen.getByRole("button", { name: "Salvar cadastro" }));

		expect(escalaDoCorpo(await corpoDoPut())).toBe("90,180,300");
	});
});