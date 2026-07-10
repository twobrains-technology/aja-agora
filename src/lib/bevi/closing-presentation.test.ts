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

	// FIX-240 (rodada 2, Fable r1, D5.1): pedido 120k → recomendada ITAÚ 150k →
	// no contract-submit a real_offer veio 211.258 sem aviso (CDC art. 30). O
	// fecho SEMPRE carrega rawCreditValue (valor pedido) quando difere da carta
	// fechada — o aviso de ajuste (FIX-197, real-offer.tsx) passa a renderizar.
	it("FIX-240: carta fechada difere do valor pedido → payload carrega rawCreditValue = valor pedido", () => {
		const items = realOfferPresentation({
			...START_OK,
			offer: { ...START_OK.offer, creditValue: 211_258 },
			requestedCreditValue: 150_000,
		});
		const artifact = items.find((i) => i.kind === "artifact" && i.type === "real_offer");
		if (artifact?.kind !== "artifact") throw new Error("real_offer ausente");
		expect(artifact.payload.rawCreditValue).toBe(150_000);
	});

	it("FIX-240: carta fechada é igual ao valor pedido → payload SEM rawCreditValue (sem aviso falso)", () => {
		const items = realOfferPresentation({
			...START_OK,
			offer: { ...START_OK.offer, creditValue: 60_000 },
			requestedCreditValue: 60_000,
		});
		const artifact = items.find((i) => i.kind === "artifact" && i.type === "real_offer");
		if (artifact?.kind !== "artifact") throw new Error("real_offer ausente");
		expect("rawCreditValue" in artifact.payload).toBe(false);
	});

	it("FIX-240: sem requestedCreditValue (caminho antigo/legado) → payload SEM rawCreditValue, não inventa", () => {
		const items = realOfferPresentation(START_OK);
		const artifact = items.find((i) => i.kind === "artifact" && i.type === "real_offer");
		if (artifact?.kind !== "artifact") throw new Error("real_offer ausente");
		expect("rawCreditValue" in artifact.payload).toBe(false);
	});

	// FIX-259 (rodada 5, veredito Fable r4, P1 #2): a administradora confirmada
	// pode não ter grupo na faixa → o fechamento troca pro global best. Isso
	// NUNCA pode sair em silêncio ("Confirmei com a X" sem explicar a troca).
	it("FIX-259: administradoraChanged → aviso explícito de troca (nunca 'Confirmei com a X' liso)", () => {
		const items = realOfferPresentation({
			...START_OK,
			offer: { ...START_OK.offer, administradora: "BANCO DO BRASIL" },
			administradoraChanged: true,
			previousAdministradora: "ITAÚ",
		});
		const texts = items
			.filter((i) => i.kind === "text")
			.map((i) => i.text)
			.join("\n");
		expect(texts).toMatch(/ITAÚ/);
		expect(texts).toMatch(/n[ãa]o tem grupo dispon[íi]vel/i);
		expect(texts).toMatch(/BANCO DO BRASIL/);
	});

	it("FIX-259: sem administradoraChanged → mantém 'Confirmei com a X' (comportamento antigo intacto)", () => {
		const items = realOfferPresentation(START_OK);
		const texts = items
			.filter((i) => i.kind === "text")
			.map((i) => i.text)
			.join("\n");
		expect(texts).toMatch(/Confirmei com a ÂNCORA/);
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

// FIX-235 (handoff agente-vendas-consorcio, 2026-07-09 — D8) — fecho pro
// WhatsApp: depois do "Parabéns!", o agente avisa que mandou mensagem no
// WhatsApp e pede o "oi" (abre a janela de 24h — função técnica), e que a
// especialista em cadastros chama em seguida. NUNCA "reservado/garantido/
// você já está no grupo" (nada foi contratado só com a proposta enviada).
describe("closingPresentation — FECHO pro WhatsApp (FIX-235, pede o 'oi')", () => {
	const items = closingPresentation(CONFIRM);
	const allText = items
		.filter((i) => i.kind === "text")
		.map((i) => i.text)
		.join("\n");

	it("avisa que mandou mensagem no WhatsApp e pede o 'oi'", () => {
		expect(allText.toLowerCase()).toMatch(/whatsapp/);
		expect(allText).toMatch(/["“]oi["”]/);
	});

	it("menciona a especialista em cadastros chamando em seguida", () => {
		expect(allText.toLowerCase()).toMatch(/especialista em cadastros/);
	});

	it("NUNCA diz 'reservado/garantido/você já está no grupo'", () => {
		expect(allText.toLowerCase()).not.toMatch(/reservad[ao]/);
		expect(allText.toLowerCase()).not.toMatch(/garantid[ao]/);
		expect(allText.toLowerCase()).not.toMatch(/voc[êe] j[áa] est[áa] no grupo/);
	});

	it("o fecho vem DEPOIS do 'Parabéns!' (não quebra a ordem do docx já travada)", () => {
		const idxParabens = items.findIndex((i) => i.kind === "text" && /Parabéns!/.test(i.text));
		const idxOi = items.findIndex((i) => i.kind === "text" && /["“]oi["”]/.test(i.text));
		expect(idxOi).toBeGreaterThan(idxParabens);
	});
});

// FIX-265 (menor #3, veredito Fable r5, N7): "acabei de te mandar uma
// mensagenzinha no seu WhatsApp" era dito INCONDICIONALMENTE — inclusive
// quando o envio (sendFechoPedirOi) só ENFILEIROU (sem janela/template
// aprovado). Mentira observável em dev. A copy agora condiciona ao
// `whatsappChannel` que o caller (route.ts) já sabe de `sendFechoPedirOi`.
describe("closingPresentation — FIX-265: copy condicional do fecho WhatsApp (enviado vs enfileirado)", () => {
	const textOf = (opts?: Parameters<typeof closingPresentation>[1]) =>
		closingPresentation(CONFIRM, opts)
			.filter((i) => i.kind === "text")
			.map((i) => i.text)
			.join("\n");

	it("channel='free_text' → afirma que MANDOU (enviado agora, na janela aberta)", () => {
		const text = textOf({ whatsappChannel: "free_text" });
		expect(text).toMatch(/mandei|te mandei|acabei de te mandar/i);
	});

	it("channel='template' → afirma que MANDOU (enviado agora, via template Meta)", () => {
		const text = textOf({ whatsappChannel: "template" });
		expect(text).toMatch(/mandei|te mandei|acabei de te mandar/i);
	});

	it("channel='queued' → NÃO afirma que já mandou (só enfileirou) — nada de 'acabei de te mandar'", () => {
		const text = textOf({ whatsappChannel: "queued" });
		expect(text).not.toMatch(/acabei de te mandar|j[áa] mandei/i);
		expect(text.toLowerCase()).toMatch(/whatsapp/);
	});

	it("channel='queued' ainda pede o 'oi' e menciona a especialista (fecho não perde a função técnica)", () => {
		const text = textOf({ whatsappChannel: "queued" });
		expect(text).toMatch(/["“]oi["”]/);
		expect(text.toLowerCase()).toMatch(/especialista em cadastros/);
	});

	it("sem opts (retrocompatível — callers que não migraram, ex. interactive-handlers.ts) mantém o texto de sempre", () => {
		const text = textOf(undefined);
		expect(text).toContain("acabei de te mandar uma mensagenzinha no seu WhatsApp");
	});
});
