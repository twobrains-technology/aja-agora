// FIX-217 (Ata 2026-07-04, item 9 + inbox 2026-07-01-whatsapp-identify-gate) —
// no WhatsApp o gate "identify" virava texto solto IGNORÁVEL: o modelo podia
// narrar avanço/busca ("Bora ver o que encaixa na sua faixa") sem o CPF ter
// sido coletado, porque captureIdentifyText só interceptava texto que JÁ
// parecia um CPF — qualquer outra coisa (pergunta, tentativa de pular) caía
// direto no pipeline geral do agente (handled:false). Lei 4 (invariante crítico
// vira código, não regra-no-prompt): enquanto nextGate==="identify", TODO texto
// tem que ser interceptado — captured, invalid ou ask-cpf — nunca handled:false.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";

const CONV_ID = "conv-identify-fix217";
const WA = "5562992496793";
const CPF_VALIDO = "52998224725";

const mocks = vi.hoisted(() => ({
	metaStore: {} as Record<string, ConversationMetadata>,
	storeIdentity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/db", () => ({
	db: {
		query: {
			conversations: {
				// metaStore[CONV_ID] indefinido = "conversa não existe" (mock de findFirst).
				findFirst: vi.fn(async () =>
					mocks.metaStore[CONV_ID] !== undefined
						? { id: CONV_ID, metadata: mocks.metaStore[CONV_ID] }
						: undefined,
				),
			},
		},
	},
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
	storeIdentity: mocks.storeIdentity,
}));

import { captureIdentifyText, IDENTIFY_WHATSAPP_PROMPT, waIdToCelular } from "./identify-capture";

function setMeta(meta: ConversationMetadata) {
	mocks.metaStore[CONV_ID] = meta;
}

const IDENTIFY_READY: ConversationMetadata = {
	experiencePrev: "first",
	qualifyConsented: true,
	identityCollected: false,
} as ConversationMetadata;

beforeEach(() => {
	for (const k of Object.keys(mocks.metaStore)) delete mocks.metaStore[k];
	mocks.storeIdentity.mockClear();
});

describe("captureIdentifyText — CPF válido segue capturando normalmente", () => {
	it("CPF válido → captured, storeIdentity com celular via waId (nunca perguntado)", async () => {
		setMeta({ ...IDENTIFY_READY });
		const r = await captureIdentifyText(WA, `meu cpf é ${CPF_VALIDO}`);
		expect(r).toEqual({ handled: true, outcome: "captured" });
		expect(mocks.storeIdentity).toHaveBeenCalledWith(
			CONV_ID,
			expect.objectContaining({ cpf: CPF_VALIDO, celular: waIdToCelular(WA) }),
		);
	});

	it("número que parece CPF mas falha DV → invalid", async () => {
		setMeta({ ...IDENTIFY_READY });
		const r = await captureIdentifyText(WA, "meu cpf é 12345678900");
		expect(r).toEqual({ handled: true, outcome: "invalid" });
	});
});

describe("captureIdentifyText — FIX-217 gate forçado: nunca cai em handled:false durante o gate", () => {
	it("tentativa de pular ('acha logo os grupos') → ask-cpf, NUNCA handled:false", async () => {
		setMeta({ ...IDENTIFY_READY });
		const r = await captureIdentifyText(WA, "acha logo os grupos pra mim");
		expect(r).toEqual({ handled: true, outcome: "ask-cpf" });
	});

	it("pergunta livre ('por que precisam disso?') → ask-cpf, não abre conversa livre", async () => {
		setMeta({ ...IDENTIFY_READY });
		const r = await captureIdentifyText(WA, "por que vocês precisam do meu CPF?");
		expect(r).toEqual({ handled: true, outcome: "ask-cpf" });
	});

	it("texto vazio/curto sem cara de CPF → ask-cpf", async () => {
		setMeta({ ...IDENTIFY_READY });
		const r = await captureIdentifyText(WA, "oi");
		expect(r).toEqual({ handled: true, outcome: "ask-cpf" });
	});
});

describe("captureIdentifyText — fora do gate não intercepta (paridade com o resto do funil)", () => {
	it("identityCollected=true → handled:false (gate já fechado)", async () => {
		setMeta({ ...IDENTIFY_READY, identityCollected: true });
		const r = await captureIdentifyText(WA, "qualquer coisa");
		expect(r).toEqual({ handled: false });
	});

	it("nextGate ainda não é identify (ex.: falta consent) → handled:false", async () => {
		setMeta({ experiencePrev: "first" } as ConversationMetadata);
		const r = await captureIdentifyText(WA, "qualquer coisa");
		expect(r).toEqual({ handled: false });
	});

	it("conversa inexistente → handled:false", async () => {
		const r = await captureIdentifyText("5500000000000", "qualquer coisa");
		expect(r).toEqual({ handled: false });
	});
});

describe("IDENTIFY_WHATSAPP_PROMPT — celular NUNCA é pedido (paridade: celular = waId)", () => {
	it("pede CPF mas não menciona celular/telefone como algo a informar", () => {
		expect(IDENTIFY_WHATSAPP_PROMPT.toLowerCase()).toMatch(/cpf/);
		expect(IDENTIFY_WHATSAPP_PROMPT.toLowerCase()).not.toMatch(
			/(me (manda|passa|envia)|informe|preciso do?) (o )?(seu )?(celular|telefone|whatsapp)/,
		);
	});
});
