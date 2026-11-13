import { beforeEach, describe, expect, it, vi } from "vitest";

// O BECO DO WHATSAPP — caso aberto, ninguém assumiu, e o cliente escrevendo no vazio.
//
// `processor.ts` perguntava só `handoff?.isHandedOff` e, sendo verdade, só relaya ao
// humano e retornava. Como `getHandoffState` dizia "humano" para qualquer
// atendimento — inclusive o caso `aberto` que nenhum atendente assumiu — o turno
// nunca rodava: o cliente mandava mensagem e não recebia nada (o worker N1 acolhe no
// máximo duas vezes, com 6 h entre elas). Contra P0, a conversa não morre aqui.
//
// O que este arquivo prova:
//   (i)  sem dono: o relay à fila ACONTECE **e** o turno da acolhida ACONTECE, e o
//        agente não cala;
//   (ii) a acolhida é contada no metadata da conversa do caso, para o worker N1 não
//        repetir;
//   (iii) humano com vendedor sem entrega: `agenteCalaAposRelay` é false e o turno
//        segue o fluxo normal, em vez de calar (OC-31).
//
// O que NÃO se testa aqui: o texto da diretiva (é de `mesa/acolhida-n1.ts`) e a
// decisão de quem responde (é de `agent/quem-responde.ts`).

const estado = vi.hoisted(() => ({
	handoff: null as unknown,
	entregue: false,
	meta: {} as Record<string, unknown>,
	diretivas: [] as { conversationId: string; directive: string; guardEmptyTurn?: boolean }[],
	turnos: [] as string[],
	persistidos: [] as Array<{ conversationId: string; meta: Record<string, unknown> }>,
}));

vi.mock("@/db", () => ({
	db: {
		query: {
			conversations: {
				findFirst: vi.fn(async () => ({ id: "conv-caso-9", metadata: estado.meta })),
			},
		},
	},
}));

vi.mock("@/lib/conversation/meta", () => ({
	metaOf: (conv: { metadata: unknown } | null | undefined) =>
		(conv?.metadata ?? {}) as Record<string, unknown>,
	persistMeta: vi.fn(async (conversationId: string, meta: Record<string, unknown>) => {
		estado.persistidos.push({ conversationId, meta });
		estado.meta = meta;
	}),
	reloadMeta: vi.fn(async () => estado.meta),
}));

// A proposta vem do banco no caminho real; aqui é entrada.
vi.mock("@/lib/workers/acolhida-n1-cycle", () => ({
	propostaDaConversa: vi.fn(async () => ({
		administradora: "Canopus",
		creditValue: 80_000,
		monthlyPayment: 700,
		termMonths: 120,
	})),
}));

vi.mock("@/lib/llm/alerta-do-llm", () => ({ registrarFalhaDoLlm: vi.fn() }));
vi.mock("@/lib/utils/simulator-clock-wrap", () => ({
	withSimulatorClockIfNeeded: (_conv: unknown, fn: () => Promise<void>) => fn(),
}));
vi.mock("./adapter", () => ({
	processWithOrchestrator: vi.fn(async (_from: string, text: string) => {
		estado.turnos.push(text);
	}),
	runDirectiveWithOrchestrator: vi.fn(
		async (args: {
			conversationId: string;
			directive: string;
			guardEmptyTurn?: boolean;
		}) => {
			estado.diretivas.push({
				conversationId: args.conversationId,
				directive: args.directive,
				guardEmptyTurn: args.guardEmptyTurn,
			});
		},
	),
}));
vi.mock("./api", () => ({
	sendTextMessage: vi.fn(async () => ({ messageId: "wamid-1" })),
	sendTypingIndicator: vi.fn(async () => {}),
}));
vi.mock("./conversation-lock", () => ({
	withConversationLock: (_from: string, fn: () => Promise<void>) => fn(),
}));
vi.mock("./interactive-handlers", () => ({ dispatchInteractiveReply: vi.fn(async () => true) }));
vi.mock("./mesa/claim", () => ({ isMesaClaimReply: () => false }));
vi.mock("./mesa/routing", () => ({
	isMesaAttendantPhone: async () => false,
	handleMesaClaim: vi.fn(async () => {}),
	handleMesaCopilot: vi.fn(async () => {}),
}));
vi.mock("./once", () => ({ claimButtonClick: vi.fn(async () => true) }));
vi.mock("./proxy", () => ({
	getHandoffState: vi.fn(async () => estado.handoff),
	handleAgentMessage: vi.fn(async () => false),
	handlePendingHandoffText: vi.fn(async () => false),
	isAttendantPhone: vi.fn(async () => false),
	relayUserToAgent: vi.fn(async () => estado.entregue),
}));
vi.mock("./session", () => ({ saveMessage: vi.fn(async () => "msg-1") }));
vi.mock("./simulator-bus", () => ({
	isSimulatedWaId: () => false,
	publishToClient: vi.fn(),
}));
vi.mock("./identify-capture", () => ({
	captureIdentifyText: vi.fn(async () => ({ handled: false })),
	respostaDoCaptureDeCpf: () => null,
}));
vi.mock("./contract-capture", () => ({
	captureContractText: vi.fn(async () => ({ handled: false, outcome: "fire" })),
	fireContract: vi.fn(async () => {}),
	CONTRACT_INVALID_CPF_REPLY: "confere os números",
	CONTRACT_CANCELLED_REPLY: "outras opções",
}));

import { processTextMessage } from "./processor";
import { relayUserToAgent } from "./proxy";

const FROM = "5511987654321";
const TEXTO = "Oi! Bom dia, consegue me ajudar?";

/** A decisão crua que `getHandoffState` devolve junto do estado. */
const semDono = {
	isHandedOff: false,
	conversationId: "conv-caso-9",
	handedOffUserId: null,
	semDono: { conversationId: "conv-caso-9", handoffId: "ho-9" },
	contactName: "Carla",
	isSimulated: false,
	decisao: {
		quem: "atendimento-sem-dono",
		conversationId: "conv-caso-9",
		handoffId: "ho-9",
	},
};

const comDono = (tipo: "vendedor" | "mesa") => ({
	isHandedOff: true,
	conversationId: "conv-caso-9",
	handedOffUserId: tipo === "vendedor" ? "u-claudia" : null,
	dono: { tipo, nome: tipo === "vendedor" ? "Cláudia Prado" : "Juna" },
	contactName: "Carla",
	isSimulated: false,
	decisao:
		tipo === "vendedor"
			? {
					quem: "humano",
					conversationId: "conv-caso-9",
					dono: { tipo: "vendedor", userId: "u-claudia", nome: "Cláudia Prado" },
					handedOffUserId: "u-claudia",
				}
			: {
					quem: "humano",
					conversationId: "conv-caso-9",
					dono: { tipo: "mesa", attendantId: "ma-1", handoffId: "ho-9", nome: "Juna" },
					handedOffUserId: null,
				},
});

beforeEach(() => {
	vi.clearAllMocks();
	estado.handoff = null;
	estado.entregue = false;
	estado.meta = { searchDispatched: true };
	estado.diretivas.length = 0;
	estado.turnos.length = 0;
	estado.persistidos.length = 0;
});

describe("atendimento SEM DONO: a conversa não morre", () => {
	it("tenta entregar à fila E roda o turno de acolhida — não cala", async () => {
		estado.handoff = semDono;
		estado.entregue = false; // ninguém da fila recebeu: é justamente o caso

		await processTextMessage(FROM, TEXTO);

		// (i) a fila continua sendo avisada — é tentativa, não decisão.
		expect(relayUserToAgent).toHaveBeenCalledWith(FROM, TEXTO);
		// (ii) o turno ACONTECE, com a diretiva da acolhida, na conversa do caso.
		expect(estado.diretivas).toHaveLength(1);
		const [acolhida] = estado.diretivas;
		expect(acolhida.conversationId).toBe("conv-caso-9");
		expect(acolhida.directive).toContain("NINGUÉM assumiu o caso ainda");
		expect(acolhida.directive).toContain("Sua tarefa neste turno é SÓ acolher");
		// Com proposta registrada, o único número que ela pode citar está lá.
		expect(acolhida.directive).toContain("R$ 80.000");
		// Turno mudo é o silêncio de novo: o guard manda o fallback honesto.
		expect(acolhida.guardEmptyTurn).toBe(true);
		// O turno de VENDA não roda: a voz aqui é da acolhida.
		expect(estado.turnos).toHaveLength(0);
	});

	it("conta a acolhida no metadata ANTES de disparar, para o worker N1 não repetir", async () => {
		estado.handoff = semDono;

		await processTextMessage(FROM, TEXTO);

		expect(estado.persistidos).toHaveLength(1);
		const [{ conversationId, meta }] = estado.persistidos;
		expect(conversationId).toBe("conv-caso-9");
		const acolhidaN1 = meta.acolhidaN1 as { attempts: number; lastAt: number };
		expect(acolhidaN1.attempts).toBe(0); // quem CONTA é o worker; aqui só se marca
		expect(typeof acolhidaN1.lastAt).toBe("number");
		// O resto da metadata do caso continua de pé.
		expect(meta.searchDispatched).toBe(true);
	});

	it("mesmo com a fila avisada, o agente não cala: acolhe e segue", async () => {
		estado.handoff = semDono;
		estado.entregue = true;

		await processTextMessage(FROM, TEXTO);

		expect(relayUserToAgent).toHaveBeenCalledTimes(1);
		expect(estado.diretivas).toHaveLength(1);
	});
});

describe("atendimento COM dono: cala só depois de a mensagem sair", () => {
	it("vendedor sem entrega: o turno do agente ACONTECE em vez de calar (OC-31)", async () => {
		estado.handoff = comDono("vendedor");
		estado.entregue = false;

		await processTextMessage(FROM, TEXTO);

		expect(relayUserToAgent).toHaveBeenCalledWith(FROM, TEXTO);
		// Ninguém foi avisado: calar aqui deixaria o cliente falando sozinho.
		expect(estado.turnos).toEqual([TEXTO]);
		expect(estado.diretivas).toHaveLength(0);
	});

	it("vendedor com entrega: cala — o turno do agente não roda", async () => {
		estado.handoff = comDono("vendedor");
		estado.entregue = true;

		await processTextMessage(FROM, TEXTO);

		expect(relayUserToAgent).toHaveBeenCalledTimes(1);
		expect(estado.turnos).toHaveLength(0);
		expect(estado.diretivas).toHaveLength(0);
		expect(estado.persistidos).toHaveLength(0);
	});

	it("mesa: cala SEMPRE — o caso é dela e o painel é onde o dono vê", async () => {
		estado.handoff = comDono("mesa");
		estado.entregue = false;

		await processTextMessage(FROM, TEXTO);

		expect(relayUserToAgent).toHaveBeenCalledTimes(1);
		expect(estado.turnos).toHaveLength(0);
		expect(estado.diretivas).toHaveLength(0);
	});
});

describe("sem atendimento aberto: nada muda", () => {
	it("o turno normal do vendedor roda e nenhuma acolhida é disparada", async () => {
		estado.handoff = {
			isHandedOff: false,
			conversationId: "conv-do-canal",
			handedOffUserId: null,
			contactName: "Carla",
			isSimulated: false,
			decisao: { quem: "agente", motivo: "sem-atendimento-aberto" },
		};

		await processTextMessage(FROM, TEXTO);

		expect(relayUserToAgent).not.toHaveBeenCalled();
		expect(estado.turnos).toEqual([TEXTO]);
		expect(estado.diretivas).toHaveLength(0);
		expect(estado.persistidos).toHaveLength(0);
	});
});
