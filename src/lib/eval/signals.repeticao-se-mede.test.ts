/**
 * D2 (PRD 19/08/2026) — REPETIÇÃO SE MEDE, NÃO SE PROÍBE.
 *
 * Turnos 12 e 15 da conversa da Rute: o pedido de CPF e WhatsApp sai duas vezes
 * seguidas, em redação quase idêntica, com o mesmo par de botões. É defeito de
 * fala — e o PRD é explícito sobre o que NÃO fazer com ele: não vira regex, não
 * vira teste de string. Vira número, medido sobre volume, para a rubrica e o
 * painel enxergarem a distribuição.
 *
 * O que se mede aqui é REPETIÇÃO (duas falas do agente quase iguais em
 * sequência), não vocabulário: nenhuma palavra é proibida, nenhuma frase é
 * dropada. É um fato observável do transcript, como `replyRate`.
 */

import { describe, expect, it } from "vitest";
import { computeSignals } from "./signals";

const t = (min: number) => new Date(Date.UTC(2026, 7, 19, 17, min, 0));

function sinaisDe(mensagens: Array<{ role: "user" | "assistant"; content: string }>) {
	return computeSignals({
		metadata: null,
		channel: "web",
		messages: mensagens.map((m, i) => ({ id: `m${i}`, ...m, createdAt: t(i) })),
		artifacts: [],
		lead: null,
		propostas: 0,
	});
}

describe("repetição quase literal do agente vira número", () => {
	it("os turnos 12 e 15 da Rute contam como repetição", () => {
		const s = sinaisDe([
			{
				role: "assistant",
				content:
					"Agora preciso dos seus dados para trazer as ofertas reais das administradoras, CPF e WhatsApp. A administradora exige isso pra liberar o crédito real, e tudo fica protegido pela LGPD.",
			},
			{ role: "user", content: "500 mil desculpe" },
			{
				role: "assistant",
				content:
					"Agora, pra trazer as ofertas reais, preciso do seu CPF e WhatsApp. A administradora exige isso pra liberar o crédito, e tudo fica protegido pela LGPD.",
			},
		]);
		expect(s.repeticoesDoAgente).toBe(1);
	});

	it("conversa que avança não acumula repetição", () => {
		const s = sinaisDe([
			{ role: "assistant", content: "Que ótimo! Imóvel é um dos melhores investimentos." },
			{ role: "user", content: "sim" },
			{ role: "assistant", content: "Qual é o tipo de imóvel que você busca?" },
			{ role: "user", content: "casa" },
			{ role: "assistant", content: "Casa, ótimo! E qual é o valor aproximado dela?" },
		]);
		expect(s.repeticoesDoAgente).toBe(0);
	});

	it("frase curta de cortesia repetida não conta (ruído, não defeito)", () => {
		const s = sinaisDe([
			{ role: "assistant", content: "Perfeito!" },
			{ role: "user", content: "ok" },
			{ role: "assistant", content: "Perfeito!" },
		]);
		expect(s.repeticoesDoAgente).toBe(0);
	});
});
