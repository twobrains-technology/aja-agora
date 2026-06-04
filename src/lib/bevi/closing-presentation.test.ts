import { describe, expect, it } from "vitest";
import { closingPresentation, realOfferPresentation } from "./closing-presentation";

// ============================================================================
// Camada 1 — passo 5 do docx ("Contratar"): a apresentação do fechamento vive
// num módulo único (route + harness do eval consomem o MESMO copy). O docx
// exige literalmente: os 2 reforços ("administradora X, escolhida pela Aja
// Agora" / "segue com você até a contemplação e depois dela") e o fechamento
// "Parabéns! Agora você está oficialmente mais perto da sua conquista!".
// ============================================================================

const START_OK = {
	proposalId: "prop-1",
	offer: {
		ofertaId: "oferta-1",
		administradora: "ÂNCORA",
		grupo: "1234",
		category: "auto" as const,
		creditValue: 60_000,
		monthlyPayment: 980,
		tipoOferta: "SPECIAL_OFFER" as const,
	},
	noOffer: false,
};

const CONFIRM = {
	proposalId: "prop-1",
	administradora: "ÂNCORA",
	consortiumProposalLink: "https://assina.example/p1",
	documentsLinkPersonal: "https://docs.example/p1",
	documentsLinkAddress: "https://docs.example/p1/end",
};

describe("realOfferPresentation — oferta real a confirmar (passo 5.1)", () => {
	it("apresenta a carta real da administradora + artifact real_offer com os campos", () => {
		const items = realOfferPresentation(START_OK);
		const texts = items.filter((i) => i.kind === "text").map((i) => i.text);
		expect(texts.join("\n")).toMatch(/carta real/i);
		expect(texts.join("\n")).toContain("ÂNCORA");
		const artifact = items.find((i) => i.kind === "artifact" && i.type === "real_offer");
		if (artifact?.kind !== "artifact") throw new Error("real_offer ausente");
		expect(artifact.payload).toMatchObject({
			proposalId: "prop-1",
			administradora: "ÂNCORA",
			grupo: "1234",
			creditValue: 60_000,
			monthlyPayment: 980,
		});
	});

	it("sem oferta (valor abaixo do mínimo): explica e NÃO emite artifact", () => {
		const items = realOfferPresentation({ proposalId: "p", offer: null, noOffer: true });
		const texts = items.filter((i) => i.kind === "text").map((i) => i.text);
		expect(texts.join("\n")).toMatch(/não encontrei uma carta/i);
		expect(items.some((i) => i.kind === "artifact")).toBe(false);
	});
});

describe("closingPresentation — confirmação + assinatura + docs (passo 5.2, docx)", () => {
	const items = closingPresentation(CONFIRM);
	const allText = items
		.filter((i) => i.kind === "text")
		.map((i) => i.text)
		.join("\n");

	it("reforço 1 literal: administradora escolhida pela Aja Agora para o seu perfil", () => {
		expect(allText).toContain("Você está contratando um consórcio da ÂNCORA");
		expect(allText).toMatch(/escolhida pela Aja Agora/);
		expect(allText).toMatch(/para o seu perfil/);
	});

	it("reforço 2 literal: a Aja Agora segue com você até a contemplação e depois dela", () => {
		expect(allText).toMatch(/Aja Agora segue com você até a contemplação/);
		expect(allText).toMatch(/depois dela/);
	});

	it('fechamento literal do docx: "Parabéns! Agora você está oficialmente mais perto da sua conquista!"', () => {
		expect(allText).toContain("Parabéns! Agora você está oficialmente mais perto da sua conquista!");
	});

	it("emite signature_handoff com o link de assinatura e document_upload opcional", () => {
		const sig = items.find((i) => i.kind === "artifact" && i.type === "signature_handoff");
		if (sig?.kind !== "artifact") throw new Error("signature_handoff ausente");
		expect(sig.payload).toMatchObject({
			administradora: "ÂNCORA",
			consortiumProposalLink: "https://assina.example/p1",
		});
		const doc = items.find((i) => i.kind === "artifact" && i.type === "document_upload");
		if (doc?.kind !== "artifact") throw new Error("document_upload ausente");
		expect(doc.payload).toMatchObject({
			proposalId: "prop-1",
			documentsLinkPersonal: "https://docs.example/p1",
			optional: true,
		});
	});

	it("ordem do docx: reforços ANTES dos artifacts; Parabéns DEPOIS deles", () => {
		const idxReforco = items.findIndex(
			(i) => i.kind === "text" && /escolhida pela Aja Agora/.test(i.text),
		);
		const idxSig = items.findIndex((i) => i.kind === "artifact" && i.type === "signature_handoff");
		const idxParabens = items.findIndex((i) => i.kind === "text" && /Parabéns!/.test(i.text));
		expect(idxReforco).toBeGreaterThanOrEqual(0);
		expect(idxSig).toBeGreaterThan(idxReforco);
		expect(idxParabens).toBeGreaterThan(idxSig);
	});
});
