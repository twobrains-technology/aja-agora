// FIX-217 (Ata 2026-07-04, item 9 + inbox 2026-07-01-whatsapp-identify-gate) —
// no WhatsApp o gate "identify" virava texto solto IGNORÁVEL: o modelo podia
// narrar avanço/busca ("Bora ver o que encaixa na sua faixa") sem o CPF ter
// sido coletado, porque captureIdentifyText só interceptava texto que JÁ
// parecia um CPF — qualquer outra coisa (pergunta, tentativa de pular) caía
// direto no pipeline geral do agente (handled:false). Lei 4 (invariante crítico
// vira código, não regra-no-prompt): enquanto nextGate==="identify", TODO texto
// tem que ser interceptado — captured, invalid ou ask-cpf — nunca handled:false.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";

const CONV_ID = "conv-identify-fix217";
const WA = "5561988887777";
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

import { captureIdentifyText, identifyWhatsappPrompt, waIdToCelular } from "./identify-capture";

// O cenário declarado é o do FECHO, e ele só existe com a vitrine ligada — sem
// ela o `identify` volta a ser pré-busca e o teste provaria outro caminho.
// `vitest.setup.ts` zera estas envs por default (a suíte nasce sem vitrine).
const ENV_ORIGINAL = { ...process.env };

beforeEach(() => {
	process.env.VITRINE_CPF = "11144477735";
	process.env.VITRINE_CELULAR = "62992496793";
});

afterEach(() => {
	process.env = { ...ENV_ORIGINAL };
});

function setMeta(meta: ConversationMetadata) {
	mocks.metaStore[CONV_ID] = meta;
}

// FIX-296 (rodada 10, 2026-07-12): `credit` passou a preceder `identify` no
// funil (reversão consciente do FIX-53) — pra `nextGate` chegar genuinamente
// em `identify`, o valor do bem (`creditMax`) já precisa estar resolvido.
// 2026-08-27 — a vitrine tirou o `identify` de antes da busca: hoje o cliente vê
// as cartas com a identidade DA CASA e só entrega o CPF ao fechar. Para
// `nextGate` chegar genuinamente em `identify` (que é a condição de
// `captureIdentifyText` interceptar), o cenário agora é o do FECHO — reveal
// feito e cota escolhida. O que o teste cobre segue idêntico: durante o gate, o
// CPF é capturado pelo servidor e o DV é conferido.
const IDENTIFY_READY: ConversationMetadata = {
	desireAsked: true,
	experiencePrev: "first",
	qualifyConsented: true,
	identityCollected: false,
	searchDispatched: true,
	revealCompleted: true,
	experienceDispatched: true,
	escolha: { groupId: "g-1", origem: "mencao" },
	qualifyAnswers: { creditMax: 80_000, prazoMeses: 48, hasLance: "no" },
} as unknown as ConversationMetadata;

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

// FIX-357 — REVOGA o `ask-cpf` do FIX-217 (os testes abaixo eram o contrário disto).
//
// O FIX-217 mandava interceptar TODO texto durante o gate e reemitir o pedido do CPF
// sem nunca chamar o LLM. O teste que morava aqui chegava a se chamar "pergunta livre
// → ask-cpf, NÃO ABRE CONVERSA LIVRE": era um cadeado testando o cadeado. Ao vivo, o
// cliente perguntava e levava o mesmo pedido de CPF na cara — o agente bitolado.
//
// A Lei 4 foi invocada pro alvo errado. O invariante é sobre a AÇÃO ("não simule sem
// CPF"), não sobre a FALA ("não deixe o cliente perguntar") — e a ação JÁ está blindada
// em código, sem este regex: `tool-policy.ts` só entrega `search_groups` e os cards do
// reveal ao modelo quando `identityCollected === true`. Sem CPF o modelo não tem a
// ferramenta; não é regra que ele possa desobedecer.
describe("captureIdentifyText — o que NÃO é CPF vai pro MODELO (a fala é do modelo)", () => {
	const NAO_SAO_CPF = [
		"por que vocês precisam do meu CPF?",
		"isso é seguro? vocês guardam meus dados?",
		"acha logo os grupos pra mim",
		"oi",
	];

	for (const texto of NAO_SAO_CPF) {
		it(`"${texto}" → handled:false (quem responde é o agente, não um texto fixo)`, async () => {
			setMeta({ ...IDENTIFY_READY });
			const r = await captureIdentifyText(WA, texto);
			expect(
				r,
				"reemitir o pedido do CPF em cima de qualquer desvio é o antipadrão que o ADR 2026-07-13 revogou: o servidor falando no lugar do modelo",
			).toEqual({ handled: false });
		});
	}

	it("o CPF continua sendo capturado — o gate não virou sugestão", async () => {
		setMeta({ ...IDENTIFY_READY });
		const r = await captureIdentifyText(WA, `meu cpf é ${CPF_VALIDO}`);
		expect(r).toEqual({ handled: true, outcome: "captured" });
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

describe("identifyWhatsappPrompt() — celular NUNCA é pedido (paridade: celular = waId)", () => {
	it("pede CPF mas não menciona celular/telefone como algo a informar", () => {
		expect(identifyWhatsappPrompt().toLowerCase()).toMatch(/cpf/);
		expect(identifyWhatsappPrompt().toLowerCase()).not.toMatch(
			/(me (manda|passa|envia)|informe|preciso do?) (o )?(seu )?(celular|telefone|whatsapp)/,
		);
	});
});
