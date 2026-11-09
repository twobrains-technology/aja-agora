import { describe, expect, it } from "vitest";
import { closingPresentation } from "./closing-presentation";
import type { ConfirmOfferResult } from "./fulfillment";

const res = { administradora: "CANOPUS" } as ConfirmOfferResult;
const resumo = (items: ReturnType<typeof closingPresentation>) =>
	items.map((i) => (i.kind === "text" ? "texto" : i.type));

describe("closingPresentation (fecho enxuto)", () => {
	it("web: UM card só (atendimento_handoff), com a proposta dentro e sem texto solto", () => {
		const items = closingPresentation(res, { channel: "web", propostaUrl: "https://x/p" });
		expect(resumo(items)).toEqual(["atendimento_handoff"]);
		const card = items[0];
		expect(card.kind === "artifact" && card.payload.proposalUrl).toBe("https://x/p");
	});

	it("web sem URL da proposta: o mesmo card, sem proposalUrl", () => {
		const items = closingPresentation(res, { channel: "web" });
		expect(resumo(items)).toEqual(["atendimento_handoff"]);
		const card = items[0];
		expect(card.kind === "artifact" && "proposalUrl" in card.payload).toBe(false);
	});

	it("whatsapp (inalterado): parabéns + aviso do atendente, nunca 'reservada' nem prazo", () => {
		const items = closingPresentation(res, { channel: "whatsapp" });
		expect(resumo(items)).toEqual(["texto", "texto"]);
		const todo = items.map((i) => (i.kind === "text" ? i.text : "")).join(" ");
		expect(todo).not.toMatch(/reservad|contemplação|boleto/i);
	});
});
