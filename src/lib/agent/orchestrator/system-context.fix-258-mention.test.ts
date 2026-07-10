// FIX-258 — `buildSystemContext` ganha o parâmetro `mentionedOffer`: quando o
// texto do turno resolveu deterministicamente pra uma cota JÁ EXIBIDA
// (resolveOfferMentionForConversation, choose-offer.ts), a diretiva entra no
// prompt do turno ANTES da LLM decidir — nunca depende dela adivinhar.
import { describe, expect, it } from "vitest";
import type { ChosenOffer } from "./choose-offer";
import { buildSystemContext } from "./system-context";

describe("FIX-258 — buildSystemContext injeta diretiva de oferta mencionada", () => {
	it("sem mentionedOffer (ou null) NÃO adiciona nada — comportamento anterior intacto", () => {
		const out = buildSystemContext({ knownName: null, newlyExtractedExperience: null, meta: {} });
		expect(out.find((m) => /groupId/.test(m.content))).toBeUndefined();
	});

	it("com mentionedOffer, adiciona um system block citando o groupId literal", () => {
		const mentionedOffer: ChosenOffer = { groupId: "6a0ca9c7", administradora: "ITAÚ", creditValue: 92902 };
		const out = buildSystemContext({
			knownName: null,
			newlyExtractedExperience: null,
			meta: {},
			mentionedOffer,
		});
		const block = out.find((m) => m.content.includes("6a0ca9c7"));
		expect(block).toBeDefined();
		expect(block?.role).toBe("system");
	});

	it("convive com os outros blocos (knownName + experience) sem sobrescrever", () => {
		const mentionedOffer: ChosenOffer = { groupId: "xyz" };
		const out = buildSystemContext({
			knownName: "Mario",
			newlyExtractedExperience: "first",
			meta: {},
			mentionedOffer,
		});
		expect(out.some((m) => m.content.includes("Mario"))).toBe(true);
		expect(out.some((m) => m.content.includes("PRIMEIRA VEZ"))).toBe(true);
		expect(out.some((m) => m.content.includes("xyz"))).toBe(true);
	});
});
