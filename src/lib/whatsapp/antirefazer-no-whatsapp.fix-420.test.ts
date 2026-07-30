// FIX-420 — o guard anti-refazer chega ao canal de MAIOR VOLUME.
//
// A 13ª e a 14ª revisões independentes acharam isto aberto, e a 14ª o classificou
// como o dano mais caro de todos os achados: `contract-capture.ts` chamava
// `startContract` SEM `administradoraConflictsWithRegisteredProposal` e sem passar
// `registeredAdministradora`. As duas proteções existiam só na web (`route.ts`).
//
// O cenário que elas mediram: cliente fecha RODOBENS; o polling grava o status
// humano da Bevi; cliente pede ITAÚ e fecha → `createProposal` de verdade →
// SEGUNDA proposta real, SEGUNDA consulta de bureau no MESMO CPF. É exatamente o
// que o FIX-263 existe pra impedir, aberto no canal principal desde sempre.
//
// ⚠️ A ironia fica registrada porque ela é o padrão que precisa parar: a mensagem
// do FIX-409 acusa o FIX-400 e o FIX-406 de "os dois esquecendo este canal" — e o
// FIX-415, meu, esqueceu de novo. Quatro commits declararam uma proteção fechada
// tendo fechado só metade dela.
//
// O teste mocka `startContract` e o repositório de propostas: o que importa aqui
// não é o que a Bevi devolve, é se a chamada ACONTECE. Chamada que não deveria
// acontecer é uma consulta de bureau no CPF de alguém.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";

const WA = "5562999887766";
const CONV = "conv-fix420";

const mocks = vi.hoisted(() => ({
	startContract: vi.fn(),
	getLatestBeviProposal: vi.fn(),
	sendTextMessage: vi.fn().mockResolvedValue(undefined),
	saveMessage: vi.fn().mockResolvedValue(undefined),
	persistMeta: vi.fn().mockResolvedValue(undefined),
	loadIdentity: vi.fn(),
	getLeadId: vi.fn().mockResolvedValue("lead-1"),
	meta: {} as ConversationMetadata,
}));

vi.mock("@/lib/bevi/fulfillment", () => ({ startContract: mocks.startContract }));
vi.mock("@/lib/bevi/proposal-repo", () => ({
	getLatestBeviProposal: mocks.getLatestBeviProposal,
}));
vi.mock("./api", () => ({ sendTextMessage: mocks.sendTextMessage }));
vi.mock("@/lib/conversation/messages", () => ({ saveMessage: mocks.saveMessage }));
vi.mock("@/lib/conversation/meta", () => ({
	persistMeta: mocks.persistMeta,
	reloadMeta: vi.fn(async () => mocks.meta),
	metaOf: (c: { metadata?: ConversationMetadata }) => c.metadata ?? {},
}));
vi.mock("@/lib/conversation/identity", async (orig) => ({
	...(await orig<Record<string, unknown>>()),
	loadIdentity: mocks.loadIdentity,
	storeIdentity: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/admin/lead-stage-tracker", () => ({
	getLeadIdForConversation: mocks.getLeadId,
	applyTrackedStageToLead: vi.fn().mockResolvedValue(undefined),
}));

import { fireContract } from "./contract-capture";

beforeEach(() => {
	for (const m of [
		mocks.startContract,
		mocks.getLatestBeviProposal,
		mocks.sendTextMessage,
		mocks.saveMessage,
		mocks.persistMeta,
		mocks.loadIdentity,
	])
		m.mockClear();
	mocks.loadIdentity.mockResolvedValue({ cpf: "52998224725", celular: "62999887766" });
	mocks.startContract.mockResolvedValue({ offer: null, noOffer: true });
	mocks.getLatestBeviProposal.mockResolvedValue(null);
	mocks.meta = {
		currentCategory: "auto",
		revealCompleted: true,
		identityCollected: true,
		recommendedAdministradora: "ITAU",
		// ⚠️ SEM isto o `fireContract` sai na segunda linha (`!meta.contractCollection`
		// → idempotência) e NADA roda: os quatro casos passariam por vacuidade. Foi o
		// que aconteceu na 1ª versão deste arquivo, e a sentinela do 3º caso
		// ("startContract PRECISA ter sido chamado") é o que expôs.
		contractCollection: { stage: "confirm" as const },
		qualifyAnswers: { creditMax: 90_000 },
	} as ConversationMetadata;
});

afterEach(() => vi.clearAllMocks());

describe("FIX-420 — WhatsApp não abre segunda proposta em outra administradora", () => {
	it("proposta RODOBENS registrada + fechamento apontando ITAÚ → NÃO chama startContract", async () => {
		mocks.getLatestBeviProposal.mockResolvedValue({ administradora: "RODOBENS" });

		await fireContract(WA, CONV);

		expect(
			mocks.startContract,
			"chamada aqui é consulta de bureau num CPF real — não pode acontecer",
		).not.toHaveBeenCalled();
		// E o cliente precisa ser AVISADO, não ficar no silêncio.
		expect(mocks.sendTextMessage).toHaveBeenCalledWith(WA, expect.stringContaining("RODOBENS"));
	});

	it("MESMA administradora (retry legítimo) → segue pro gateway", async () => {
		// A metade que impede o guard de matar o retry depois de um erro de rede.
		mocks.getLatestBeviProposal.mockResolvedValue({ administradora: "ITAU" });

		await fireContract(WA, CONV);

		expect(mocks.startContract).toHaveBeenCalled();
	});

	it("SEM proposta registrada → segue normalmente (primeiro fechamento)", async () => {
		// É a esmagadora maioria. Bloquear aqui mataria toda venda do canal.
		await fireContract(WA, CONV);

		expect(mocks.startContract).toHaveBeenCalled();
	});

	it("sem cota ancorada, o retry vai pra administradora JÁ REGISTRADA", async () => {
		// Paridade com `route.ts`: sem `contractOffer`, a preferência não pode ir
		// nula (o gateway sortearia por proximidade e poderia inaugurar uma segunda
		// marca). Vai a registrada — o retry repete o contrato que existe.
		mocks.getLatestBeviProposal.mockResolvedValue({ administradora: "ITAU" });

		await fireContract(WA, CONV);

		const input = mocks.startContract.mock.calls[0]?.[1] as { administradoraPreferida?: unknown };
		expect(input?.administradoraPreferida).toBe("ITAU");
	});
});
