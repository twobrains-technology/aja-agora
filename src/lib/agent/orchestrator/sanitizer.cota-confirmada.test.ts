// Produção, WEB, 2026-08-13 13:18:58 — sessão `8e28d6f0` ("Paulo", imóvel de
// R$ 500 mil). O cliente disse "sim" ao pré-cadastro e leu:
//
//     "Pronto, Paulo! Sua cota está confirmada. Agora o formulário de
//      pré-cadastro vai aparecer pra você…"
//
// A cota NÃO estava confirmada: o formulário ainda ia aparecer, nenhuma
// proposta existia na administradora. É o invariante #9 (não prometer reserva
// antes da contratação) escapando pela PARÁFRASE — o guard reconhecia
// "reservada" e "garantida", e o modelo escreveu "confirmada".
//
// Por que estender a lista aqui NÃO é o anti-padrão que o CLAUDE.md proíbe: o
// próprio CLAUDE.md cita `isPrematureReservationClaim` como o exemplo do guard
// legítimo, porque ele é **ancorado num fato do servidor** — a MESMA frase
// passa quando a proposta existe (`hasProposal`). Não é blocklist de fala; é
// contradição verificável entre o que foi dito e o que o sistema fez.
import { describe, expect, it } from "vitest";
import { isPrematureReservationClaim } from "./sanitizer";

const SEM_PROPOSTA = {
	hasProposal: false,
	contractClosed: false,
	hasReceivedDocuments: false,
	hasSearchToolCall: true,
};
const COM_PROPOSTA = { ...SEM_PROPOSTA, hasProposal: true };

describe("cota 'confirmada' antes de existir proposta", () => {
	it("pega a frase exata que saiu em produção", () => {
		expect(
			isPrematureReservationClaim("Pronto, Paulo! Sua cota está confirmada.", SEM_PROPOSTA),
		).toBe(true);
	});

	it("as formas já conhecidas continuam pegando", () => {
		expect(isPrematureReservationClaim("Sua cota está reservada.", SEM_PROPOSTA)).toBe(true);
		expect(isPrematureReservationClaim("Sua cota está garantida.", SEM_PROPOSTA)).toBe(true);
	});

	// A âncora é o ESTADO: com proposta real criada, a mesma frase é verdade e
	// tem de passar. É isso que separa este guard de uma lista de frases feias.
	it("COM proposta criada, a mesma frase passa", () => {
		expect(isPrematureReservationClaim("Pronto! Sua cota está confirmada.", COM_PROPOSTA)).toBe(
			false,
		);
	});

	// Não pode virar rede de arrasto: confirmar OUTRA coisa é fala legítima.
	it("confirmar dado do cliente não é reserva de cota", () => {
		expect(
			isPrematureReservationClaim("Seu telefone está confirmado, obrigado.", SEM_PROPOSTA),
		).toBe(false);
		expect(isPrematureReservationClaim("Confirmado, é esse valor mesmo.", SEM_PROPOSTA)).toBe(
			false,
		);
	});
});
