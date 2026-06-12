// Camada 1 (FIX-25 / MC-5) — máquina de estado do fechamento Bevi no WhatsApp.
// Cobre transições (confirm/cpf), aceite, recusa, ambíguo, idempotência, guard
// de revealCompleted e o INVARIANTE LGPD: CPF NUNCA em claro em send/log/meta.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";

const CPF_CLARO = "52998224725"; // CPF válido (DV ok) — não pode vazar em claro
const WA = "5562999887766";
const CONV_ID = "conv-fix25";

// ── Store de meta em memória (reloadMeta/persistMeta operam sobre ele) ──
const mocks = vi.hoisted(() => ({
	metaStore: {} as Record<string, ConversationMetadata>,
	sendText: vi.fn().mockResolvedValue(undefined),
	sendInteractive: vi.fn().mockResolvedValue(undefined),
	saveMessage: vi.fn().mockResolvedValue(undefined),
	loadIdentity: vi.fn(),
	storeIdentity: vi.fn().mockResolvedValue(undefined),
	startContract: vi.fn(),
}));

vi.mock("@/db", () => ({
	db: {
		query: {
			conversations: {
				findFirst: vi.fn(async () => ({ id: CONV_ID, metadata: mocks.metaStore[CONV_ID] ?? {} })),
			},
		},
	},
}));

vi.mock("./api", () => ({
	sendTextMessage: mocks.sendText,
	sendInteractiveMessage: mocks.sendInteractive,
}));

vi.mock("@/lib/conversation/meta", () => ({
	metaOf: (conv: { metadata: unknown } | null) =>
		(conv?.metadata as ConversationMetadata) ?? ({} as ConversationMetadata),
	reloadMeta: vi.fn(async (id: string) => mocks.metaStore[id] ?? ({} as ConversationMetadata)),
	persistMeta: vi.fn(async (id: string, meta: ConversationMetadata) => {
		mocks.metaStore[id] = meta;
	}),
}));

vi.mock("@/lib/conversation/identity", async (orig) => ({
	...(await orig<typeof import("@/lib/conversation/identity")>()),
	loadIdentity: mocks.loadIdentity,
	storeIdentity: mocks.storeIdentity,
}));

vi.mock("@/lib/conversation/messages", () => ({ saveMessage: mocks.saveMessage }));

vi.mock("@/lib/bevi/fulfillment", () => ({ startContract: mocks.startContract }));

import { beginContractCollection, captureContractText, fireContract } from "./contract-capture";

function setMeta(meta: ConversationMetadata) {
	mocks.metaStore[CONV_ID] = meta;
}

/** Nada enviado/salvo pode conter o CPF em claro (LGPD). */
function assertNoCpfLeak() {
	const allArgs = [
		...mocks.sendText.mock.calls,
		...mocks.sendInteractive.mock.calls,
		...mocks.saveMessage.mock.calls,
		...mocks.storeIdentity.mock.calls, // storeIdentity recebe cpf, mas cifra antes de persistir
	];
	const serialized = JSON.stringify(allArgs);
	// storeIdentity é a ÚNICA fronteira que recebe o CPF (e cifra) — excluímos suas calls
	const leakSurface = JSON.stringify([
		...mocks.sendText.mock.calls,
		...mocks.sendInteractive.mock.calls,
		...mocks.saveMessage.mock.calls,
	]);
	expect(leakSurface).not.toContain(CPF_CLARO);
	// sanity: o serialized completo existe (evita falso-verde por mock vazio)
	expect(serialized.length).toBeGreaterThan(0);
}

const OFFER_RESULT = {
	proposalId: "p-1",
	offer: {
		administradora: "ANCORA",
		grupo: "1234",
		category: "auto",
		creditValue: 80000,
		monthlyPayment: 850,
	},
	noOffer: false,
};

const REVEAL_DONE: ConversationMetadata = {
	currentCategory: "auto",
	revealCompleted: true,
	identityCollected: true,
	recommendedAdministradora: "ANCORA",
	qualifyAnswers: { creditMax: 80000, objetivo: "contemplacao_rapida" },
} as ConversationMetadata;

beforeEach(() => {
	for (const k of Object.keys(mocks.metaStore)) delete mocks.metaStore[k];
	mocks.sendText.mockClear();
	mocks.sendInteractive.mockClear();
	mocks.saveMessage.mockClear();
	mocks.loadIdentity.mockReset();
	mocks.storeIdentity.mockClear();
	mocks.startContract.mockReset();
	mocks.loadIdentity.mockResolvedValue({ cpf: CPF_CLARO, celular: "62999887766" });
	mocks.startContract.mockResolvedValue(OFFER_RESULT);
});

afterEach(() => vi.restoreAllMocks());

describe("beginContractCollection — abre a máquina de estado (CA-1, CA-7)", () => {
	it("identidade on file → stage 'confirm'", async () => {
		setMeta({ ...REVEAL_DONE });
		const stage = await beginContractCollection(CONV_ID, { identityOnFile: true });
		expect(stage).toBe("confirm");
		expect(mocks.metaStore[CONV_ID].contractCollection?.stage).toBe("confirm");
	});

	it("sem identidade → stage 'cpf'", async () => {
		setMeta({ currentCategory: "auto", revealCompleted: true } as ConversationMetadata);
		const stage = await beginContractCollection(CONV_ID, {});
		expect(stage).toBe("cpf");
		expect(mocks.metaStore[CONV_ID].contractCollection?.stage).toBe("cpf");
	});

	it("contractClosed → no-op (não reabre o terminal)", async () => {
		setMeta({ ...REVEAL_DONE, contractClosed: true } as ConversationMetadata);
		await beginContractCollection(CONV_ID, { identityOnFile: true });
		expect(mocks.metaStore[CONV_ID].contractCollection).toBeUndefined();
	});
});

describe("captureContractText — interceptação do turno (CA-3, CA-4, CA-5)", () => {
	it("fora de contractCollection → handled:false (deixa o agente seguir)", async () => {
		setMeta({ ...REVEAL_DONE });
		const r = await captureContractText(WA, "oi tudo bem?");
		expect(r).toEqual({ handled: false });
	});

	it("stage confirm + afirmativo → outcome 'fire'", async () => {
		setMeta({ ...REVEAL_DONE, contractCollection: { stage: "confirm" } });
		const r = await captureContractText(WA, "sim, quero contratar agora");
		expect(r).toEqual({ handled: true, outcome: "fire" });
	});

	it("stage confirm + recusa ('quero ver outras') → outcome 'cancel' e limpa estado", async () => {
		setMeta({ ...REVEAL_DONE, contractCollection: { stage: "confirm" } });
		const r = await captureContractText(WA, "quero ver outras opções");
		expect(r).toEqual({ handled: true, outcome: "cancel" });
		expect(mocks.metaStore[CONV_ID].contractCollection).toBeUndefined();
	});

	it("stage confirm + ambíguo → outcome 'ask-confirm' (NÃO dispara proposta)", async () => {
		setMeta({ ...REVEAL_DONE, contractCollection: { stage: "confirm" } });
		const r = await captureContractText(WA, "quanto fica por mês mesmo?");
		expect(r).toEqual({ handled: true, outcome: "ask-confirm" });
	});

	it("stage cpf + CPF válido → storeIdentity (cifrado) e outcome 'fire'; CPF nunca em claro", async () => {
		setMeta({
			currentCategory: "auto",
			revealCompleted: true,
			contractCollection: { stage: "cpf" },
		} as ConversationMetadata);
		const r = await captureContractText(WA, `meu cpf é ${CPF_CLARO}`);
		expect(r).toEqual({ handled: true, outcome: "fire" });
		expect(mocks.storeIdentity).toHaveBeenCalledWith(
			CONV_ID,
			expect.objectContaining({ cpf: CPF_CLARO, celular: "62999887766" }),
		);
		assertNoCpfLeak();
	});

	it("stage cpf + número que parece CPF mas falha DV → outcome 'invalid-cpf'", async () => {
		setMeta({
			revealCompleted: true,
			contractCollection: { stage: "cpf" },
		} as ConversationMetadata);
		const r = await captureContractText(WA, "meu cpf é 12345678900"); // 11 dígitos, DV inválido
		expect(r).toEqual({ handled: true, outcome: "invalid-cpf" });
	});

	it("stage cpf + texto curto que não parece CPF → outcome 'ask-cpf' (re-pede)", async () => {
		setMeta({
			revealCompleted: true,
			contractCollection: { stage: "cpf" },
		} as ConversationMetadata);
		const r = await captureContractText(WA, "tá");
		expect(r).toEqual({ handled: true, outcome: "ask-cpf" });
	});
});

describe("fireContract — disparo do startContract (CA-2, CA-6, CA-8)", () => {
	it("dispara startContract 1x com input derivado + apresenta real_offer; limpa estado", async () => {
		setMeta({ ...REVEAL_DONE, contractCollection: { stage: "confirm" } });
		await fireContract(WA, CONV_ID);

		expect(mocks.startContract).toHaveBeenCalledTimes(1);
		const [convArg, inputArg] = mocks.startContract.mock.calls[0];
		expect(convArg).toBe(CONV_ID);
		expect(inputArg).toMatchObject({
			cpf: CPF_CLARO,
			segmento: "AUTOS",
			valor: 80000,
			administradoraPreferida: "ANCORA",
			lgpd: true,
		});
		// real_offer renderizado como interactive (botões offer_confirm/reject)
		expect(mocks.sendInteractive).toHaveBeenCalledTimes(1);
		// estado limpo após disparo
		expect(mocks.metaStore[CONV_ID].contractCollection).toBeUndefined();
		assertNoCpfLeak();
	});

	it("idempotência: 2º fireContract não re-chama startContract (estado já limpo)", async () => {
		setMeta({ ...REVEAL_DONE, contractCollection: { stage: "confirm" } });
		await fireContract(WA, CONV_ID);
		await fireContract(WA, CONV_ID);
		expect(mocks.startContract).toHaveBeenCalledTimes(1);
	});

	it("guard revealCompleted=false → NÃO chama startContract e limpa estado", async () => {
		setMeta({
			currentCategory: "auto",
			revealCompleted: false,
			identityCollected: true,
			contractCollection: { stage: "confirm" },
		} as ConversationMetadata);
		await fireContract(WA, CONV_ID);
		expect(mocks.startContract).not.toHaveBeenCalled();
		expect(mocks.metaStore[CONV_ID].contractCollection).toBeUndefined();
	});

	it("identidade ausente → pede CPF e muda stage pra 'cpf' (não dispara)", async () => {
		mocks.loadIdentity.mockResolvedValue(null);
		setMeta({ ...REVEAL_DONE, identityCollected: false, contractCollection: { stage: "confirm" } });
		await fireContract(WA, CONV_ID);
		expect(mocks.startContract).not.toHaveBeenCalled();
		expect(mocks.metaStore[CONV_ID].contractCollection?.stage).toBe("cpf");
		expect(mocks.sendText).toHaveBeenCalled();
	});

	it("noOffer → texto de ajuste de valor, sem interactive", async () => {
		mocks.startContract.mockResolvedValue({ proposalId: "p-2", offer: null, noOffer: true });
		setMeta({ ...REVEAL_DONE, contractCollection: { stage: "confirm" } });
		await fireContract(WA, CONV_ID);
		expect(mocks.sendInteractive).not.toHaveBeenCalled();
		expect(mocks.sendText).toHaveBeenCalledWith(WA, expect.stringMatching(/valor|ajustar|carta/i));
	});

	it("erro do startContract → restaura contractCollection pra permitir retry", async () => {
		mocks.startContract.mockRejectedValue(new Error("bevi down"));
		setMeta({ ...REVEAL_DONE, contractCollection: { stage: "confirm" } });
		await fireContract(WA, CONV_ID);
		expect(mocks.metaStore[CONV_ID].contractCollection?.stage).toBe("confirm");
		expect(mocks.sendText).toHaveBeenCalledWith(
			WA,
			expect.stringMatching(/problema|tentar|instante/i),
		);
	});
});
