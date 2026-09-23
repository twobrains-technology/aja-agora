/**
 * O FILTRO QUE TIRA A CASA DA CAMPANINHA DO SLA.
 *
 * ── O defeito que isto tranca (medido em 23/09/2026) ────────────────────────
 *
 * O dono testou o fluxo com o próprio celular. Como o teste rodou em WhatsApp
 * real, o lead nasceu `is_simulated = false` e passou pelo filtro da consulta:
 * a atendente assumiu a conversa, a campainha tocou e o e-mail do SLA acusou
 * "lead parado" que era teste de casa. A cliente viu o e-mail e perguntou por
 * quê.
 *
 * A régua de remarketing já tinha a guarda (`ehTelefoneInterno`); este ciclo não
 * tinha. Aqui o filtro é exercitado com o predicado REAL do motor — não com um
 * stub que só repete a expectativa do teste.
 */

import { describe, expect, it } from "vitest";
import { ehTelefoneInterno } from "@/lib/remarketing/motor";
import { type LeadParado, semTelefoneDaEquipe } from "./handoff-queries";

function parado(over: Partial<LeadParado> = {}): LeadParado {
	return {
		leadId: "11111111-1111-1111-1111-111111111111",
		nome: "Marina Alves",
		telefone: null,
		estagio: "qualificado",
		desdeISO: "2026-08-14T12:00:00.000Z",
		horasParado: 401.5,
		slaAlertadoEm: null,
		...over,
	};
}

describe("semTelefoneDaEquipe", () => {
	it("o CLIENTE real continua na lista — a correção não pode zerar o alarme", () => {
		const lista = semTelefoneDaEquipe(
			[parado({ leadId: "cliente", telefone: "11988887777" })],
			ehTelefoneInterno,
		);
		expect(lista.map((p) => p.leadId)).toEqual(["cliente"]);
	});

	it("o TESTE DE CASA sai da lista, com o número no formato do código", () => {
		const lista = semTelefoneDaEquipe(
			[parado({ leadId: "teste", telefone: "556292496793" })],
			ehTelefoneInterno,
		);
		expect(lista).toEqual([]);
	});

	it("sai também no OUTRO formato do mesmo aparelho — a guarda é o nono dígito", () => {
		// A Meta devolve wa_id brasileiro no formato legado, sem o nono dígito, e
		// o web costuma gravar com ele. Comparar string deixaria o mesmo celular
		// entrar por uma das portas.
		const lista = semTelefoneDaEquipe(
			[parado({ leadId: "teste-sem-nono", telefone: "62992496793" })],
			ehTelefoneInterno,
		);
		expect(lista).toEqual([]);
	});

	it("lead SEM telefone não é da equipe — some-lo perderia quem ninguém cadastrou", () => {
		const lista = semTelefoneDaEquipe(
			[parado({ leadId: "sem-fone", telefone: null })],
			ehTelefoneInterno,
		);
		expect(lista.map((p) => p.leadId)).toEqual(["sem-fone"]);
	});

	it("filtra a linha da casa e preserva o cliente na MESMA chamada", () => {
		const lista = semTelefoneDaEquipe(
			[
				parado({ leadId: "teste", telefone: "556292496793" }),
				parado({ leadId: "cliente", telefone: "11988887777" }),
			],
			ehTelefoneInterno,
		);
		expect(lista.map((p) => p.leadId)).toEqual(["cliente"]);
	});
});
