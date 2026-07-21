import { describe, expect, it } from "vitest";
import {
	closingPresentation,
	realOfferPresentation,
	WHATSAPP_OFICIAL_DIGITOS,
	WHATSAPP_OFICIAL_EXIBICAO,
} from "./closing-presentation";

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

// A carta real da administradora pode voltar com OUTRA parcela e OUTRO prazo —
// o cliente decidiu olhando os números simulados. Confirmar em silêncio é
// exatamente o que o aviso de carta (FIX-240, CDC art. 30) já impede pro valor;
// parcela e prazo tinham ficado de fora, e ao vivo alguém disse sim a 48 meses
// e assinou 55 (2026-07-21).
describe("realOfferPresentation — mudança de plano entre o sim e a assinatura", () => {
	const VISTA = { monthlyPayment: 10_689.51, termMonths: 48 };
	const REAL = {
		...START_OK,
		offer: { ...START_OK.offer, monthlyPayment: 9_879, termMonths: 55 },
	};

	it("parcela e prazo diferentes do aprovado → payload carrega os dois valores vistos", () => {
		const items = realOfferPresentation(REAL, { ofertaVista: VISTA });
		const card = items.find((i) => i.kind === "artifact" && i.type === "real_offer");
		if (card?.kind !== "artifact") throw new Error("real_offer ausente");
		expect(card.payload.parcelaVista).toBe(10_689.51);
		expect(card.payload.prazoVisto).toBe(48);
	});

	it("plano IGUAL ao aprovado → nada a avisar (sem ruído no card)", () => {
		const items = realOfferPresentation(REAL, {
			ofertaVista: { monthlyPayment: 9_879, termMonths: 55 },
		});
		const card = items.find((i) => i.kind === "artifact" && i.type === "real_offer");
		if (card?.kind !== "artifact") throw new Error("real_offer ausente");
		expect("parcelaVista" in card.payload).toBe(false);
		expect("prazoVisto" in card.payload).toBe(false);
	});

	it("sem a oferta vista (fluxo antigo) → comportamento de sempre", () => {
		const items = realOfferPresentation(REAL);
		const card = items.find((i) => i.kind === "artifact" && i.type === "real_offer");
		if (card?.kind !== "artifact") throw new Error("real_offer ausente");
		expect("parcelaVista" in card.payload).toBe(false);
	});
});

describe("closingPresentation — o fecho (passo 5.2)", () => {
	const PROPOSTA = "https://docs.aja.test/proposta.pdf";
	const items = closingPresentation(CONFIRM, { channel: "web", propostaUrl: PROPOSTA });
	const allText = items
		.filter((i) => i.kind === "text")
		.map((i) => i.text)
		.join("\n");

	it("reforço 1 literal: administradora escolhida pela Aja Agora para o seu perfil", () => {
		expect(allText).toContain("Sua cota da ÂNCORA está reservada");
		expect(allText).toMatch(/escolhida pela Aja Agora/);
		expect(allText).toMatch(/para o seu perfil/);
	});

	// FIX-278 (veredito r9, G2): terminologia RESERVA DE COTA (Ata 2026-07-04,
	// item 2/P0) — nunca "consórcio fechado/contratado".
	it("FIX-278: terminologia RESERVA DE COTA — nunca 'contratando/contratado/fechado', sempre 'reserv'", () => {
		expect(allText.toLowerCase()).not.toMatch(/contratand[ao]|contratad[ao]|fechad[ao]/);
		expect(allText.toLowerCase()).toMatch(/reserv/);
	});

	it("FIX-278: comunica que não paga nada agora (booking, só quando chegar o boleto)", () => {
		expect(allText.toLowerCase()).toMatch(/n[ãa]o paga nada agora/);
		expect(allText.toLowerCase()).toMatch(/boleto/);
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

	// A proposta que o cliente abre é a NOSSA (PDF co-branded). O link da
	// administradora em domínio de terceiro (useme.link) foi abolido em
	// 2026-07-21 — o cliente não sai da Aja Agora pra ver o próprio plano.
	it("emite signature_handoff com a NOSSA proposta (proposalUrl), nunca o link da administradora", () => {
		const sig = items.find((i) => i.kind === "artifact" && i.type === "signature_handoff");
		if (sig?.kind !== "artifact") throw new Error("signature_handoff ausente");
		expect(sig.payload).toMatchObject({ administradora: "ÂNCORA", proposalUrl: PROPOSTA });
		expect(JSON.stringify(sig.payload)).not.toContain(CONFIRM.consortiumProposalLink);
	});

	it("sem a nossa proposta pronta, NÃO emite o card — melhor nenhum link do que o de terceiro", () => {
		const semProposta = closingPresentation(CONFIRM, { channel: "web" });
		expect(semProposta.some((i) => i.kind === "artifact" && i.type === "signature_handoff")).toBe(
			false,
		);
		expect(JSON.stringify(semProposta)).not.toContain(CONFIRM.consortiumProposalLink);
	});

	// Quem pede e recebe RG/CNH é o atendente que faz a adesão, na conversa dele
	// (Kairo, 2026-07-21). Pedir documento logo depois do "Parabéns" era jogar
	// mais uma tarefa no cliente sem ninguém do outro lado esperando por ela.
	it("NUNCA pede documento (document_upload saiu do fecho)", () => {
		expect(items.some((i) => i.kind === "artifact" && i.type === "document_upload")).toBe(false);
		expect(allText.toLowerCase()).not.toMatch(/rg ou cnh|documento/);
	});

	it("ordem: reforços ANTES dos artifacts; Parabéns DEPOIS deles", () => {
		const idxReforco = items.findIndex(
			(i) => i.kind === "text" && /escolhida pela Aja Agora/.test(i.text),
		);
		const idxSig = items.findIndex((i) => i.kind === "artifact" && i.type === "signature_handoff");
		const idxParabens = items.findIndex((i) => i.kind === "text" && /Parabéns!/.test(i.text));
		expect(idxReforco).toBeGreaterThanOrEqual(0);
		expect(idxSig).toBeGreaterThan(idxReforco);
		expect(idxParabens).toBeGreaterThan(idxSig);
	});

	it("NUNCA diz 'garantido/você já está no grupo' (nada de contemplação prometida)", () => {
		expect(allText.toLowerCase()).not.toMatch(/garantid[ao]/);
		expect(allText.toLowerCase()).not.toMatch(/voc[êe] j[áa] est[áa] no grupo/);
	});
});

// O handoff pro ATENDENTE humano fecha a jornada: é ele quem faz a adesão na
// administradora. Na WEB isso é um CARD com botão de WhatsApp (o cliente precisa
// de um lugar pra clicar — antes era um número solto no fim de um balão gigante,
// junto com uma URL assinada de 400 caracteres); no WhatsApp é uma frase, porque
// a conversa já está no canal certo.
describe("closingPresentation — handoff pro atendente", () => {
	const web = closingPresentation(CONFIRM, { channel: "web", propostaUrl: "https://x.test/p.pdf" });
	const wpp = closingPresentation(CONFIRM, { channel: "whatsapp" });
	const textoDe = (items: ReturnType<typeof closingPresentation>) =>
		items
			.filter((i) => i.kind === "text")
			.map((i) => i.text)
			.join("\n");

	it("web: emite o card atendimento_handoff com o número oficial e a administradora", () => {
		const card = web.find((i) => i.kind === "artifact" && i.type === "atendimento_handoff");
		if (card?.kind !== "artifact") throw new Error("atendimento_handoff ausente");
		expect(card.payload).toMatchObject({
			numero: WHATSAPP_OFICIAL_DIGITOS,
			numeroFormatado: WHATSAPP_OFICIAL_EXIBICAO,
			administradora: "ÂNCORA",
		});
	});

	it("web: o número NÃO aparece solto no texto — quem carrega o contato é o card", () => {
		expect(textoDe(web)).not.toContain(WHATSAPP_OFICIAL_EXIBICAO);
		expect(textoDe(web)).not.toMatch(/95502-0229/);
	});

	it("web: o handoff é o ÚLTIMO passo, depois do 'Parabéns!'", () => {
		const idxParabens = web.findIndex((i) => i.kind === "text" && /Parabéns!/.test(i.text));
		const idxHandoff = web.findIndex(
			(i) => i.kind === "artifact" && i.type === "atendimento_handoff",
		);
		expect(idxHandoff).toBeGreaterThan(idxParabens);
	});

	it("whatsapp: sem card — uma frase dizendo que o atendente chama por este mesmo número", () => {
		expect(wpp.some((i) => i.kind === "artifact" && i.type === "atendimento_handoff")).toBe(false);
		expect(textoDe(wpp).toLowerCase()).toMatch(/atendente/);
		expect(textoDe(wpp).toLowerCase()).toMatch(/por aqui mesmo|neste n[úu]mero/);
	});

	it("whatsapp: NUNCA pede pro cliente 'responder com um oi' num canal em que ele já está", () => {
		expect(textoDe(wpp)).not.toMatch(/["“]oi["”]/);
		expect(textoDe(wpp).toLowerCase()).not.toMatch(/mensagenzinha/);
	});

	it("os dois canais dizem que o atendente faz a ADESÃO na administradora", () => {
		expect(`${textoDe(wpp)} ${JSON.stringify(web)}`.toLowerCase()).toMatch(/ades[ãa]o/);
	});
});
