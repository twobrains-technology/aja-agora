// FIX-340(c) (bloco-c-whatsapp-invariantes) — dossiê serviços-whatsapp: usuário
// clicou no grupo ÂNCORA (comparison_table), a simulação mostrou "Valor do
// bem: R$ 45.000", mas a proposta REAL criada depois fechou com "Carta: R$
// 30.000" — números divergentes pro MESMO grupo/administradora.
//
// Causa: `handleGroupSelected`/`handleSimulate` nunca persistiam
// `meta.recommendedOffer`/`recommendedAdministradora` no momento do clique —
// só o runner.ts (heurística `isExploratoryWhatIf`, baseada em MENÇÃO DE
// VALOR no texto) re-ancorava depois de um novo simulation_result. Como o
// "texto" de um clique de botão é só o nome da administradora (sem o valor),
// a heurística classificava a re-simulação como exploratória e MANTINHA o
// snapshot antigo — a proposta real (contract-input.ts, `meta.recommendedOffer.
// creditValue`) fechava com o número velho.
//
// Fix: clique de botão é SEMPRE uma escolha determinística (nunca um
// what-if hipotético do modelo) — ancora o grupo clicado DIRETO, sem
// depender da heurística de texto.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";

const CONV_ID = "conv-ih-fix340c";
const WA = "5562999887766";

const GROUP_DETAILS = {
	id: "g-ancora-1",
	administradora: "ÂNCORA",
	groupNumber: "313",
	category: "servicos" as const,
	creditValue: 45000,
	termMonths: 97,
	totalParticipants: 200,
	availableSlots: 3,
	adminFeePercent: 18,
	reserveFundPercent: 2,
	monthlyPayment: 694,
	contemplationHistory: [],
	nextAssembly: "",
	startDate: "",
	status: "active" as const,
};

const mocks = vi.hoisted(() => ({
	runDirective: vi.fn().mockResolvedValue(undefined),
	saveMessage: vi.fn().mockResolvedValue(undefined),
	persistMeta: vi.fn().mockResolvedValue(undefined),
	getGroupDetails: vi.fn(),
	meta: {} as ConversationMetadata,
}));

vi.mock("./session", () => ({ getOrCreateConversation: vi.fn(async () => ({ id: CONV_ID })) }));
vi.mock("./api", () => ({
	sendTextMessage: vi.fn().mockResolvedValue(undefined),
	sendInteractiveMessage: vi.fn().mockResolvedValue(undefined),
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
vi.mock("@/lib/adapters", () => ({
	getDiscoveryAdapter: () => ({ getGroupDetails: mocks.getGroupDetails }),
}));
vi.mock("./adapter", () => ({
	runDirectiveWithOrchestrator: mocks.runDirective,
}));
vi.mock("./proxy", () => ({
	getHandoffState: vi.fn().mockResolvedValue({ isHandedOff: false }),
	startInterestHandoff: vi.fn(),
}));

import { dispatchInteractiveReply } from "./interactive-handlers";

function dispatch(replyId: string, replyTitle = "ÂNCORA") {
	return dispatchInteractiveReply({
		from: WA,
		replyId,
		replyTitle,
		processTextMessage: vi.fn(),
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getGroupDetails.mockResolvedValue(GROUP_DETAILS);
	mocks.meta = {
		recommendedAdministradora: "ÂNCORA",
		recommendedOffer: {
			administradora: "ÂNCORA",
			creditValue: 30000,
			termMonths: 97,
			monthlyPayment: 462,
			groupId: "g-outro-grupo",
		},
	} as ConversationMetadata;
});

afterEach(() => vi.clearAllMocks());

describe("FIX-340(c) — clique num grupo ancora recommendedOffer com o valor REAL clicado", () => {
	it("handleGroupSelected (group_<id>) persiste recommendedOffer com o creditValue do grupo clicado", async () => {
		await dispatch("group_g-ancora-1");

		const persisted = mocks.persistMeta.mock.calls.find(
			(c) => (c[1] as ConversationMetadata | undefined)?.recommendedOffer?.groupId === "g-ancora-1",
		);
		expect(
			persisted,
			"esperava um persistMeta com recommendedOffer.groupId=g-ancora-1",
		).toBeDefined();
		const persistedMeta = persisted?.[1] as ConversationMetadata;
		expect(persistedMeta.recommendedOffer?.creditValue).toBe(45000);
		expect(persistedMeta.recommendedAdministradora).toBe("ÂNCORA");
	});

	it("handleSimulate (simulate_<id>) também ancora — mesmo botão, mesmo invariante", async () => {
		await dispatch("simulate_g-ancora-1");

		const persisted = mocks.persistMeta.mock.calls.find(
			(c) => (c[1] as ConversationMetadata | undefined)?.recommendedOffer?.groupId === "g-ancora-1",
		);
		expect(persisted).toBeDefined();
		const persistedMeta = persisted?.[1] as ConversationMetadata;
		expect(persistedMeta.recommendedOffer?.creditValue).toBe(45000);
	});

	it("a âncora persistida é o que a proposta REAL vai usar depois (contract-input.ts: meta.recommendedOffer.creditValue)", async () => {
		await dispatch("group_g-ancora-1");

		const persisted = mocks.persistMeta.mock.calls.find(
			(c) => (c[1] as ConversationMetadata | undefined)?.recommendedOffer?.groupId === "g-ancora-1",
		);
		const persistedMeta = persisted?.[1] as ConversationMetadata;
		// A MESMA fonte que contract-input.ts lê (`meta.recommendedOffer?.creditValue`)
		// agora reflete o grupo que a simulação REALMENTE mostrou — nunca mais um
		// snapshot velho de uma recomendação anterior (30000).
		expect(persistedMeta.recommendedOffer?.creditValue).not.toBe(30000);
		expect(persistedMeta.recommendedOffer?.creditValue).toBe(GROUP_DETAILS.creditValue);
	});

	it("ancora ANTES de disparar o directive (a simulação e a âncora nunca podem divergir)", async () => {
		let ancoradoAntesDoDirective: number | undefined;
		mocks.runDirective.mockImplementation(async () => {
			const call = mocks.persistMeta.mock.calls.find(
				(c) =>
					(c[1] as ConversationMetadata | undefined)?.recommendedOffer?.groupId === "g-ancora-1",
			);
			ancoradoAntesDoDirective = (call?.[1] as ConversationMetadata | undefined)?.recommendedOffer
				?.creditValue;
		});
		await dispatch("group_g-ancora-1");
		expect(ancoradoAntesDoDirective).toBe(45000);
	});
});
