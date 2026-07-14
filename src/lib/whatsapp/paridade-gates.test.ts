import { describe, expect, it } from "vitest";
import { gateQuestion } from "@/lib/agent/orchestrator/gate-questions";
import type { Gate } from "@/lib/agent/qualify-state";
import { WHATSAPP_INTERACTIVE_GATES, WHATSAPP_TEXT_GATES } from "./adapter";

// ============================================================================
// PARIDADE WEB ↔ WHATSAPP — todo gate que PERGUNTA na web tem que perguntar no
// WhatsApp também.
// ----------------------------------------------------------------------------
// Bug achado no QA ao vivo (2026-07-14, canal WhatsApp): o gate `desire` não era
// entregue. Ele não tinha botão (gateInteractive → null) e não estava na lista de
// gates de texto — então a pergunta "Qual moto você tem em mente?" NUNCA saía.
// Na prática:
//
//   USUÁRIO: sou o Mario
//   AGENTE:  Prazer, Mario.        ← e nada mais. Turno morto.
//   USUÁRIO: uma CG 160            ← o usuário teve que adivinhar o que dizer
//
// O directive do primeiro contato ainda instrui o modelo a "parar após a saudação
// — o sistema pergunta o próximo passo em seguida". Só que no WhatsApp o sistema
// NÃO perguntava. A web entregava; o WhatsApp comia a pergunta.
//
// Este teste não checa UM gate: checa o INVARIANTE. Qualquer gate novo que tenha
// pergunta e for esquecido no WhatsApp quebra aqui.
// ============================================================================

const CATEGORIA = "moto" as const;

/** Todos os gates do funil que têm pergunta própria na web. */
const GATES: Gate[] = [
	"name",
	"desire",
	"experience",
	"credit",
	"identify",
	"reco-consent",
	"timeframe",
	"lance",
	"lance-value",
	"lance-embutido",
	"simulator-offer",
];

describe("paridade web ↔ WhatsApp — nenhum gate perde a pergunta", () => {
	for (const gate of GATES) {
		const perguntaNaWeb = gateQuestion(gate, CATEGORIA, undefined, "web");
		if (!perguntaNaWeb) continue; // gate sem pergunta própria (ex.: "name") — nada a entregar

		it(`gate "${gate}": tem pergunta na web, logo o WhatsApp precisa entregá-la (botão ou texto)`, () => {
			const entregueNoWhatsapp =
				WHATSAPP_INTERACTIVE_GATES.has(gate) || WHATSAPP_TEXT_GATES.has(gate);
			expect(
				entregueNoWhatsapp,
				`O gate "${gate}" pergunta na web ("${perguntaNaWeb}") mas o WhatsApp não entrega ` +
					`nem botão nem texto — a pergunta some e o usuário fica sem saber o que responder. ` +
					`Adicione o gate a WHATSAPP_TEXT_GATES (ou dê um interactive a ele).`,
			).toBe(true);
		});
	}
});
