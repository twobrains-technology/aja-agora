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
			// FIX-48: fireContract resolve o leadId da conversa (getLeadIdForConversation)
			// pra vincular a proposta. Sem lead no fixture → null (paridade com o
			// comportamento anterior: a proposta nascia sem leadId).
			leads: {
				findFirst: vi.fn(async () => null),
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

	// FIX-357 — era `ask-confirm` (texto FIXO "Só pra confirmar: posso seguir?").
	// A pergunta do cliente evaporava. Pergunta não é resposta: vai pro MODELO.
	it("stage confirm + PERGUNTA → handled:false (o agente responde; NÃO dispara proposta)", async () => {
		setMeta({ ...REVEAL_DONE, contractCollection: { stage: "confirm" } });
		const r = await captureContractText(WA, "quanto fica por mês mesmo?");
		expect(r).toEqual({ handled: false });
	});

	// O bug exato do dossiê: "não" e "outra" soltos dentro de uma PERGUNTA faziam o
	// CANCEL_RE cancelar a contratação de quem só queria uma explicação.
	it("stage confirm + 'por que essa e não outra?' → NÃO cancela (é pergunta, não recusa)", async () => {
		setMeta({ ...REVEAL_DONE, contractCollection: { stage: "confirm" } });
		const r = await captureContractText(WA, "por que essa e não outra?");
		expect(r).toEqual({ handled: false });
		expect(
			mocks.metaStore[CONV_ID].contractCollection,
			"o fechamento não pode ser derrubado por uma pergunta — o passo continua pendente",
		).toEqual({ stage: "confirm" });
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

	// FIX-357 — era `ask-cpf` (re-pedia o CPF por texto fixo, sem chamar o modelo).
	// Sem CPF, `fireContract` não cria proposta nenhuma: o invariante não depende disto.
	it("stage cpf + texto que não é CPF → handled:false (o agente responde)", async () => {
		setMeta({
			revealCompleted: true,
			contractCollection: { stage: "cpf" },
		} as ConversationMetadata);
		const r = await captureContractText(WA, "tá");
		expect(r).toEqual({ handled: false });
	});
});

describe("fireContract — disparo do startContract (CA-2, CA-6, CA-8)", () => {
	it("dispara startContract 1x com input derivado + apresenta real_offer; fica aguardando o aceite", async () => {
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
		// O passo NÃO acaba aqui: a carta real está com o cliente esperando o
		// aceite, e ele pode responder por TEXTO em vez de tocar no botão. Antes o
		// estado era zerado e essa resposta caía no vazio — a venda não fechava.
		expect(mocks.metaStore[CONV_ID].contractCollection).toEqual({ stage: "offer-confirm" });
		assertNoCpfLeak();
	});

	it("FIX-39/40: oferta com prazo + lance médio → card WhatsApp carrega os dois (paridade web)", async () => {
		mocks.startContract.mockResolvedValue({
			proposalId: "p-1",
			offer: { ...OFFER_RESULT.offer, termMonths: 72, avgBidValue: 69_361.27 },
			noOffer: false,
		});
		// O lance médio só aparece pra quem entrou na conversa de lance — pra quem
		// nunca falou disso ele era um número solto ao lado da assinatura.
		setMeta({
			...REVEAL_DONE,
			contractCollection: { stage: "confirm" },
			qualifyAnswers: { ...REVEAL_DONE.qualifyAnswers, hasLance: "yes" },
		});
		await fireContract(WA, CONV_ID);

		expect(mocks.sendInteractive).toHaveBeenCalledTimes(1);
		const interactive = mocks.sendInteractive.mock.calls[0][1] as {
			body?: { text?: string };
		};
		const text = interactive.body?.text ?? "";
		expect(text).toMatch(/Prazo/i);
		expect(text).toMatch(/72\s*meses/i);
		expect(text).toMatch(/lance médio do grupo/i);
		expect(text).toMatch(/69\.361/);
		// rótulo honesto — sem promessa de contemplação no card
		expect(text).not.toMatch(/contempl|garant|chance/i);
	});

	// Regressão: quando o estágio `offer-confirm` foi criado (pra aceitar a
	// confirmação por texto), `contractCollection` deixou de ser zerado após o
	// disparo — e a guarda de idempotência, que só olhava a AUSÊNCIA do objeto,
	// passou a deixar o 2º disparo criar uma proposta DUPLICADA na administradora,
	// com nova consulta de bureau. Este teste é o que pegou.
	it("idempotência: 2º fireContract não re-chama startContract (já aguardando aceite)", async () => {
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
