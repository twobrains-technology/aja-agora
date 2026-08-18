/**
 * O clique que matou a venda (prod, WhatsApp, `fd76e393`, 16/08/2026 19:22:53).
 *
 * O cliente estava no formulário de contratação e clicou em "Ver outras" —
 * para ele, comparar antes de fechar. Esse botão é o `contract_cancel`
 * (`formatter.ts:999`), e `handleContractCancel` apagava `contractCollection`
 * sem devolver o funil a um estado alcançável: `contractFormDispatched`
 * continuava `true`, e com essa flag `nextGate` (`qualify-state.ts:567`) devolve
 * `"search"` — o terminal, sem card e sem pergunta canônica.
 *
 * A partir dali o fecho ficou **permanentemente inalcançável**: quem re-emite o
 * formulário é o gate `contract`, que nunca mais seria pedido, e
 * `captureContractText` devolve `handled:false` sem `contractCollection`.
 *
 * O custo exato: 17 segundos depois o cliente escreveu "perdao, eh essa emsmo
 * vamos fechar, confirmado" e, um minuto depois, "fecha a proposta". As duas
 * falas passam em `decideConfirmStage` com `outcome: "fire"` — as duas teriam
 * criado a proposta na administradora, se a máquina estivesse viva. Em vez
 * disso, a conversa terminou com o agente anunciando "Sua proposta está
 * fechada" e `bevi_proposals = 0`.
 *
 * A fala falsa do fim é consequência, não causa. Este teste prende a causa.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { nextGate } from "@/lib/agent/qualify-state";

const CONV_ID = "conv-contract-cancel";
const WA = "5562999887766";

const mocks = vi.hoisted(() => ({
	sendText: vi.fn().mockResolvedValue(undefined),
	sendInteractive: vi.fn().mockResolvedValue(undefined),
	saveMessage: vi.fn().mockResolvedValue("msg-1"),
	persistMeta: vi.fn().mockResolvedValue(undefined),
	buildOtherOptions: vi.fn(),
	meta: {} as ConversationMetadata,
	processText: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./session", () => ({ getOrCreateConversation: vi.fn(async () => ({ id: CONV_ID })) }));
vi.mock("./api", () => ({
	sendTextMessage: mocks.sendText,
	sendInteractiveMessage: mocks.sendInteractive,
}));
vi.mock("@/lib/conversation/messages", () => ({ saveMessage: mocks.saveMessage }));
vi.mock("@/lib/conversation/cards", () => ({
	registrarCardEnviado: vi.fn().mockResolvedValue("msg-card"),
}));
vi.mock("@/lib/conversation/meta", () => ({
	metaOf: () => mocks.meta,
	persistMeta: mocks.persistMeta,
}));
vi.mock("@/db", () => ({
	db: {
		query: {
			conversations: { findFirst: vi.fn(async () => ({ id: CONV_ID, metadata: mocks.meta })) },
		},
		insert: () => ({ values: async () => undefined }),
	},
}));
vi.mock("./adapter", () => ({
	runDirectiveWithOrchestrator: vi.fn(),
	runSearchSummaryWithOrchestrator: vi.fn(),
	fireGate: vi.fn(),
	runTransitionWithOrchestrator: vi.fn(),
}));
vi.mock("./proxy", () => ({
	getHandoffState: vi.fn().mockResolvedValue({ isHandedOff: false }),
	startInterestHandoff: vi.fn(),
}));
vi.mock("@/lib/bevi/other-options", () => ({ buildOtherOptions: mocks.buildOtherOptions }));

import { dispatchInteractiveReply } from "./interactive-handlers";

/** O metadata literal de `fd76e393` no instante do clique (copiado da linha em
 * produção, menos o `identityEnc`), com a coleta de contratação em andamento —
 * que é o que o clique vai apagar. Estado real em vez de resumo: um campo
 * faltando muda a cascata do `nextGate` e o teste passaria a medir outra coisa. */
function metaNoFormulario(): ConversationMetadata {
	return {
		desireAsked: true,
		desireAnswered: true,
		currentPersona: "imovel",
		currentCategory: "imovel",
		experiencePrev: "first",
		expertiseLevel: "leigo",
		motivationAsked: true,
		explicouComoFunciona: true,
		revealCompleted: true,
		searchDispatched: true,
		identityCollected: true,
		decisionAccepted: true,
		decisionDispatched: true,
		topicPickerDispatched: true,
		contractFormDispatched: true,
		recommendedOfferStale: false,
		discoveryEmptyStreak: 0,
		maxStageReached: "em_negociacao",
		recommendedAdministradora: "BANCO DO BRASIL",
		recommendedOffer: {
			groupId: "6a7b59c125935b16a73163c0",
			termMonths: 217,
			creditValue: 1_031_904,
			administradora: "BANCO DO BRASIL",
			monthlyPayment: 6_162.48,
		},
		qualifyAnswers: {
			objetivo: "investimento",
			creditMax: 1_000_000,
			creditMin: 500_000,
			prazoMeses: 120,
			alvoDeBusca: "valor",
			desiredItem: "uma casa nova",
		},
		contractCollection: { stage: "confirm" },
	} as unknown as ConversationMetadata;
}

beforeEach(() => {
	for (const m of [
		mocks.sendText,
		mocks.sendInteractive,
		mocks.saveMessage,
		mocks.persistMeta,
		mocks.buildOtherOptions,
		mocks.processText,
	])
		m.mockClear();
	mocks.meta = metaNoFormulario();
	mocks.buildOtherOptions.mockResolvedValue({
		text: "Claro! Essas são as outras opções que encontrei pro seu perfil — compara com calma:",
		groups: [
			{ id: "g1", administradora: "PORTO", creditValue: 900_000, monthlyPayment: 5_000 },
			{ id: "g2", administradora: "ITAU", creditValue: 950_000, monthlyPayment: 5_300 },
		],
	});
});

afterEach(() => vi.clearAllMocks());

const clicar = (replyId: string, replyTitle: string) =>
	dispatchInteractiveReply({
		from: WA,
		replyId,
		replyTitle,
		processTextMessage: mocks.processText,
	});

/** O estado que o handler gravou. */
function metaPersistida(): ConversationMetadata {
	const ultima = mocks.persistMeta.mock.calls.at(-1);
	if (!ultima) throw new Error("nada foi persistido");
	return ultima[1] as ConversationMetadata;
}

describe("'Ver outras' no formulário de contratação — cancela a coleta sem matar o fecho", () => {
	it("a coleta em andamento é encerrada (o clique não é ignorado)", async () => {
		await clicar("contract_cancel", "Ver outras");
		expect(metaPersistida().contractCollection).toBeUndefined();
	});

	it("o formulário volta a ser oferecível — senão a venda fica sem caminho", async () => {
		await clicar("contract_cancel", "Ver outras");
		expect(metaPersistida().contractFormDispatched).not.toBe(true);
	});

	it("e o funil de fato reabre o gate `contract` (o efeito, não a flag)", async () => {
		await clicar("contract_cancel", "Ver outras");
		expect(nextGate(metaPersistida())).toBe("contract");
	});

	it("a decisão do cliente NÃO é desfeita — ele quis comparar, não desistir da cota", async () => {
		await clicar("contract_cancel", "Ver outras");
		const meta = metaPersistida();
		expect(meta.decisionAccepted).toBe(true);
		expect(meta.identityCollected).toBe(true);
	});

	it("contrato já FECHADO é terminal — cancelar não reabre o que foi assinado", async () => {
		mocks.meta = { ...metaNoFormulario(), contractClosed: true } as ConversationMetadata;
		await clicar("contract_cancel", "Ver outras");
		const meta = metaPersistida();
		expect(meta.contractClosed).toBe(true);
		expect(nextGate(meta)).not.toBe("contract");
	});
});
