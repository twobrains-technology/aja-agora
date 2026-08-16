// P0-1 do dossiê de 2026-08-15 — o aceite estruturado tem que ESCREVER o aceite,
// e escrever igual nos dois canais.
//
// ## O defeito, medido em produção
//
// Conversa `9b9f9aab` (WhatsApp, 14/08 20:21): o cliente clicou "Seguir agora",
// o agente anunciou "você está oficialmente pré-cadastrado no consórcio do Itaú,
// o boleto chega na sua casa" — duas vezes — e `bevi_proposals` para essa
// conversa é **zero**. Não houve alucinação: o modelo traduziu com honestidade um
// estado de servidor quebrado.
//
// A cadeia é determinística. `handleInterest` grava só `decisionDispatched`;
// `nextGate` (qualify-state.ts:559, FIX-386) exige `escolha` OU `decisionAccepted`
// para sair do gate `decision`. Nenhum dos dois é escrito no WhatsApp — então o
// funil fica preso em `decision` para sempre, `contract_form` nunca é emitido, e
// nenhuma proposta chega à Bevi. Na web o mesmo clique passa por
// `route.ts:486-505`, que resolve o groupId contra as ofertas exibidas e grava
// `escolha`.
//
// A regra existe em duas cópias e só uma foi corrigida pelo FIX-386. Por isso o
// último teste deste arquivo é de PARIDADE: é ele que fecha a classe, não os
// casos individuais.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { nextGate } from "@/lib/agent/qualify-state";

const CONV_ID = "conv-p0-1-aceite";
const WA = "5562992496793";
const GROUP_ID = "6a7b59c325935b16a731689b";

/** Metadata LITERAL da conversa 9b9f9aab, copiada do banco de produção em
 * 2026-08-15 (a conversa que prometeu o pré-cadastro inexistente). */
function metaDeProducao(): ConversationMetadata {
	return {
		desireAsked: true,
		currentPersona: "auto",
		desireAnswered: true,
		experiencePrev: "returning",
		qualifyAnswers: {
			objetivo: "investimento",
			creditMax: 230000,
			creditMin: 207000,
			prazoMeses: 120,
			alvoDeBusca: "valor",
			creditMentionedAtDesire: 230000,
		},
		currentCategory: "auto",
		maxStageReached: "em_negociacao",
		motivationAsked: true,
		revealCompleted: true,
		recommendedOffer: {
			groupId: GROUP_ID,
			termMonths: 48,
			creditValue: 231043,
			administradora: "ITAÚ",
			monthlyPayment: 5777.12,
		},
		searchDispatched: true,
		identityCollected: true,
		decisionDispatched: true,
		discoveryEmptyStreak: 0,
		experienceDispatched: true,
		recommendedOfferStale: false,
		discoveredCreditTarget: 230000,
		recommendedAdministradora: "ITAÚ",
	} as unknown as ConversationMetadata;
}

const OFERTA_EXIBIDA = {
	groupId: GROUP_ID,
	administradora: "ITAÚ",
	creditValue: 231043,
	termMonths: 48,
	monthlyPayment: 5777.12,
};

const mocks = vi.hoisted(() => ({
	sendText: vi.fn().mockResolvedValue(undefined),
	sendInteractive: vi.fn().mockResolvedValue(undefined),
	saveMessage: vi.fn().mockResolvedValue(undefined),
	persistMeta: vi.fn().mockResolvedValue(undefined),
	listShownOffers: vi.fn(),
	runAgentDirective: vi.fn().mockResolvedValue(undefined),
	meta: {} as ConversationMetadata,
	processText: vi.fn().mockResolvedValue(undefined),
	warn: vi.fn(),
}));

vi.mock("./session", () => ({ getOrCreateConversation: vi.fn(async () => ({ id: CONV_ID })) }));
vi.mock("./api", () => ({
	sendTextMessage: mocks.sendText,
	sendInteractiveMessage: mocks.sendInteractive,
}));
vi.mock("@/lib/conversation/messages", () => ({ saveMessage: mocks.saveMessage }));
vi.mock("@/lib/conversation/meta", () => ({
	metaOf: () => mocks.meta,
	persistMeta: mocks.persistMeta,
}));
vi.mock("@/db", () => ({
	db: {
		query: {
			conversations: { findFirst: vi.fn(async () => ({ id: CONV_ID, metadata: mocks.meta })) },
		},
	},
}));
vi.mock("./adapter", () => ({
	runDirectiveWithOrchestrator: mocks.runAgentDirective,
	runSearchSummaryWithOrchestrator: vi.fn(),
	fireGate: vi.fn(),
	runTransitionWithOrchestrator: vi.fn(),
}));
vi.mock("./proxy", () => ({
	getHandoffState: vi.fn().mockResolvedValue({ isHandedOff: false }),
	startInterestHandoff: vi.fn(),
}));
vi.mock("@/lib/agent/orchestrator/choose-offer", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/agent/orchestrator/choose-offer")>()),
	listShownOffersForConversation: mocks.listShownOffers,
}));

import { dispatchInteractiveReply } from "./interactive-handlers";

function clicar(replyId: string, replyTitle = "Seguir agora") {
	return dispatchInteractiveReply({
		from: WA,
		replyId,
		replyTitle,
		processTextMessage: mocks.processText,
	});
}

/** O meta como ficou DEPOIS do clique (última escrita registrada). */
function metaPersistido(): ConversationMetadata {
	const chamadas = mocks.persistMeta.mock.calls;
	if (chamadas.length === 0) return mocks.meta;
	return chamadas[chamadas.length - 1][1] as ConversationMetadata;
}

beforeEach(() => {
	for (const m of [
		mocks.sendText,
		mocks.sendInteractive,
		mocks.saveMessage,
		mocks.persistMeta,
		mocks.listShownOffers,
		mocks.runAgentDirective,
		mocks.processText,
	])
		m.mockClear();
	mocks.meta = metaDeProducao();
	mocks.listShownOffers.mockResolvedValue([OFERTA_EXIBIDA]);
});

afterEach(() => vi.clearAllMocks());

describe("P0-1 — o aceite no WhatsApp escreve o aceite (conversa 9b9f9aab)", () => {
	it("o estado de produção prova o livelock: sem escolha nem decisionAccepted, o gate nunca sai de decision", () => {
		// Este é o retrato do defeito, não do conserto: com o meta exatamente como
		// ficou no banco, o funil está parado.
		expect(nextGate(metaDeProducao())).toBe("decision");
	});

	it("clique 'interest_<groupId exibido>' ancora a escolha e o funil anda para contract", async () => {
		await clicar(`interest_${GROUP_ID}`);
		const meta = metaPersistido();
		expect(meta.escolha).toMatchObject({
			groupId: GROUP_ID,
			administradora: "ITAÚ",
			creditValue: 231043,
			termMonths: 48,
		});
		// O que decide a venda: o próximo passo passa a ser o formulário.
		expect(nextGate(meta)).toBe("contract");
	});

	it("clique 'decision_contratar' (sem groupId) grava decisionAccepted e também anda", async () => {
		await clicar("decision_contratar", "Contratar");
		const meta = metaPersistido();
		expect(meta.decisionAccepted).toBe(true);
		expect(nextGate(meta)).toBe("contract");
	});

	it("groupId que NÃO foi exibido não ancora escolha — paridade com route.ts:501-505", async () => {
		mocks.listShownOffers.mockResolvedValue([OFERTA_EXIBIDA]);
		await clicar("interest_grupo-que-nunca-apareceu");
		const meta = metaPersistido();
		expect(meta.escolha).toBeUndefined();
	});
});

describe("P0-1 — paridade de canal (é este teste que fecha a classe)", () => {
	// Cada regra deste produto que reapareceu quebrada é uma regra escrita duas
	// vezes. Testar o WhatsApp isolado só prova que ESTA instância foi corrigida;
	// o que impede a reincidência é exigir que os dois canais, partindo do mesmo
	// estado e recebendo a mesma ação de aceite, cheguem ao MESMO gate.
	const ACOES_DE_ACEITE = [
		{
			nome: "aceite com cota nomeada (web: select-group · WhatsApp: interest_<groupId>)",
			aplicarWeb: (m: ConversationMetadata): ConversationMetadata => ({
				...m,
				escolha: {
					groupId: GROUP_ID,
					administradora: "ITAÚ",
					creditValue: 231043,
					termMonths: 48,
					monthlyPayment: 5777.12,
					origem: "afirmacao",
				},
			}),
			clique: `interest_${GROUP_ID}`,
		},
		{
			nome: "aceite sem cota nomeada (web: decisão aceita · WhatsApp: decision_contratar)",
			aplicarWeb: (m: ConversationMetadata): ConversationMetadata => ({
				...m,
				decisionAccepted: true,
			}),
			clique: "decision_contratar",
		},
	] as const;

	for (const acao of ACOES_DE_ACEITE) {
		it(`mesmo gate nos dois canais — ${acao.nome}`, async () => {
			const gateWeb = nextGate(acao.aplicarWeb(metaDeProducao()));

			mocks.persistMeta.mockClear();
			mocks.meta = metaDeProducao();
			await clicar(acao.clique);
			const gateWhatsapp = nextGate(metaPersistido());

			expect(gateWhatsapp).toBe(gateWeb);
		});
	}
});
