// FIX-431 (P0 #3) — o CPF que o cliente OFERECE nunca pode ser recusado.
//
// Produção, WhatsApp, 2026-08-13, sessão `a68b1945`. O agente estava travado
// ("tive um problema na busca") e o cliente, tentando ajudar, perguntou:
// "Porque nao conseguiu? Precisou do cpf?" — e no turno seguinte digitou o CPF.
// O servidor deixou passar (`captureIdentifyText` devolve `handled:false`
// quando o gate corrente não é `identify`) e o modelo respondeu:
//
//     "Opa, não precisa compartilhar CPF comigo não! Isso fica seguro só
//      quando você for contratar, direto na plataforma."
//
// O dado que destravava a venda estava na tela e foi devolvido ao cliente. Dois
// turnos depois a conversa virou handoff para atendente humano.
//
// A causa não é a fala do modelo — ele seguiu a regra que recebeu. É o servidor
// só ter fechadura para o CPF no turno em que ELE pergunta. Enquanto
// `identityCollected` for falso, CPF válido é dado que a administradora exige:
// aceitar sempre é o invariante.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";

const CONV_ID = "conv-cpf-espontaneo";
const WA = "5561988887777";
/** DV válido — o guard tem que distinguir CPF de número qualquer. */
const CPF_VALIDO = "52998224725";

const mocks = vi.hoisted(() => ({
	metaStore: {} as Record<string, ConversationMetadata>,
	storeIdentity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/db", () => ({
	db: {
		query: {
			conversations: {
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

// `isValidCpf` fica REAL de propósito: o invariante sob teste é "CPF com DV
// válido entra, número qualquer não" — mockar o validador testaria o mock.
vi.mock("@/lib/conversation/identity", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/conversation/identity")>()),
	storeIdentity: mocks.storeIdentity,
}));

const { captureIdentifyText } = await import("./identify-capture");

/** O estado EXATO da S1 no momento em que o cliente ofereceu o CPF: funil
 *  preso no gate de valor, identidade não coletada, busca nunca autorizada. */
function metaDaSessaoPerdida(): ConversationMetadata {
	return {
		currentPersona: "auto",
		currentCategory: "auto",
		desireAsked: true,
		desireAnswered: true,
		motivationAsked: true,
		identityCollected: false,
		searchDispatched: false,
		qualifyAnswers: { creditMin: 214_200, desiredItem: "um BYD Song Premium" },
	} as ConversationMetadata;
}

beforeEach(() => {
	mocks.metaStore[CONV_ID] = metaDaSessaoPerdida();
	mocks.storeIdentity.mockClear();
});

describe("CPF oferecido fora do gate identify", () => {
	it("é capturado — não devolvido ao cliente (o caso da venda perdida)", async () => {
		const r = await captureIdentifyText(WA, CPF_VALIDO);

		expect(r).toEqual({ handled: true, outcome: "captured" });
		expect(mocks.storeIdentity).toHaveBeenCalledWith(
			CONV_ID,
			expect.objectContaining({ cpf: CPF_VALIDO }),
		);
	});

	it("o celular vem do próprio waId — o cliente não digita duas vezes", async () => {
		await captureIdentifyText(WA, CPF_VALIDO);
		expect(mocks.storeIdentity).toHaveBeenCalledWith(
			CONV_ID,
			expect.objectContaining({ celular: expect.stringContaining("988887777") }),
		);
	});

	it("CPF escrito com pontuação também vale", async () => {
		const r = await captureIdentifyText(WA, "meu cpf é 529.982.247-25");
		expect(r).toEqual({ handled: true, outcome: "captured" });
	});

	// A fechadura não pode virar porta: número que não é CPF continua sendo
	// assunto do modelo, senão o servidor sequestra a conversa.
	it("número que não é CPF segue para o modelo", async () => {
		const r = await captureIdentifyText(WA, "238");
		expect(r).toEqual({ handled: false });
		expect(mocks.storeIdentity).not.toHaveBeenCalled();
	});

	it("texto comum segue para o modelo", async () => {
		const r = await captureIdentifyText(WA, "e aí, achou alguma coisa?");
		expect(r).toEqual({ handled: false });
	});

	// Identidade já coletada: não recapturar (e não sobrescrever a existente).
	it("com identidade já coletada, não recaptura", async () => {
		mocks.metaStore[CONV_ID] = {
			...metaDaSessaoPerdida(),
			identityCollected: true,
		} as ConversationMetadata;
		const r = await captureIdentifyText(WA, CPF_VALIDO);
		expect(r).toEqual({ handled: false });
		expect(mocks.storeIdentity).not.toHaveBeenCalled();
	});
});

// Risco levantado na auditoria de 2026-08-13: a fechadura em QUALQUER gate
// aceita 11 dígitos com DV válido — e ~1% dos números de 11 dígitos passam no
// DV por acaso. Um celular ditado no meio da conversa viraria identidade
// persistida em silêncio, e a Bevi só reprovaria lá no fechamento.
//
// A trava: fora do gate de identidade, o CPF tem que vir com SINAL de que é um
// CPF — o cliente dizendo que é, ou a formatação de CPF. Número solto continua
// sendo assunto do modelo, como sempre foi.
describe("CPF-like fora do gate precisa de sinal", () => {
	// O caso REAL da sessão `a68b1945`: o cliente digitou o CPF sozinho, sem
	// escrever nada em volta. Exigir a palavra "CPF" quebraria justamente ele.
	it("CPF solto, sem palavra nenhuma em volta, VIRA identidade", async () => {
		const r = await captureIdentifyText(WA, "02134567880");
		expect(r).toEqual({ handled: true, outcome: "captured" });
	});

	it("com a palavra CPF, vira (é o caso da venda perdida)", async () => {
		const r = await captureIdentifyText(WA, `meu cpf é ${CPF_VALIDO}`);
		expect(r).toEqual({ handled: true, outcome: "captured" });
	});

	it("com a formatação de CPF, vira", async () => {
		const r = await captureIdentifyText(WA, "529.982.247-25");
		expect(r).toEqual({ handled: true, outcome: "captured" });
	});

	it("celular ditado com 11 dígitos não é sequestrado", async () => {
		const r = await captureIdentifyText(WA, "meu telefone é 61988887777");
		expect(r).toEqual({ handled: false });
	});
});
