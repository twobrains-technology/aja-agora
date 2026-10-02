// @vitest-environment happy-dom
/**
 * O BLOCO "PARADOS — TODOS OS PERÍODOS" (D10, 02/10/2026).
 *
 * A lista global saiu da Performance: lá o bloco passou a ser a população DO
 * período (quem nasceu na janela e está sem toque além do limite), porque com o
 * filtro em "Hoje" ele listava gente de julho com o rótulo do dia. Aqui ela
 * continua inteira — a pergunta da régua é "quem a mesa precisa ligar agora",
 * sem recorte de data.
 *
 * O que este arquivo trava: o título DIZ que é de todos os períodos (o número
 * sozinho não denuncia de onde veio), a contagem aparece com o plural certo, e a
 * lista traz nome, telefone, estágio por extenso e há quanto tempo — uma lista
 * de UUIDs não faz ninguém ligar para ninguém.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { LeadParado } from "@/lib/admin/handoff-queries";
import { BlocoDosParados } from "./page";

afterEach(cleanup);

function parado(over: Partial<LeadParado> = {}): LeadParado {
	return {
		leadId: "00000000-0000-4000-8000-00000000000a",
		nome: "Cliente Esquecido",
		telefone: "11912345678",
		estagio: "proposta_enviada",
		desdeISO: "2026-09-01T12:00:00.000Z",
		horasParado: 312,
		slaAlertadoEm: null,
		...over,
	};
}

describe("os parados de todos os períodos, na régua", () => {
	it("diz no título que a lista é de TODOS os períodos", () => {
		render(<BlocoDosParados parados={[parado()]} limiteHoras={24} />);

		expect(screen.getByText("Parados — todos os períodos")).toBeTruthy();
		expect(screen.getByText("1 lead parado")).toBeTruthy();
		expect(screen.getByText(/sem toque há mais de 24h/)).toBeTruthy();
	});

	it("mostra nome, telefone, estágio por extenso e há quanto tempo", () => {
		render(<BlocoDosParados parados={[parado()]} limiteHoras={24} />);

		// 312 h é "13d" para o leitor — "312h" ninguém lê como 13 dias.
		expect(screen.getByText("Cliente Esquecido")).toBeTruthy();
		expect(screen.getByText("11912345678")).toBeTruthy();
		expect(screen.getByText(/Proposta Enviada · há 13d/)).toBeTruthy();
	});

	it("soma a contagem e mantém a lista vazia declarada, não muda", () => {
		render(<BlocoDosParados parados={[parado(), parado({ leadId: "b" })]} limiteHoras={24} />);
		expect(screen.getByText("2 leads parados")).toBeTruthy();

		cleanup();
		render(<BlocoDosParados parados={[]} limiteHoras={24} />);
		expect(screen.getByText("0 leads parados")).toBeTruthy();
		expect(screen.getByText("Ninguém parado além do limite. É o estado que se quer.")).toBeTruthy();
	});
});