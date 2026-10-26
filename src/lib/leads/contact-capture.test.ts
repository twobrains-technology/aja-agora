// O QUE `saveContactName` DEVOLVE — e por que isso importa.
//
// P144: a tool `salvar_nome` grava no banco e o turno continua com o contexto
// antigo. Quem chama precisa saber o nome que FICOU gravado (canônico, Title
// Case, primeiro nome) para propagá-lo ao contexto das tools — a
// `fazer_proposta` seguinte imprime "Cliente" a partir dele. Devolver o nome
// cru (o que o modelo digitou) não serve: o documento sairia "bruna".
//
// As fronteiras externas são dubladas (banco, sincronização de contato, fila de
// conversão); a régua do nome é a de produção.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	leadFindFirst: vi.fn(),
	update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
	sincronizarNomeDoContato: vi.fn(async () => null),
}));

vi.mock("@/db", () => ({
	db: { update: mocks.update, query: { leads: { findFirst: mocks.leadFindFirst } } },
}));
vi.mock("@/lib/contacts/sincronizar-nome", () => ({
	sincronizarNomeDoContato: mocks.sincronizarNomeDoContato,
}));
vi.mock("@/lib/conversions/registry", () => ({ registrarLeadIdentificado: vi.fn() }));

import { saveContactName } from "./contact-capture";

beforeEach(() => {
	mocks.update.mockClear();
	mocks.leadFindFirst.mockResolvedValue({ id: "lead-1", phone: null, name: null });
});

describe("P144 — o resultado do nome leva o que ficou GRAVADO", () => {
	it.each([
		{ caso: "nome composto: grava o primeiro nome", entrada: "Bruna Souza", gravado: "Bruna" },
		{ caso: "minúsculo vira Title Case", entrada: "bruna", gravado: "Bruna" },
		{ caso: "caixa alta vira Title Case", entrada: "BRUNA", gravado: "Bruna" },
		{ caso: "acento preservado", entrada: "céSAR", gravado: "César" },
		{ caso: "hífen preservado", entrada: "jean-luc", gravado: "Jean-Luc" },
		{ caso: "espaços em volta são descartados", entrada: "  bruna  ", gravado: "Bruna" },
	])("$caso", async ({ entrada, gravado }) => {
		const resultado = await saveContactName("conv-nome", entrada, { ancorarEm: entrada });

		expect(resultado).toMatchObject({ ok: true, leadId: "lead-1", name: gravado });
		// O nome canônico é o mesmo que vai para as três casas do contato.
		expect(mocks.sincronizarNomeDoContato).toHaveBeenCalledWith({
			conversationId: "conv-nome",
			nome: gravado,
		});
	});

	it("nome que não foi dito nesta fala não grava e não devolve nome", async () => {
		const resultado = await saveContactName("conv-nome", "Bruna", { ancorarEm: "pode fechar" });

		expect(resultado).toEqual({ ok: false, error: "nao_ancorado" });
		expect(mocks.update).not.toHaveBeenCalled();
	});
});
