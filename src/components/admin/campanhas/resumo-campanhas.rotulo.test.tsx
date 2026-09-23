// @vitest-environment happy-dom
// O rodapé de Campanhas — os DOIS números de contato, cada um com o seu nome.
//
// A cliente mandou por WhatsApp: *"3.346 chegaram"* — e o número não fechava com
// nada. A causa era o predicado de "identificado", que media o canal (ou, na
// tentativa seguinte, pedia o nome do perfil); a regra do dono passou a ser do
// CANAL — "whatsapp entrou já pode considerar que se identificou, já na web,
// quando conseguirmos coletar" — e um número que muda sem explicação na tela vira
// a próxima dúvida. Por isso os dois aparecem juntos: quem se identificou e quem
// a régua consegue alcançar.
//
// Este teste é a rede contra o rótulo voltar a afirmar "contato deixado" — que
// era falso justamente para o canal de onde veio a pergunta.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { TotaisDeCampanhas } from "@/lib/admin/campanhas-queries";
import { ResumoCampanhas } from "./resumo-campanhas";

afterEach(cleanup);

function totais(parcial: Partial<TotaisDeCampanhas> = {}): TotaisDeCampanhas {
	return {
		investimentoCents: 100_000,
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

describe("ResumoCampanhas", () => {
	it("mostra o número dos identificados, com a regra por canal", () => {
		render(<ResumoCampanhas totais={totais()} />);

		expect(screen.getByText("Leads no CRM")).toBeDefined();
		expect(screen.getByText("12")).toBeDefined();
		expect(screen.getByText(/Conversas em que o cliente se identificou/)).toBeDefined();
		expect(screen.getByText(/no WhatsApp, quem entrou/)).toBeDefined();
	});

	it("mostra o contato conhecido à parte, sem chamá-lo de identificado", () => {
		render(<ResumoCampanhas totais={totais()} />);

		expect(screen.getByText(/Com telefone ou e-mail conhecido/)).toBeDefined();
		expect(screen.getByText("31")).toBeDefined();
	});

	it("não afirma mais que o contato foi 'deixado' — era falso para o WhatsApp", () => {
		render(<ResumoCampanhas totais={totais()} />);

		expect(screen.queryByText(/contato deixado/)).toBeNull();
	});

	it("o cartão de qualificados nomeia a unidade das propostas", () => {
		render(<ResumoCampanhas totais={totais()} />);

		expect(screen.getByText(/propostas criadas/)).toBeDefined();
	});
});
