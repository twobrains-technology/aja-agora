import { describe, expect, it } from "vitest";
import { closingPresentation } from "./closing-presentation";
import type { ConfirmOfferResult } from "./fulfillment";

const res = { administradora: "CANOPUS" } as ConfirmOfferResult;
const resumo = (items: ReturnType<typeof closingPresentation>) =>
	items.map((i) => (i.kind === "text" ? "texto" : i.type));

describe("closingPresentation (fecho enxuto)", () => {
	it("web: proposta → parabéns → card do WhatsApp, sem o textão", () => {
		const items = closingPresentation(res, { channel: "web", propostaUrl: "https://x/p" });
		expect(resumo(items)).toEqual(["signature_handoff", "texto", "atendimento_handoff"]);
		const textos = items.filter((i) => i.kind === "text").map((i) => (i as { text: string }).text);
		expect(textos).toEqual(["Parabéns! Agora você está oficialmente mais perto da sua conquista!"]);
	});

	it("sem URL da proposta não há card da proposta", () => {
		expect(resumo(closingPresentation(res, { channel: "web" }))).toEqual([
			"texto",
			"atendimento_handoff",
		]);
	});

	it("whatsapp: parabéns + aviso do atendente, nunca 'reservada' nem prazo", () => {
		const items = closingPresentation(res, { channel: "whatsapp" });
		expect(resumo(items)).toEqual(["texto", "texto"]);
		const todo = items.map((i) => (i.kind === "text" ? i.text : "")).join(" ");
		expect(todo).not.toMatch(/reservad|contemplação|boleto/i);
	});
});
