/**
 * O fato que faltava na janela do WhatsApp: "isto ainda NÃO aconteceu".
 *
 * Entre "formulário de contratação despachado" e "contrato fechado" existe um
 * intervalo em que nenhuma proposta existe na administradora. Na WEB o modelo
 * recebia isso escrito (`blocoFormularioAberto`, converse.ts) e não anunciava
 * fecho. No WHATSAPP a condição era `state.channel === "web"` — o bloco nunca
 * armava, e nesse intervalo o modelo ficava sem nenhum fato negativo na janela.
 *
 * Foi nesse buraco que a conversa `fd76e393` terminou (prod, 16/08/2026
 * 19:24:10): o cliente escreveu "fecha a proposta" e o agente respondeu
 * "Pronto, Kairo! Sua proposta está fechada com a cota do Banco do Brasil,
 * R$ 1.031.904 de crédito" — com `bevi_proposals = 0`.
 *
 * Repare no que este bloco NÃO é: não é um filtro que apaga a frase. A MESMA
 * frase é legítima quando `contractClosed` for true — e aí o bloco some sozinho.
 * O que muda é o que o modelo SABE, não o que ele pode dizer. Guard de fala por
 * regex é o anti-padrão revertido em `649320dc`, e não devolveria a proposta
 * ao cliente de jeito nenhum.
 */

import { describe, expect, it } from "vitest";
import { blocoDeFechoPendente } from "./fecho-pendente";

describe("fecho pendente — o fato negativo entra na janela nos DOIS canais", () => {
	it("WhatsApp com formulário despachado e contrato não fechado: o fato entra", () => {
		const bloco = blocoDeFechoPendente({
			channel: "whatsapp",
			contractFormDispatched: true,
			contractClosed: false,
		});
		expect(bloco).toBeTruthy();
		expect(bloco).toMatch(/ainda NÃO aconteceu/i);
		expect(bloco).toMatch(/proposta/i);
	});

	it("web continua com o bloco que já tinha", () => {
		const bloco = blocoDeFechoPendente({
			channel: "web",
			contractFormDispatched: true,
			contractClosed: false,
		});
		expect(bloco).toBeTruthy();
		expect(bloco).toMatch(/ainda NÃO aconteceu/i);
	});

	it("no WhatsApp o texto não fala de tela — lá não existe formulário nem botão", () => {
		const bloco = blocoDeFechoPendente({
			channel: "whatsapp",
			contractFormDispatched: true,
			contractClosed: false,
		});
		expect(bloco).not.toMatch(/formul[áa]rio|bot[ãa]o|campo|tela/i);
	});

	it("contrato FECHADO desarma o bloco — a mesma fala vira legítima", () => {
		for (const channel of ["web", "whatsapp"] as const) {
			expect(
				blocoDeFechoPendente({
					channel,
					contractFormDispatched: true,
					contractClosed: true,
				}),
			).toBeNull();
		}
	});

	it("antes do formulário não arma — não há fecho pendente para negar", () => {
		expect(
			blocoDeFechoPendente({
				channel: "whatsapp",
				contractFormDispatched: false,
				contractClosed: false,
			}),
		).toBeNull();
	});
});
