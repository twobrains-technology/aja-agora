// @vitest-environment happy-dom
// O investimento OFICIAL tem nome — e a diferença com o CRM tem vizinhança.
//
// A cliente comparava o número da tela com o gerenciador, via outro valor e
// concluía que o painel estava errado. O dono decidiu (28/09): a leitura oficial
// é **a reportada pela Meta**. Esta tela passa a dizer isso no rótulo, mostra o
// atribuído no CRM ao lado e explica a diferença em reais — reusando a mesma
// linguagem de `explicarDiferenca`, que já nomeia a divergência de leads.
//
// NENHUMA soma muda aqui: o total exibido continua sendo o reportado pela Meta.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { TotaisDeCampanhas } from "@/lib/admin/campanhas-queries";
import { ResumoCampanhas } from "./resumo-campanhas";

afterEach(cleanup);

function totais(parcial: Partial<TotaisDeCampanhas> = {}): TotaisDeCampanhas {
	return {
		investimentoCents: 100_000,
		investimentoAtribuidoCents: 70_000,
		investimentoSemAtribuicaoCents: 30_000,
		leadsMeta: 20,
		leadsCrm: 12,
		comTelefone: 31,
		conversas: 31,
		qualificados: 5,
		propostas: 4,
		fechados: 1,
		custoPorQualificado: { tipo: "valor", centavos: 20_000 },
		...parcial,
	};
}

describe("ResumoCampanhas — o investimento oficial", () => {
	it("dá nome à leitura oficial: reportado pela Meta", () => {
		render(<ResumoCampanhas totais={totais()} />);

		expect(screen.getByText("Investimento reportado pela Meta")).toBeDefined();
		// O rótulo antigo — que não dizia de quem era o número — sai de cena.
		expect(screen.queryByText("Investimento no período")).toBeNull();
		// O valor é o total reportado, não o atribuído.
		expect(screen.getByText("R$ 1.000,00")).toBeDefined();
	});

	it("mostra o atribuído no CRM como linha vizinha, na mesma moeda", () => {
		render(<ResumoCampanhas totais={totais()} />);

		expect(screen.getByText(/Investimento atribuído no CRM/)).toBeDefined();
		expect(screen.getByText("R$ 700,00")).toBeDefined();
	});

	it("explica a diferença em reais, com os dois motivos (sem atribuição × janela de data)", () => {
		render(<ResumoCampanhas totais={totais()} />);

		const frase = screen.getByText(/campanha sem atribuição no CRM/).textContent ?? "";
		expect(frase).toContain("R$\u00a0300,00");
		expect(frase).toContain("janela de data");
	});

	it("sem investimento no período, diz a ausência — nunca 'bateram'", () => {
		render(
			<ResumoCampanhas
				totais={totais({
					investimentoCents: 0,
					investimentoAtribuidoCents: 0,
					investimentoSemAtribuicaoCents: 0,
					custoPorQualificado: { tipo: "motivo", motivo: "sem_gasto" },
				})}
			/>,
		);

		expect(screen.getByText(/Sem investimento reportado no período/)).toBeDefined();
		expect(screen.queryByText(/As duas leituras bateram/)).toBeNull();
	});

	it("quando as duas leituras batem, diz que bateram — e que isso não as iguala", () => {
		render(
			<ResumoCampanhas
				totais={totais({
					investimentoCents: 50_000,
					investimentoAtribuidoCents: 50_000,
					investimentoSemAtribuicaoCents: 0,
				})}
			/>,
		);

		expect(screen.getByText(/As duas leituras bateram/)).toBeDefined();
		// As duas leituras mostram o mesmo valor — e a frase diz que isso não as iguala.
		expect(screen.getAllByText("R$ 500,00")).toHaveLength(2);
	});
});
