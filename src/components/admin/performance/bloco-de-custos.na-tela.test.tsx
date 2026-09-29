// @vitest-environment happy-dom
/**
 * O bloco de custos na TELA — o que a cliente lê, não o que o cálculo decide.
 *
 * O caso que este arquivo existe para travar é o do preço de mensagem ausente:
 * a tela tem que mostrar o VOLUME e dizer "sem preço cadastrado", e o CPC tem
 * que sair como "não calculável" — nunca como "R$ 0,00". É a diferença entre
 * "não deu para calcular" e "custou nada", e ela muda a decisão de quem lê.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { CustosDoCpc } from "@/lib/admin/performance-types";
import { BlocoDeCustos } from "./bloco-de-custos";

afterEach(cleanup);

const base = (over: Partial<CustosDoCpc> = {}): CustosDoCpc => ({
	investimentoMetaCents: 100_000,
	custoDeIA: {
		tipo: "valor",
		usdCents: 2000,
		brlCents: 10_000,
		conversas: 5,
		porModelo: [],
		porDia: [],
	},
	custoDeMensagem: {
		quantidade: 10,
		porTemplate: [],
		custo: { tipo: "valor", centavos: 500, precoUnitarioCents: 50 },
	},
	contagens: { conversas: 5, identificados: 4, qualificados: 10 },
	fontes: {
		investimento: "Meta (reportado)",
		custoDeIA: "Langfuse",
		custoDeMensagem: "cadastro de preço",
		contagens: "Postgres",
	},
	...over,
});

describe("BlocoDeCustos", () => {
	it("com os três custos, mostra o CPC e declara a fonte de cada número", () => {
		render(<BlocoDeCustos custos={base()} />);

		// (100000 + 10000 + 500) / 10 = 11050 centavos = R$ 110,50
		expect(screen.getByText("R$ 110,50")).toBeTruthy();
		expect(screen.getByText(/fonte: Meta \(reportado\)/)).toBeTruthy();
		expect(screen.getByText(/fonte: Langfuse/)).toBeTruthy();
		expect(screen.getByText(/fonte: cadastro de preço/)).toBeTruthy();
	});

	it("sem preço de mensagem, mostra o volume, diz 'sem preço cadastrado' e o CPC não é número", () => {
		render(
			<BlocoDeCustos
				custos={base({
					custoDeMensagem: {
						quantidade: 7,
						porTemplate: [],
						custo: { tipo: "motivo", motivo: "sem_preco", explicacao: "sem preço cadastrado" },
					},
				})}
			/>,
		);

		expect(screen.getByText("sem preço cadastrado")).toBeTruthy();
		expect(screen.getByText(/7 mensagens de template/)).toBeTruthy();

		const cpc = screen.getByTestId("custos-cpc");
		expect(cpc.textContent).toContain("não calculável");
		expect(cpc.textContent).not.toContain("R$ 0,00");
	});

	it("a Meta sem investimento não vira R$ 0,00 — diz 'não reportado'", () => {
		render(<BlocoDeCustos custos={base({ investimentoMetaCents: null })} />);

		expect(screen.getByText("não reportado")).toBeTruthy();
		expect(screen.getByTestId("custos-cpc").textContent).toContain("não calculável");
	});
});
