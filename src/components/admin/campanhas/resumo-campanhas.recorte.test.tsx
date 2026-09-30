// @vitest-environment happy-dom
/**
 * O resumo de Campanhas com o RECORTE por braço ativo (D6).
 *
 * Mesma regra do bloco de custos da Performance: a verba da Meta é do período
 * inteiro e não se divide por braço. Com a flag ligada a tela escreve a frase e
 * não afirma cifra nenhuma — o investimento reportado e o atribuído chegam
 * `null`, e `null` é "não aplicável ao recorte", nunca "R$ 0,00".
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FRASE_CUSTO_NAO_APLICAVEL } from "@/components/admin/dashboard/filtro-ab";
import type { TotaisDeCampanhas } from "@/lib/admin/campanhas-queries";
import { ResumoCampanhas } from "./resumo-campanhas";

afterEach(cleanup);

/** O recorte ativo: verba e custo por qualificado vêm `null` da rota. */
function totais(parcial: Partial<TotaisDeCampanhas> = {}): TotaisDeCampanhas {
	return {
		investimentoCents: null,
		investimentoAtribuidoCents: null,
		investimentoSemAtribuicaoCents: null,
		leadsMeta: 20,
		leadsCrm: 12,
		comTelefone: 31,
		conversas: 31,
		qualificados: 5,
		propostas: 4,
		fechados: 1,
		custoPorQualificado: null,
		...parcial,
	};
}

describe("ResumoCampanhas — recorte por braço ativo", () => {
	it("escreve a frase de D6 e não mostra nenhum R$", () => {
		const { container } = render(<ResumoCampanhas totais={totais()} custoNaoAplicavelAoRecorte />);

		expect(screen.getByTestId("custo-nao-aplicavel-ao-recorte").textContent).toBe(
			FRASE_CUSTO_NAO_APLICAVEL,
		);
		expect(container.textContent ?? "").not.toContain("R$");
	});

	it("os números que NÃO dependem de verba continuam na tela", () => {
		render(<ResumoCampanhas totais={totais()} custoNaoAplicavelAoRecorte />);

		expect(screen.getByText("Qualificados no CRM")).toBeTruthy();
		// O bloco de leads do CRM (o que decide) segue visível.
		expect(screen.getByText("Leads no CRM")).toBeTruthy();
	});
});
