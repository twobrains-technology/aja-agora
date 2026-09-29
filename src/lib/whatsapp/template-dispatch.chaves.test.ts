// FIX-388 — o dispatcher percorre a LISTA de chaves candidatas.
//
// Regra dura do PRD: nenhum texto de comunicação vira texto fixo no servidor. A
// função PURA do motor não decide se o template existe/aprovado — ela devolve a
// lista ordenada (`[fase+bem, genérico da fase]`). Quem pergunta à Meta e
// escolhe é o dispatcher, e a escolha é esta função — pura, testável sem banco.
//
// O que se prova aqui é o lado que NÃO pode falhar em silêncio: quando nenhuma
// chave está aprovada, a linha é ENFILEIRADA com a chave mais específica (a
// primeira candidata), e não some.

import { describe, expect, it } from "vitest";
import { escolherChave } from "./template-dispatch";

const aprovado = (...chaves: string[]) => {
	const conjunto = new Set(chaves);
	return (usageKey: string) => (conjunto.has(usageKey) ? "APPROVED" : null);
};

describe("FIX-388 — escolherChave: a primeira aprovada vence, senão enfileira", () => {
	it("fase+bem aprovado escolhe o específico (antes do genérico)", () => {
		expect(
			escolherChave(
				["remarketing_inicio_moto", "remarketing_inicio_generico"],
				aprovado("remarketing_inicio_moto", "remarketing_inicio_generico"),
			),
		).toEqual({ canal: "aprovado", usageKey: "remarketing_inicio_moto" });
	});

	it("sem o do bem, cai no genérico da fase", () => {
		expect(
			escolherChave(
				["remarketing_inicio_moto", "remarketing_inicio_generico"],
				aprovado("remarketing_inicio_generico"),
			),
		).toEqual({ canal: "aprovado", usageKey: "remarketing_inicio_generico" });
	});

	it("nenhum aprovado → enfileira a PRIMEIRA candidata (nunca o silêncio)", () => {
		// A primeira é a mais específica: é ela que o dono vai cadastrar primeiro.
		expect(
			escolherChave(
				["remarketing_fechamento_carro", "remarketing_fechamento_generico"],
				() => null,
			),
		).toEqual({ canal: "enfileirar", usageKey: "remarketing_fechamento_carro" });
	});

	it("PENDING e DRAFT não são aprovação — vão para a fila igual", () => {
		expect(
			escolherChave(
				["remarketing_viu_oferta_imovel", "remarketing_viu_oferta_generico"],
				() => "PENDING",
			),
		).toEqual({ canal: "enfileirar", usageKey: "remarketing_viu_oferta_imovel" });
	});

	it("lista de uma só chave (bem desconhecido) → o genérico, ou a fila com ele", () => {
		expect(
			escolherChave(["remarketing_inicio_generico"], aprovado("remarketing_inicio_generico")),
		).toEqual({
			canal: "aprovado",
			usageKey: "remarketing_inicio_generico",
		});
		expect(escolherChave(["remarketing_inicio_generico"], () => null)).toEqual({
			canal: "enfileirar",
			usageKey: "remarketing_inicio_generico",
		});
	});

	it("lista vazia é erro de programação, não um 'nada' silencioso", () => {
		expect(() => escolherChave([], () => "APPROVED")).toThrow(/lista de chaves/i);
	});
});
