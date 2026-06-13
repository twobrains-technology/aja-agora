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

	// FIX-13 — a oferta de Parceiro tem 8 campos e `term` NÃO é um deles (spec §7).
	// Regra D11: nenhum número sem fonte — nem o texto nem o payload podem inventar prazo.
	it("FIX-13: NUNCA emite prazo — texto sem 'N meses', payload sem term/termMonths/prazo", () => {
		const items = realOfferPresentation(START_OK);
		const allText = items
			.filter((i) => i.kind === "text")
			.map((i) => i.text)
			.join("\n");
		expect(allText).not.toMatch(/\d+\s*(meses|mês)\b/i);
		const artifact = items.find((i) => i.kind === "artifact" && i.type === "real_offer");
		if (artifact?.kind !== "artifact") throw new Error("real_offer ausente");
		expect(Object.keys(artifact.payload).sort()).toEqual([
			"administradora",
			"category",
			"creditValue",
			"grupo",
			"monthlyPayment",
			"proposalId",
		]);
	});

	// FIX-39 — a API nova passou a trazer `prazo`; quando a oferta tem termMonths,
	// o payload do real_offer o carrega (fonte real). Sem prazo, NÃO inventa (a
	// chave nem existe — mantém o fallback honesto do card / FIX-13).
	it("FIX-39: oferta COM prazo real → payload do real_offer carrega termMonths", () => {
		const items = realOfferPresentation({
			...START_OK,
			offer: { ...START_OK.offer, termMonths: 72 },
		});
		const artifact = items.find((i) => i.kind === "artifact" && i.type === "real_offer");
		if (artifact?.kind !== "artifact") throw new Error("real_offer ausente");
		expect(artifact.payload.termMonths).toBe(72);
	});

	it("FIX-39: oferta SEM prazo (API volta atrás) → payload SEM termMonths (não inventa)", () => {
		const items = realOfferPresentation(START_OK);
		const artifact = items.find((i) => i.kind === "artifact" && i.type === "real_offer");
		if (artifact?.kind !== "artifact") throw new Error("real_offer ausente");
		expect("termMonths" in artifact.payload).toBe(false);
	});

	// FIX-40 — `lanceMedio` (lance médio do grupo) entra no payload do real_offer e,
	// quando o usuário declarou um lance na qualificação, vira uma frase de POSIÇÃO
	// factual (acima/abaixo). Regra D11: rótulo literal, SEM prometer contemplação
	// (proibido derivar "chance de contemplar" da semântica não-confirmada).
	const START_COM_LANCE = {
		...START_OK,
		offer: { ...START_OK.offer, avgBidValue: 69_361.27 },
	};

	it("FIX-40: oferta COM lanceMedio → payload do real_offer carrega avgBidValue", () => {
		const items = realOfferPresentation(START_COM_LANCE);
		const artifact = items.find((i) => i.kind === "artifact" && i.type === "real_offer");
		if (artifact?.kind !== "artifact") throw new Error("real_offer ausente");
		expect(artifact.payload.avgBidValue).toBe(69_361.27);
	});

	it("FIX-40: oferta SEM lanceMedio → payload SEM avgBidValue (não inventa)", () => {
		const items = realOfferPresentation(START_OK);
		const artifact = items.find((i) => i.kind === "artifact" && i.type === "real_offer");
		if (artifact?.kind !== "artifact") throw new Error("real_offer ausente");
		expect("avgBidValue" in artifact.payload).toBe(false);
	});

	const lanceText = (items: ReturnType<typeof realOfferPresentation>) =>
		items
			.filter((i) => i.kind === "text")
			.map((i) => i.text)
			.join("\n");

	it("FIX-40: lance declarado ACIMA do médio → frase factual 'acima', com os 2 números", () => {
		const text = lanceText(realOfferPresentation(START_COM_LANCE, { declaredLanceValue: 117_000 }));
		expect(text).toMatch(/lance/i);
		expect(text).toMatch(/acima/i);
		expect(text).toMatch(/117\.000/);
		expect(text).toMatch(/69\.361/);
	});

	it("FIX-40: lance declarado ABAIXO do médio → frase factual 'abaixo'", () => {
		const text = lanceText(realOfferPresentation(START_COM_LANCE, { declaredLanceValue: 50_000 }));
		expect(text).toMatch(/abaixo/i);
		expect(text).toMatch(/50\.000/);
		expect(text).toMatch(/69\.361/);
	});

	it("FIX-40: frase de lance NUNCA promete contemplação (sem 'contempl'/'garant'/'chance')", () => {
		const text = lanceText(realOfferPresentation(START_COM_LANCE, { declaredLanceValue: 117_000 }));
		expect(text).not.toMatch(/contempl/i);
		expect(text).not.toMatch(/garant/i);
		expect(text).not.toMatch(/chance/i);
		expect(text).not.toMatch(/\b\d{1,3}%/); // nada de "74% de chance"
	});

	it("FIX-40: sem lance declarado → NÃO injeta frase de lance (nada de comparação)", () => {
		const text = lanceText(realOfferPresentation(START_COM_LANCE));
		expect(text).not.toMatch(/acima|abaixo|na média/i);
	});

	it("FIX-40: lance declarado mas oferta SEM lanceMedio → NÃO compara (sem fonte, D11)", () => {
		const text = lanceText(realOfferPresentation(START_OK, { declaredLanceValue: 117_000 }));
		expect(text).not.toMatch(/acima|abaixo|na média/i);
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
		expect(allText).toContain(
			"Parabéns! Agora você está oficialmente mais perto da sua conquista!",
		);
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
