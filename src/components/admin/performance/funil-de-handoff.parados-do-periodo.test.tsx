// @vitest-environment happy-dom
/**
 * O RÓTULO DOS PARADOS diz de QUAL população ele fala (D10, 02/10/2026).
 *
 * Todos os blocos da Performance aplicam o período, menos este — ele lia a lista
 * global, e com o filtro em "Hoje" pintava 30 dias com o rótulo do dia. Depois
 * da correção a lista é a DO PERÍODO (lead criado na janela e sem toque há mais
 * de `limiteHoras`), e o rótulo tem que dizer isso por escrito: o número sozinho
 * não denuncia de onde ele veio, e é assim que a tela passa a mentir sem ninguém
 * perceber.
 *
 * O que o teste trava, portanto, é a FRASE — e que ela aponta para onde a lista
 * global foi (Remarketing, "Parados — todos os períodos"), senão quem opera
 * perde o acesso ao bolo inteiro.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { FunilDeHandoff } from "@/lib/admin/handoff-queries";
import { FunilDeHandoffCard } from "./funil-de-handoff";

afterEach(cleanup);

const HANDOFF: FunilDeHandoff = {
	etapas: [],
	parados: [
		{
			leadId: "00000000-0000-4000-8000-000000000001",
			nome: "Cliente Parado",
			telefone: "11999998888",
			estagio: "proposta_enviada",
			desdeISO: "2026-09-20T12:00:00.000Z",
			horasParado: 240,
			slaAlertadoEm: null,
		},
	],
	limiteHoras: 24,
	amostraSuficiente: true,
};

describe("o bloco dos parados na Performance", () => {
	it("diz no título que a lista é a DO PERÍODO, e não a global", () => {
		render(<FunilDeHandoffCard handoff={HANDOFF} />);

		expect(screen.getByText(/Parados há mais de 24h no período/)).toBeTruthy();
		expect(screen.getByText(/\(1\)/)).toBeTruthy();
	});

	it("explica a população e manda quem quer todos os períodos para o Remarketing", () => {
		render(<FunilDeHandoffCard handoff={HANDOFF} />);

		expect(screen.getByText(/criado no período/)).toBeTruthy();
		expect(screen.getByText(/Parados — todos os períodos/)).toBeTruthy();
	});
});
