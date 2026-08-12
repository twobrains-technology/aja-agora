// Produção, 2026-08 — "A moto é sua!" numa conversa com `bevi_proposals = 0`.
//
// Nada foi contratado, nenhuma proposta existe na Bevi, e o cliente leu que o
// bem já é dele. É a mesma promessa que o invariante #9 proíbe ("cota
// reservada", "você já está no grupo"), só que dita pelo lado do BEM em vez do
// lado da cota — e por isso escapava inteira do guard.
//
// A ancoragem em estado que já existe é a peça certa e é preservada: com
// proposta real criada (`hasProposal`) ou contrato fechado, comemorar é VERDADE
// e o guard sai da frente. O que não pode é a comemoração vir antes do fato.

import { describe, expect, it } from "vitest";
import { isPrematureReservationClaim } from "@/lib/agent/orchestrator/sanitizer";

const base = { hasReceivedDocuments: false, hasSearchToolCall: true };
const semProposta = { ...base, hasProposal: false, contractClosed: false };
const comProposta = { ...base, hasProposal: true, contractClosed: false };

describe("posse do bem antes da proposta", () => {
	it("dropa a frase literal de produção", () => {
		expect(isPrematureReservationClaim("A moto é sua!", semProposta)).toBe(true);
	});

	it("dropa a mesma promessa em qualquer bem", () => {
		for (const s of [
			"O carro é seu!",
			"A casa é sua!",
			"O imóvel é seu, parabéns!",
			"O apartamento já é seu.",
			"Pronto, a moto é sua!",
		]) {
			expect(isPrematureReservationClaim(s, semProposta), s).toBe(true);
		}
	});

	it("com proposta real, comemorar é verdade e passa", () => {
		expect(isPrematureReservationClaim("A moto é sua!", comProposta)).toBe(false);
		expect(
			isPrematureReservationClaim("O carro é seu!", { ...semProposta, contractClosed: true }),
		).toBe(false);
	});

	it("não confunde com fala legítima sobre a escolha ainda por fazer", () => {
		for (const s of [
			"A escolha é sua, não tem certo ou errado.",
			"A decisão é sua.",
			"Qual é a moto que você quer?",
			"Essa moto custa R$ 18.000.",
			"O carro dos seus sonhos está mais perto.",
		]) {
			expect(isPrematureReservationClaim(s, semProposta), s).toBe(false);
		}
	});
});
