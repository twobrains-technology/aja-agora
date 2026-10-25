// @vitest-environment happy-dom
// P276/P294 — A RECEPÇÃO HUMANA ABRE NO HANDOFF DO TURNO, SEM RELOAD.
//
// Na `main` quem virava o chat para o atendimento era o `refreshHandoff` do
// formulário de lead (`lead-form.tsx:93`), chamado depois do POST que abria o
// caso. No vendedor livre o caso nasce no meio do turno: `falar_com_humano` →
// `abrirCasoNaMesa` grava `conversations.status = "handed_off"` e o
// `web/adapter.ts` escreve o part `data-handoff` no stream. Se o provider não
// tratar esse part, o estado local fica em `active`, a conexão SSE de
// `/api/chat/stream` nunca abre e a resposta do atendente só aparece depois de
// recarregar a página.
//
// O que estes testes prendem é o caminho REAL do evento: o `onData` do `useChat`
// recebe o part que o adapter escreveu, e daí saem (1) o estado `handed_off`,
// (2) o `EventSource` da recepção e (3) a mensagem do atendente na conversa.
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatProvider, type HandoffState, useChatContext } from "./provider";

// ── o `useChat` de verdade não roda num teste de componente ──────────────────
// O hook é substituído pelo mínimo que o provider consome: mensagens em estado
// React (para a bolha do atendente re-renderizar) e o `config` entregue ao hook,
// de onde sai o `onData` real do provider.
const ia = vi.hoisted(() => ({
	config: null as null | { onData: (part: { type: string; data: unknown }) => void },
	ctx: null as null | ReturnType<typeof useChatContext>,
}));

vi.mock("@ai-sdk/react", async () => {
	const React = await import("react");
	return {
		useChat: (config: { onData: (part: { type: string; data: unknown }) => void }) => {
			ia.config = config;
			const [messages, setMessages] = React.useState<unknown[]>([]);
			const [status] = React.useState("ready");
			const sendMessage = React.useCallback(async () => {}, []);
			return {
				messages,
				setMessages,
				status,
				error: undefined,
				sendMessage,
				regenerate: async () => {},
				stop: () => {},
				clearError: () => {},
			};
		},
	};
});

vi.mock("@/lib/heatmap/chat", () => ({
	chatConversaConhecida: vi.fn(),
	chatEnviou: vi.fn(),
	chatRecebeu: vi.fn(),
}));

/** O servidor de mentira: é ele que responde `/api/conversations/:id/status`. */
const servidor: { status: HandoffState["status"]; agentName: string | null; consultas: string[] } =
	{
		status: "active",
		agentName: null,
		consultas: [],
	};

/** O `EventSource` da recepção. Guarda cada conexão aberta e deixa o teste
 * empurrar os eventos que o endpoint SSE mandaria. */
class EventSourceFalso {
	static readonly CONNECTING = 0;
	static readonly OPEN = 1;
	static readonly CLOSED = 2;
	static conexoes: EventSourceFalso[] = [];

	url: string;
	readyState = EventSourceFalso.OPEN;
	closed = false;
	onmessage: ((e: { data: string }) => void) | null = null;
	onerror: (() => void) | null = null;

	constructor(url: string) {
		this.url = url;
		EventSourceFalso.conexoes.push(this);
	}

	close() {
		this.closed = true;
		this.readyState = EventSourceFalso.CLOSED;
	}

	receber(payload: unknown) {
		this.onmessage?.({ data: JSON.stringify(payload) });
	}
}

function Sonda() {
	ia.ctx = useChatContext();
	return null;
}

async function montar() {
	render(
		<ChatProvider>
			<Sonda />
		</ChatProvider>,
	);
	// A consulta de status do mount é o que prova que o provider está vivo.
	await waitFor(() => expect(servidor.consultas.length).toBe(1));
}

/** O part que o `web/adapter.ts` escreve no case `handoff`. */
function chegaOHandoff() {
	act(() => {
		ia.config?.onData({ type: "data-handoff", data: { reason: "pedido do cliente" } });
	});
}

beforeEach(() => {
	servidor.status = "active";
	servidor.agentName = null;
	servidor.consultas = [];
	EventSourceFalso.conexoes = [];
	vi.stubGlobal("EventSource", EventSourceFalso);
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string) => {
			servidor.consultas.push(String(url));
			return {
				ok: true,
				json: async () => ({ status: servidor.status, agentName: servidor.agentName }),
			};
		}),
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("ChatProvider — recepção humana pelo evento do handoff (P276/P294)", () => {
	it("o data-handoff vira handed_off na hora e abre o SSE, sem recarregar", async () => {
		await montar();
		expect(ia.ctx?.handoff.status).toBe("active");
		expect(EventSourceFalso.conexoes).toHaveLength(0);

		// O caso já foi gravado na mesa quando o part chega (o tool roda antes do
		// evento sair do servidor).
		servidor.status = "handed_off";
		servidor.agentName = "Bruna";

		chegaOHandoff();

		// Síncrono ao evento: a pessoa vê a conversa trocar de mãos sem esperar
		// o round-trip do status.
		expect(ia.ctx?.handoff.status).toBe("handed_off");

		await waitFor(() => expect(EventSourceFalso.conexoes).toHaveLength(1));
		const conversa = ia.ctx?.conversationId;
		expect(EventSourceFalso.conexoes[0].url).toBe(`/api/chat/stream?conversationId=${conversa}`);

		// O servidor reconcilia e traz o nome de quem assumiu.
		await waitFor(() => expect(ia.ctx?.handoff.agentName).toBe("Bruna"));
		expect(servidor.consultas.filter((u) => u.includes("/status")).length).toBeGreaterThan(1);
	});

	it("a resposta do atendente chega pela conexão aberta, sem reload", async () => {
		await montar();
		servidor.status = "handed_off";
		servidor.agentName = "Bruna";
		chegaOHandoff();
		await waitFor(() => expect(EventSourceFalso.conexoes).toHaveLength(1));

		const conexao = EventSourceFalso.conexoes[0];
		act(() => {
			conexao.receber({ type: "connected", status: "handed_off", agentName: "Bruna" });
		});
		act(() => {
			conexao.receber({
				type: "message",
				message: {
					id: "msg-da-bruna",
					role: "assistant",
					content: "Oi! Aqui é a Bruna, do atendimento.",
					agentName: "Bruna",
					createdAt: "2026-10-25T12:00:00.000Z",
				},
			});
		});

		await waitFor(() => expect(ia.ctx?.messages).toHaveLength(1));
		const recebida = ia.ctx?.messages[0];
		expect(recebida?.role).toBe("assistant");
		expect(recebida?.parts).toEqual([
			{ type: "text", text: "Oi! Aqui é a Bruna, do atendimento." },
		]);
		// A conexão segue viva: é por ela que o resto da conversa humana chega.
		expect(conexao.closed).toBe(false);
	});

	it("sem caso na mesa o status do servidor desfaz a transição e a recepção fecha", async () => {
		await montar();

		// Sem nome não há caso: `abrirCasoNaMesa` devolve `sem-lead`, o turno emite
		// o handoff mesmo assim e o banco continua `active`. Quem manda é o servidor.
		chegaOHandoff();
		expect(ia.ctx?.handoff.status).toBe("handed_off");

		await waitFor(() => expect(ia.ctx?.handoff.status).toBe("active"));
		// A conexão otimista existe (foi aberta no evento) mas não fica aberta:
		// ninguém do outro lado, e a próxima mensagem é do vendedor de novo.
		await waitFor(() => {
			expect(EventSourceFalso.conexoes.every((c) => c.closed)).toBe(true);
		});
	});

	it("os outros parts do turno não mexem no handoff", async () => {
		await montar();

		act(() => {
			ia.config?.onData({ type: "data-tool", data: { tool: "keepalive" } });
			ia.config?.onData({ type: "data-artifact", data: { type: "comparison_table", payload: {} } });
		});

		expect(ia.ctx?.handoff.status).toBe("active");
		expect(EventSourceFalso.conexoes).toHaveLength(0);
	});

	it("conversa que já está com a mesa abre a recepção ao montar", async () => {
		servidor.status = "handed_off";
		servidor.agentName = "Bruna";
		await montar();

		await waitFor(() => expect(EventSourceFalso.conexoes).toHaveLength(1));
		expect(ia.ctx?.handoff.agentName).toBe("Bruna");
	});
});
