import { beforeEach, describe, expect, it, vi } from "vitest";

// U1 da F2 — a fila de vendedores (P8): avisa os vendedores ativos SEM tocar
// status, sem prometer prazo e sem falar com o cliente. Nenhum envio real:
// `./api` e o banco são dublês, e a conversa do teste é simulada ou mockada.

const estado = vi.hoisted(() => ({
	atendentes: [] as { id: string; name: string; phone: string }[],
	conversa: {} as Record<string, unknown>,
	linhas: [] as Record<string, unknown>[],
	updates: [] as Record<string, unknown>[],
	inserts: [] as { tabela: unknown; values: unknown }[],
}));

vi.mock("@/db", () => ({
	db: {
		select: vi.fn(() => ({
			from: vi.fn(() => ({ where: vi.fn(async () => estado.atendentes) })),
		})),
		query: {
			conversations: {
				findFirst: vi.fn(async () => estado.conversa),
				findMany: vi.fn(async () => estado.linhas),
			},
			leads: { findFirst: vi.fn(async () => null) },
		},
		update: vi.fn(() => ({
			set: vi.fn((values: Record<string, unknown>) => {
				estado.updates.push(values);
				return { where: vi.fn(async () => {}) };
			}),
		})),
		insert: vi.fn((tabela: unknown) => ({
			values: vi.fn((values: unknown) => {
				estado.inserts.push({ tabela, values });
				const p = Promise.resolve([{ id: "lead-1" }]);
				return Object.assign(p, { returning: async () => [{ id: "lead-1" }] });
			}),
		})),
	},
}));

// `getHandoffState` registra o rastro da decisão (`proxy.ts`) — o dublê precisa
// cobrir o que o código sob teste usa, senão o mock vira o defeito.
vi.mock("@/lib/agent/quem-responde", () => ({
	quemRespondePara: vi.fn(async () => ({ quem: "agente", motivo: "sem-atendimento-aberto" })),
	rastroDaDecisao: vi.fn(),
}));
vi.mock("@/lib/admin/lead-stage-tracker", () => ({ applyTrackedStageToLead: vi.fn() }));
vi.mock("@/lib/admin/lead-transitions", () => ({ transitionLeadStage: vi.fn() }));
vi.mock("@/lib/eval/trigger", () => ({ triggerEvalScoring: vi.fn() }));
vi.mock("@/lib/chat/message-bus", () => ({ publishMessage: vi.fn() }));
vi.mock("./adapter", () => ({ runDirectiveWithOrchestrator: vi.fn() }));
vi.mock("./api", () => ({
	sendTextMessage: vi.fn(async () => ({ messageId: "wamid-1" })),
	sendImageMessage: vi.fn(),
	sendAudioMessage: vi.fn(),
	sendVideoMessage: vi.fn(),
	sendDocumentMessage: vi.fn(),
}));
vi.mock("./session", () => ({
	saveMessage: vi.fn(async () => "msg-1"),
	loadConversationHistory: vi.fn(async () => []),
}));
vi.mock("./meta-helpers", () => ({
	persistMeta: vi.fn(async () => {}),
	reloadMeta: vi.fn(async () => ({})),
}));
vi.mock("./simulator-bus", () => ({
	contarListenersDoAtendente: vi.fn(() => 0),
	publishToAttendant: vi.fn(),
}));

import { handoffNotifications } from "@/db/schema";
import { sendTextMessage } from "./api";
import {
	chamarFilaDeVendedores,
	filaDeVendedoresReal,
	handleAgentMessage,
	handoffToAgents,
	invalidateAttendantCache,
	listarEstadoDaFila,
	regravarMarcadorDaFila,
} from "./proxy";
import { saveMessage } from "./session";
import { publishToAttendant } from "./simulator-bus";

const ANA = { id: "u-ana", name: "Ana", phone: "5511911111111" };
const BETO = { id: "u-beto", name: "Beto", phone: "5511922222222" };
const ARGS = {
	conversationId: "conv-1",
	userName: "Carla",
	userWaId: "5511987654321",
	summary: "Quer carta de R$ 80 mil e tem dúvida sobre contemplação.",
};

/** Junta os pedaços de texto de um fragmento SQL do drizzle (sem ciclos). */
function textoDoSql(valor: unknown): string {
	const partes: string[] = [];
	const visitar = (v: unknown): void => {
		if (typeof v === "string") partes.push(v);
		else if (Array.isArray(v)) for (const x of v) visitar(x);
		else if (v && typeof v === "object" && "queryChunks" in v) {
			visitar((v as { queryChunks: unknown }).queryChunks);
		} else if (v && typeof v === "object" && "value" in v) {
			visitar((v as { value: unknown }).value);
		}
	};
	visitar(valor);
	return partes.join("");
}

const textosEnviadosAosVendedores = () =>
	vi.mocked(publishToAttendant).mock.calls.map((c) => String(c[1]));

beforeEach(() => {
	vi.clearAllMocks();
	invalidateAttendantCache();
	estado.atendentes = [ANA, BETO];
	estado.conversa = {
		id: "conv-1",
		isSimulated: false,
		status: "active",
		handedOffUserId: null,
		metadata: {},
	};
	estado.linhas = [];
	estado.updates = [];
	estado.inserts = [];
});

describe("chamarFilaDeVendedores", () => {
	it("avisa todos os vendedores e não fala com o cliente nem mexe no status", async () => {
		const r = await chamarFilaDeVendedores(ARGS);

		expect(r).toEqual({ notificados: 2, semAtendentes: false });
		const textos = textosEnviadosAosVendedores();
		expect(textos).toHaveLength(2);
		for (const t of textos) {
			expect(t).toContain("🔔");
			expect(t).toContain("Carla");
		}
		// Só os 2 envios aos vendedores: nenhum para o cliente.
		expect(sendTextMessage).toHaveBeenCalledTimes(2);
		expect(vi.mocked(sendTextMessage).mock.calls.map((c) => c[0])).not.toContain(ARGS.userWaId);
		expect(saveMessage).not.toHaveBeenCalled();
		for (const u of estado.updates) expect(u).not.toHaveProperty("status");
		// Não toca lead.
		expect(estado.inserts.filter((i) => i.tabela !== handoffNotifications)).toHaveLength(0);
	});

	it("conversa simulada: envio é simulado e não grava handoffNotifications", async () => {
		estado.conversa = { ...estado.conversa, isSimulated: true };

		await chamarFilaDeVendedores(ARGS);

		expect(sendTextMessage).not.toHaveBeenCalled();
		const opcoes = vi.mocked(publishToAttendant).mock.calls.map((c) => c[2]);
		expect(opcoes).toEqual([{ simulated: true }, { simulated: true }]);
		expect(estado.inserts.filter((i) => i.tabela === handoffNotifications)).toHaveLength(0);
	});

	it("conversa real grava handoffNotifications por vendedor", async () => {
		await chamarFilaDeVendedores(ARGS);
		await Promise.resolve();
		expect(estado.inserts.filter((i) => i.tabela === handoffNotifications)).toHaveLength(2);
	});

	it("sem vendedores: nada ao cliente, mas o marcador é gravado", async () => {
		estado.atendentes = [];

		const r = await chamarFilaDeVendedores(ARGS);

		expect(r).toEqual({ notificados: 0, semAtendentes: true });
		expect(sendTextMessage).not.toHaveBeenCalled();
		const marcador = estado.updates.find((u) => "metadata" in u);
		expect(marcador).toBeDefined();
		expect(textoDoSql(marcador?.metadata)).toContain("filaDeVendedores");
	});

	it("o marcador entra por merge SQL e a fila não promete prazo", async () => {
		const r = await chamarFilaDeVendedores(ARGS);

		const marcador = estado.updates.find((u) => "metadata" in u);
		expect(textoDoSql(marcador?.metadata)).toContain("filaDeVendedores");
		const tudo = [...textosEnviadosAosVendedores(), JSON.stringify(r)].join("\n");
		expect(tudo).not.toMatch(/instantes|em breve|minutos/i);
	});
});

describe("o claim da fila", () => {
	it("o vendedor que escreve assume a conversa ativa com marcador e a promove a handed_off", async () => {
		// O vendedor ainda não é dono de nenhuma conversa.
		estado.conversa = null as unknown as Record<string, unknown>;
		estado.linhas = [
			{
				id: "conv-1",
				channel: "whatsapp",
				waId: ARGS.userWaId,
				contactName: "Carla",
				isSimulated: true,
				status: "active",
				handedOffUserId: null,
				metadata: { filaDeVendedores: { chamadaEm: "2026-11-05T04:12:00.000Z" } },
			},
		];

		const tratado = await handleAgentMessage(ANA.phone, "Oi Carla, sou a Ana");

		expect(tratado).toBe(true);
		const claim = estado.updates.find((u) => u.handedOffUserId === ANA.id);
		expect(claim).toMatchObject({ status: "handed_off", handedOffUserId: ANA.id });
	});
});

describe("listarEstadoDaFila", () => {
	it("antes da chamada: sem data e sem dono; depois: data; com dono: o nome", async () => {
		estado.conversa = { id: "conv-1", handedOffUserId: null, metadata: {} };
		expect(await listarEstadoDaFila("conv-1")).toEqual({
			atendentesAtivos: 2,
			chamadaEm: null,
			assumidaPor: null,
		});

		estado.conversa = {
			id: "conv-1",
			handedOffUserId: null,
			metadata: { filaDeVendedores: { chamadaEm: "2026-11-05T04:12:00.000Z" } },
		};
		const depois = await listarEstadoDaFila("conv-1");
		expect(depois.chamadaEm).toEqual(new Date("2026-11-05T04:12:00.000Z"));
		expect(depois.assumidaPor).toBeNull();

		estado.conversa = { ...estado.conversa, handedOffUserId: ANA.id };
		const assumida = await listarEstadoDaFila("conv-1");
		expect(assumida.assumidaPor).toEqual({ id: ANA.id, nome: "Ana" });
	});
});

describe("filaDeVendedoresReal", () => {
	it("aponta para as duas funções reais", () => {
		expect(filaDeVendedoresReal.chamar).toBe(chamarFilaDeVendedores);
		expect(filaDeVendedoresReal.estado).toBe(listarEstadoDaFila);
	});
});

describe("regressão: handoffToAgents segue igual", () => {
	it("marca handed_off e manda a frase 'ele te chama aqui em instantes' ao cliente", async () => {
		await handoffToAgents("conv-1", ARGS.userWaId, "Carla", "resumo");

		expect(estado.updates[0]).toMatchObject({ status: "handed_off", handedOffUserId: null });
		const paraOCliente = vi
			.mocked(sendTextMessage)
			.mock.calls.filter((c) => c[0] === ARGS.userWaId)
			.map((c) => String(c[1]));
		expect(paraOCliente.join("\n")).toContain("ele te chama aqui em instantes");
	});
});

describe("regravarMarcadorDaFila", () => {
	const CHAMADA = new Date("2026-11-05T04:12:00.000Z");

	it("regrava o marcador por merge SQL, sem tocar status nem falar com ninguém", async () => {
		await regravarMarcadorDaFila("conv-1", CHAMADA);

		expect(estado.updates).toHaveLength(1);
		const [update] = estado.updates;
		expect(Object.keys(update)).toEqual(["metadata"]);
		const sqlTexto = textoDoSql(update.metadata);
		expect(sqlTexto).toContain("||");
		expect(sqlTexto).toContain("filaDeVendedores");
		expect(sqlTexto).toContain(CHAMADA.toISOString());
		expect(sendTextMessage).not.toHaveBeenCalled();
		expect(publishToAttendant).not.toHaveBeenCalled();
	});

	it("depois de a metadata ser sobrescrita, listarEstadoDaFila volta a ver chamadaEm", async () => {
		// persistMeta do turno apagou o marcador
		estado.conversa = { id: "conv-1", handedOffUserId: null, metadata: { outra: 1 } };
		expect((await listarEstadoDaFila("conv-1")).chamadaEm).toBeNull();

		await regravarMarcadorDaFila("conv-1", CHAMADA);

		// o dublê do banco aplica o JSON que o merge SQL carregaria
		const json =
			textoDoSql(estado.updates[0].metadata).match(/\{"filaDeVendedores".*\}\}/)?.[0] ?? "{}";
		estado.conversa = {
			...estado.conversa,
			metadata: { ...(estado.conversa.metadata as object), ...JSON.parse(json) },
		};
		expect((await listarEstadoDaFila("conv-1")).chamadaEm).toEqual(CHAMADA);
		expect((estado.conversa.metadata as { outra: number }).outra).toBe(1);
	});
});
