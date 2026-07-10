// FIX-258 (P1, veredito Fable r4: FIX-252 "NÃO" — a rota nome/valor→grupo só
// corrigia a âncora PÓS-simulação; o modo de falha real acontecia ANTES: o
// usuário nomeia "a ITAÚ"/"a de 92 mil" (visível na comparison_table) e a LLM
// adivinha/erra o grupo ou tenta re-buscar com um sentinela — alimentando a
// espiral de negação do FIX-257).
//
// `buildMentionedOfferDirective` é a peça NOVA: transforma o resultado de
// `resolveOfferByMention` (já existente, choose-offer.ts) numa diretiva
// ACIONÁVEL pra injetar no prompt ANTES da LLM decidir — ela usa o groupId
// LITERAL da cota já exibida, nunca re-busca/inventa/nega.
import { describe, expect, it } from "vitest";
import { buildMentionedOfferDirective, type ChosenOffer } from "./choose-offer";

describe("FIX-258 — buildMentionedOfferDirective (rota determinística ANTES da tool-call)", () => {
	it("nomeia o groupId LITERAL + administradora + valor pra LLM usar direto (nunca re-buscar)", () => {
		const offer: ChosenOffer = {
			groupId: "6a0ca9c73e68cce9b61d30fd",
			administradora: "ITAÚ",
			creditValue: 92902,
			termMonths: 51,
			monthlyPayment: 2182.01,
		};
		const directive = buildMentionedOfferDirective(offer);
		expect(directive).toContain("6a0ca9c73e68cce9b61d30fd");
		expect(directive).toContain("ITAÚ");
		expect(directive).toMatch(/92\.902/);
		expect(directive).toMatch(/liter/i);
		expect(directive).toMatch(/n[aã]o.*(re-?busque|busque de novo|search_groups)/i);
		expect(directive).toMatch(/n[aã]o.*negue|nunca negue/i);
	});

	it("funciona mesmo sem creditValue/termMonths (offer parcial — nunca quebra)", () => {
		const offer: ChosenOffer = { groupId: "abc123" };
		const directive = buildMentionedOfferDirective(offer);
		expect(directive).toContain("abc123");
	});
});
