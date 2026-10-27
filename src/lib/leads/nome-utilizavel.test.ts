// `nomeUtilizavel` — o nome GRAVADO serve para chamar a pessoa?
//
// O defeito medido na conversa web `1a4927bd-78a9-4fa0-9510-9550a7b583c5`
// (27/10/2026 20:50:20): o agente respondeu "Obrigado, Cliente." e o
// `conversations.contact_name` daquela conversa era NULO — o vocativo foi inventado.
// Do lado do servidor, a mesma invenção nascia em `route.ts`:
// `conv.contactName ?? "Cliente"`. Aqui ficam as duas metades da régua: a pessoa
// não é "Cliente", "Comprador" nem "Interessado", e nome nenhum é um nome.
import { describe, expect, it } from "vitest";
import { nomeUtilizavel } from "./nome-plausivel";

describe("o nome do contato só é usado quando é nome de gente", () => {
	it.each(["Cliente", "cliente", "Comprador", "Interessado", "interessado"])(
		"não usa o rótulo que o sistema (ou o modelo) deu à pessoa: %s",
		(rotulo) => {
			expect(nomeUtilizavel(rotulo)).toBeNull();
		},
	);

	it("sem nome gravado não há nome — null, nunca um placeholder", () => {
		expect(nomeUtilizavel(null)).toBeNull();
		expect(nomeUtilizavel(undefined)).toBeNull();
		expect(nomeUtilizavel("")).toBeNull();
		expect(nomeUtilizavel("   ")).toBeNull();
	});

	it("nome de gente passa como está", () => {
		for (const nome of ["Bruna", "Kairo", "Ana Clara", "D'Ávila", "Jean-Luc"]) {
			expect(nomeUtilizavel(nome), nome).toBe(nome);
		}
	});

	it("palavra que nunca é nome continua barrada pela régua de forma", () => {
		expect(nomeUtilizavel("Voltei")).toBeNull();
		expect(nomeUtilizavel("Obrigado")).toBeNull();
	});
});
