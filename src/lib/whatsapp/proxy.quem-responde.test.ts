import { beforeEach, describe, expect, it, vi } from "vitest";

// O ESTADO DO MEIO — o que o WhatsApp não sabia enxergar.
//
// `getHandoffState` transformava os três estados de `quemRespondePara` em dois:
// qualquer coisa que fosse atendimento virava `isHandedOff: true`, o processor só
// relaya ao humano e NUNCA roda turno. Com o caso ABERTO e ninguém assumindo, o
// cliente escrevia e não recebia nada (o worker N1 acolhe no máximo duas vezes, com
// 6 h de espera entre elas). É o mesmo beco do chat web, com outra roupa.
//
// O segundo defeito era de nome: o atendente que escrevia sem ter conversa recebia
// "*Outro consultor* já está atendendo" — gente que não existe. O estado carrega o
// nome REAL de quem assumiu (`users.name` / `mesa_attendants.nome`), e sem nome
// resolvido a frase é neutra.
//
// O que este arquivo prova: os três estados com o nome real, o rastro saindo uma vez
// por decisão, e o fim do nome inventado. A decisão em si (`quemRespondePara`) tem
// teste próprio; aqui ela é a ENTRADA do dublê.

const estado = vi.hoisted(() => ({
	decisao: null as unknown,
	conversa: null as unknown,
	atendentes: [] as { id: string; name: string; phone: string }[],
	todasAsConversas: [] as Record<string, unknown>[],
}));

vi.mock("@/db", () => ({
	db: {
		select: vi.fn(() => ({
			from: vi.fn(() => ({ where: vi.fn(async () => estado.atendentes) })),
		})),
		query: {
			conversations: {
				findFirst: vi.fn(async () => estado.conversa),
				findMany: vi.fn(async () => estado.todasAsConversas),
			},
			leads: { findFirst: vi.fn(async () => null) },
		},
		update: vi.fn(() => ({
			set: vi.fn(() => ({ where: vi.fn(async () => {}) })),
		})),
	},
}));

// Só a DECISÃO é trocada: `rastroDaDecisao` e `agenteCalaAposRelay` continuam os
// reais, senão o teste provaria o mock.
vi.mock("@/lib/agent/quem-responde", async (importOriginal) => {
	const real = await importOriginal<typeof import("@/lib/agent/quem-responde")>();
	return { ...real, quemRespondePara: vi.fn(async () => estado.decisao) };
});

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

import { getHandoffState, handleAgentMessage, invalidateAttendantCache } from "./proxy";
import { publishToAttendant } from "./simulator-bus";

const CLAUDIA = { id: "u-claudia", name: "Cláudia Prado", phone: "5511933334444" };
const BETO = { id: "u-beto", name: "Beto", phone: "5511955556666" };

/** A conversa do ATENDIMENTO — a que o atendente tem aberta na tela. */
const conversaDoCaso = {
	id: "conv-caso-9",
	waId: "5511987654321",
	contactName: "Carla",
	isSimulated: false,
	handedOffUserId: null as string | null,
};

beforeEach(() => {
	vi.clearAllMocks();
	invalidateAttendantCache();
	estado.decisao = null;
	estado.conversa = { ...conversaDoCaso };
	estado.atendentes = [];
	estado.todasAsConversas = [];
});

describe("getHandoffState — os três estados de quem responde", () => {
	it("vendedor assumiu: isHandedOff true e o NOME REAL de quem atende", async () => {
		estado.decisao = {
			quem: "humano",
			conversationId: "conv-caso-9",
			dono: { tipo: "vendedor", userId: CLAUDIA.id, nome: CLAUDIA.name },
			handedOffUserId: CLAUDIA.id,
		};
		estado.conversa = { ...conversaDoCaso, handedOffUserId: CLAUDIA.id };

		const state = await getHandoffState("5511987654321");

		expect(state).toMatchObject({
			isHandedOff: true,
			conversationId: "conv-caso-9",
			handedOffUserId: CLAUDIA.id,
			dono: { tipo: "vendedor", nome: "Cláudia Prado" },
			contactName: "Carla",
		});
		expect(state?.semDono).toBeUndefined();
	});

	it("mesa assumiu: dono de mesa com o nome do atendente, sem vendedor apontado", async () => {
		estado.decisao = {
			quem: "humano",
			conversationId: "conv-caso-9",
			dono: { tipo: "mesa", attendantId: "ma-1", handoffId: "ho-9", nome: "Juna" },
			handedOffUserId: null,
		};

		const state = await getHandoffState("5511987654321");

		expect(state).toMatchObject({
			isHandedOff: true,
			dono: { tipo: "mesa", nome: "Juna" },
			handedOffUserId: null,
		});
	});

	it("caso aberto e ninguém assumiu: NÃO é atendimento humano, e o caso vem em `semDono`", async () => {
		estado.decisao = {
			quem: "atendimento-sem-dono",
			conversationId: "conv-caso-9",
			handoffId: "ho-9",
		};

		const state = await getHandoffState("5511987654321");

		// O booleano é o que calava o agente: não pode ser true sem dono.
		expect(state?.isHandedOff).toBe(false);
		expect(state?.semDono).toEqual({ conversationId: "conv-caso-9", handoffId: "ho-9" });
		expect(state?.dono).toBeUndefined();
		// Sem dono é sem dono — não se aponta um vendedor que não assumiu.
		expect(state?.handedOffUserId).toBeNull();
		// Os metadados de exibição vêm da conversa do caso.
		expect(state?.contactName).toBe("Carla");
	});

	it("sem atendimento aberto: isHandedOff false, sem `semDono`, na conversa do canal", async () => {
		estado.decisao = { quem: "agente", motivo: "sem-atendimento-aberto" };
		estado.conversa = { ...conversaDoCaso, id: "conv-do-canal", status: "active" };

		const state = await getHandoffState("5511987654321");

		expect(state).toMatchObject({
			isHandedOff: false,
			conversationId: "conv-do-canal",
			contactName: "Carla",
		});
		expect(state?.semDono).toBeUndefined();
		expect(state?.dono).toBeUndefined();
	});

	it("sem conversa nenhuma, devolve null — e mesmo assim registra a decisão", async () => {
		estado.decisao = { quem: "agente", motivo: "sem-atendimento-aberto" };
		estado.conversa = null;
		const info = vi.spyOn(console, "info").mockImplementation(() => {});

		expect(await getHandoffState("5511987654321")).toBeNull();

		expect(info).toHaveBeenCalledTimes(1);
		const rastro = JSON.parse(String(info.mock.calls[0][0]));
		expect(rastro).toMatchObject({ source: "quem-responde", quem: "agente" });
		info.mockRestore();
	});
});

describe("o rastro da decisão sai UMA vez por decisão", () => {
	const rastroDe = async (decisao: unknown) => {
		estado.decisao = decisao;
		const info = vi.spyOn(console, "info").mockImplementation(() => {});
		await getHandoffState("5511987654321");
		expect(info).toHaveBeenCalledTimes(1);
		const rastro = JSON.parse(String(info.mock.calls[0][0]));
		info.mockRestore();
		return rastro;
	};

	it('sem dono: o motivo diz "caso-ativo-sem-dono" e não há nome de dono', async () => {
		const rastro = await rastroDe({
			quem: "atendimento-sem-dono",
			conversationId: "conv-caso-9",
			handoffId: "ho-9",
		});
		expect(rastro).toMatchObject({
			canal: "whatsapp",
			conversation_id: "conv-caso-9",
			quem: "atendimento-sem-dono",
			motivo: "caso-ativo-sem-dono",
			dono_nome: null,
			handoff_id: "ho-9",
		});
	});

	it("com dono: o rastro leva o nome real de quem atende", async () => {
		const rastro = await rastroDe({
			quem: "humano",
			conversationId: "conv-caso-9",
			dono: { tipo: "vendedor", userId: CLAUDIA.id, nome: CLAUDIA.name },
			handedOffUserId: CLAUDIA.id,
		});
		expect(rastro).toMatchObject({
			quem: "humano",
			motivo: "assumido-pelo-vendedor",
			dono_tipo: "vendedor",
			dono_nome: "Cláudia Prado",
		});
	});
});

describe("o atendente nunca lê o nome de alguém que não existe", () => {
	/** BETO escreve e não tem conversa; a única conversa em atendimento pertence a
	 * `donoId` — que pode ou não estar na lista de atendentes ATIVOS. */
	const escritaDoAtendente = async (donoId: string) => {
		estado.decisao = { quem: "agente", motivo: "sem-atendimento-aberto" };
		estado.conversa = null;
		estado.todasAsConversas = [
			{
				id: "conv-da-ana",
				channel: "whatsapp",
				waId: "5511987654321",
				contactName: "Carla",
				isSimulated: false,
				status: "handed_off",
				handedOffUserId: donoId,
			},
		];
		await handleAgentMessage(BETO.phone, "oi");
		return vi
			.mocked(publishToAttendant)
			.mock.calls.map((c) => String(c[1]))
			.join("\n");
	};

	it("com o dono na lista ativa: o aviso diz o nome REAL de quem assumiu", async () => {
		estado.atendentes = [BETO, CLAUDIA];

		const aviso = await escritaDoAtendente(CLAUDIA.id);

		expect(aviso).toContain("Cláudia Prado");
		expect(aviso).toContain("Carla");
	});

	it("sem o dono na lista ativa: frase neutra — não se inventa consultor", async () => {
		estado.atendentes = [BETO];

		const aviso = await escritaDoAtendente("u-desativado");

		expect(aviso).toContain("outra pessoa do time");
		expect(aviso).not.toContain("Outro consultor");
		expect(aviso).not.toContain("Consultor");
	});
});
