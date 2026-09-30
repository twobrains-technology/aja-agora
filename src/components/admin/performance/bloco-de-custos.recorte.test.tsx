// @vitest-environment happy-dom
/**
 * O bloco de custos com o RECORTE por braço ativo (D6).
 *
 * O gasto da Meta é do PERÍODO INTEIRO — não existe coluna de braço em
 * `meta_insights_diarios` — então, com o recorte ligado, a tela não pode
 * dividir verba por braço. Ela declara isso e **não mostra cifra nenhuma**:
 * nem investimento, nem custo de IA/mensagem em reais, nem CPC. Um "R$ 0,00" ou
 * um CPC falso ao lado de um funil recortado convidaria exatamente à conta que
 * não se pode fazer.
 *
 * O teste afirma o CONTRATO (a frase e a ausência de "R$"), não a classe CSS.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FRASE_CUSTO_NAO_APLICAVEL } from "@/components/admin/dashboard/filtro-ab";
import type { CustosDoCpc } from "@/lib/admin/performance-types";
import { BlocoDeCustos } from "./bloco-de-custos";

afterEach(cleanup);

/** O recorte ativo: `investimentoMetaCents` sai `null` e a flag sai `true`. */
const comRecorte = (over: Partial<CustosDoCpc> = {}): CustosDoCpc => ({
	investimentoMetaCents: null,
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
	custoNaoAplicavelAoRecorte: true,
	...over,
});

describe("BlocoDeCustos — recorte por braço ativo", () => {
	it("escreve a frase de D6 e NÃO mostra nenhum valor em reais", () => {
		const { container } = render(<BlocoDeCustos custos={comRecorte()} />);

		expect(screen.getByTestId("custo-nao-aplicavel-ao-recorte").textContent).toBe(
			FRASE_CUSTO_NAO_APLICAVEL,
		);
		expect(container.textContent ?? "").not.toContain("R$");
		// O número absoluto de reais também não pode escapar como texto solto.
		expect(container.textContent ?? "").not.toContain("100,00");
	});

	it("o funil segue visível — o recorte não some com a contagem", () => {
		render(<BlocoDeCustos custos={comRecorte()} />);

		expect(screen.getByText("Conversas / qualificados")).toBeTruthy();
		expect(screen.getByText("5 / 10")).toBeTruthy();
	});

	it("sem recorte, a frase NÃO aparece e o CPC volta a ser número (C4)", () => {
		const { container } = render(
			<BlocoDeCustos
				custos={comRecorte({ investimentoMetaCents: 100_000, custoNaoAplicavelAoRecorte: false })}
			/>,
		);

		expect(screen.queryByTestId("custo-nao-aplicavel-ao-recorte")).toBeNull();
		expect(container.textContent ?? "").toContain("R$");
	});
});
