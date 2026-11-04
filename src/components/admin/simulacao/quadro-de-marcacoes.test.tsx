// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Marcacao, MarcacaoId, ResultadoDoPerfil } from "@/lib/playground/simulacao/tipos";
import { QuadroDeMarcacoes } from "./quadro-de-marcacoes";

afterEach(cleanup);

const IDS: MarcacaoId[] = [
	"chegou-a-proposta",
	"pedido-repetido",
	"card-que-nao-apareceu",
	"resposta-cortada",
	"turno-sem-resposta",
	"numero-sem-ferramenta",
	"chamou-fila",
	"falou-prazo",
];

function resultado(): ResultadoDoPerfil {
	const marcacoes: Marcacao[] = IDS.map((id) => ({
		id,
		status: "LIMPA",
		gravidade: "DEFEITO",
		ocorrencias: [],
	}));
	marcacoes[1] = {
		id: "pedido-repetido",
		status: "ACIONADA",
		gravidade: "DEFEITO",
		ocorrencias: [{ turno: 2, evidencia: "pediu o CPF duas vezes" }],
	};
	marcacoes[5] = {
		id: "numero-sem-ferramenta",
		status: "NAO_APLICAVEL",
		gravidade: "DEFEITO",
		ocorrencias: [],
		motivoNaoAplicavel: "sem fonte de números",
	};
	return {
		perfilId: "caminho-feliz",
		dados: { fonteDeDados: "duble", catalogo: "padrao", fila: { atendentes: 2 } },
		modo: "depois",
		turnos: [],
		marcacoes,
		parada: "limite-de-turnos",
		veredito: "REPROVADO",
		iniciadoEm: "2026-11-04T00:00:00.000Z",
		achados: [],
	};
}

describe("QuadroDeMarcacoes", () => {
	it("mostra cada status como texto", () => {
		render(<QuadroDeMarcacoes resultados={[resultado()]} rotuloDoPerfil={() => "Caminho feliz"} />);
		expect(screen.getAllByText("ACIONADA")).toHaveLength(1);
		expect(screen.getAllByText("Limpa").length).toBeGreaterThan(0);
		expect(screen.getByText("Não aplicável")).toBeTruthy();
	});

	it("abre a evidência com turno e trecho", () => {
		render(<QuadroDeMarcacoes resultados={[resultado()]} rotuloDoPerfil={() => "Caminho feliz"} />);
		fireEvent.click(screen.getByLabelText(/Pedido repetido do mesmo dado em Caminho feliz/));
		expect(screen.getByText(/Turno 3: pediu o CPF duas vezes/)).toBeTruthy();
	});
});
