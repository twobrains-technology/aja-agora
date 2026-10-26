import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractCpf } from "@/lib/conversation/telefone-ou-cpf";

// RE-A2 (reteste no dev, t6) — `messages.content` com CPF em claro.
//
// No caminho determinístico do fechamento a fala do cliente é gravada aqui, no
// processor, porque o turno é resolvido por código e nunca chega ao modelo: é o
// registro do aceite que o atendente lê depois. O que esta linha gravava era o TEXTO
// CRU — medido no dev, 6 das 10 conversas do reteste tinham a linha da mensagem com
// o CPF inteiro (`529.982.247-25 11 98765-4321`) enquanto o `metadata` estava limpo
// e o `lgpdAceite.fala` sem dígito. O vazamento era só na tabela `messages`.
//
// A única cópia persistida do CPF é a cifrada em `identityEnc`; o guarda de texto é
// `scrubCpf` (`agent/orchestrator/vazamento.ts`), o mesmo que já protege o último
// passe da fala do agente e o comprovante do aceite. O teste fecha o PONTO DE
// GRAVAÇÃO do processor: o telefone do cliente continua, o número sai.
//
// A decisão do estágio (`captureContractText`) é testada em `contract-capture.test.ts`
// — aqui o mock devolve só o veredito, porque o que se prova é o que o processor
// grava.

const estado = vi.hoisted(() => ({
	conversas: [] as Array<{ role: string; content: string }>,
	textos: [] as string[],
	fechamentos: [] as string[],
	decisao: { handled: false as boolean, outcome: "fire" as string },
}));

vi.mock("@/db", () => ({
	db: {
		query: {
			conversations: {
				findFirst: vi.fn(async () => ({ id: "conv-1", metadata: {} })),
			},
		},
	},
}));

// Só a I/O é trocada. Os predicados que decidem o caminho do processor continuam os
// reais (`detectBackIntent` e `ehPedidoDeOptout`, lidos por `await import`), senão o
// teste prova o mock, não o arquivo.
vi.mock("@/lib/llm/alerta-do-llm", () => ({ registrarFalhaDoLlm: vi.fn() }));
vi.mock("@/lib/utils/simulator-clock-wrap", () => ({
	withSimulatorClockIfNeeded: (_conv: unknown, fn: () => Promise<void>) => fn(),
}));

vi.mock("./api", () => ({
	sendTextMessage: vi.fn(async (_to: string, texto: string) => {
		estado.textos.push(texto);
		return { messageId: "wamid-1" };
	}),
	sendTypingIndicator: vi.fn(async () => {}),
}));
vi.mock("./conversation-lock", () => ({
	withConversationLock: (_from: string, fn: () => Promise<void>) => fn(),
}));
vi.mock("./adapter", () => ({
	processWithOrchestrator: vi.fn(async () => {}),
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
	getHandoffState: async () => null,
	handleAgentMessage: async () => false,
	handlePendingHandoffText: async () => false,
	isAttendantPhone: async () => false,
	relayUserToAgent: async () => false,
}));
vi.mock("./session", () => ({
	saveMessage: vi.fn(async (_convId: string, role: string, content: string) => {
		estado.conversas.push({ role, content });
		return "msg-1";
	}),
}));
vi.mock("./simulator-bus", () => ({
	isSimulatedWaId: () => false,
	publishToClient: vi.fn(),
}));

// O processor importa estes dois por `await import` — o mock vale para os dois.
vi.mock("./identify-capture", () => ({
	captureIdentifyText: vi.fn(async () => ({ handled: false })),
	respostaDoCaptureDeCpf: () => null,
}));
vi.mock("./contract-capture", () => ({
	captureContractText: vi.fn(async () => estado.decisao as { handled: boolean; outcome: never }),
	fireContract: vi.fn(async (_from: string, conversationId: string) => {
		estado.fechamentos.push(conversationId);
	}),
	CONTRACT_INVALID_CPF_REPLY: "confere os números",
	CONTRACT_CANCELLED_REPLY: "outras opções",
}));

function reset(): void {
	estado.conversas.length = 0;
	estado.textos.length = 0;
	estado.fechamentos.length = 0;
	estado.decisao = { handled: true, outcome: "fire" };
}

describe("RE-A2 — a fala do cliente gravada no caminho determinístico não leva CPF em claro", () => {
	beforeEach(reset);

	it("stage `cpf` com CPF e celular na mesma fala: o telefone continua, o número sai", async () => {
		const { processTextMessage } = await import("./processor");
		await processTextMessage("5511987654321", "529.982.247-25 11 98765-4321");

		// A fala continua registrada — é o registro do aceite que o atendente lê.
		expect(estado.conversas).toHaveLength(1);
		expect(estado.conversas[0].role).toBe("user");
		const gravado = estado.conversas[0].content;
		expect(gravado).not.toContain("52998224725");
		expect(gravado).not.toContain("529.982.247-25");
		// Nenhum formato do mesmo número pode sobreviver, e o celular do cliente é dele.
		expect(extractCpf(gravado)).toBeNull();
		expect(gravado).toContain("11 98765-4321");
		// O que sai é o número, não a fala: o atendente lê o comprovante e o telefone.
		expect(gravado).toBe("***.***.247-25 11 98765-4321");
		expect(estado.fechamentos).toEqual(["conv-1"]);
	});

	it("recusa com CPF na fala também grava sem número (a trava é no ponto de gravação)", async () => {
		estado.decisao = { handled: true, outcome: "cancel" };
		const { processTextMessage } = await import("./processor");
		await processTextMessage("5511987654321", "não quero, meu cpf era 52998224725");

		expect(estado.conversas).toHaveLength(1);
		const gravado = estado.conversas[0].content;
		expect(extractCpf(gravado)).toBeNull();
		expect(gravado).toContain("não quero");
	});

	it("fala sem CPF é gravada intacta — o guarda não reescreve o texto", async () => {
		estado.decisao = { handled: true, outcome: "finalize" };
		const { processTextMessage } = await import("./processor");
		await processTextMessage("5511987654321", "confirmo essa carta de R$ 1.010 por mês");

		expect(estado.conversas[0].content).toBe("confirmo essa carta de R$ 1.010 por mês");
	});

	it("fala sem valor de CPF e sem número não é tocada", async () => {
		estado.decisao = { handled: true, outcome: "invalid-cpf" };
		const { processTextMessage } = await import("./processor");
		await processTextMessage("5511987654321", "111.444.777-36");

		// DV errado: o número não é CPF, então não é mascarado — e não é CPF extraível.
		expect(estado.conversas[0].content).toBe("111.444.777-36");
		expect(extractCpf(estado.conversas[0].content)).toBeNull();
	});
});
