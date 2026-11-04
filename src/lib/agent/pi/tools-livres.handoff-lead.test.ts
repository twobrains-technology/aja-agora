// O CASO DA MESA VAI COM O CONTATO QUE O AGENTE CAPTUROU.
//
// Defeito reportado pelo dono na call de 18:36 (27/10/2026): *"no clique 'quero que o
// atendente assuma' a transferência perde nome e telefone do lead — eu não salvei nada dele
// aqui"*. `mesa_handoffs` guarda só `leadId`: o nome e o telefone que o atendente vê no
// dossiê são lidos do LEAD (`broadcastCaseToAttendants` → `lead.name`/`lead.phone`,
// `src/lib/whatsapp/mesa/outbound.ts`). Se o handoff do vendedor livre abre o caso sem
// gravar o contato no lead, o caso chega anônimo na mesa.
//
// O desenho do fluxo de transferência NÃO muda (Bruna pediu para segurar mudança de fluxo):
// o que muda é o DADO acompanhar o caso.
//
// As fronteiras externas são dubladas (banco, contato unificado, mesa, identidade,
// histórico); a régua do que chega ao lead é a de produção (`saveContactName` e
// `garantirLeadDoFecho` reais). Sem o conserto, o telefone do lead fica nulo.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { leads } from "@/db/schema";

const mocks = vi.hoisted(() => ({
	leadFindFirst: vi.fn(),
	atualizar: vi.fn(),
	criarLead: vi.fn(),
	attachContact: vi.fn(async () => undefined),
	sincronizarNomeDoContato: vi.fn(async () => null),
	abrirCasoNaMesa: vi.fn(),
	loadConversationHistory: vi.fn(),
	loadIdentity: vi.fn(),
	reloadMeta: vi.fn(),
	persistMeta: vi.fn(),
}));

vi.mock("@/db", () => ({
	db: {
		query: {
			leads: { findFirst: mocks.leadFindFirst },
			conversations: { findFirst: async () => null },
		},
		update: (tabela: unknown) => ({
			set: (valores: Record<string, unknown>) => ({
				where: async () => {
					await mocks.atualizar(tabela, valores);
				},
			}),
		}),
	},
}));
vi.mock("@/lib/admin/lead-stage-tracker", () => ({ createLeadFromConversation: mocks.criarLead }));
vi.mock("@/lib/contacts", () => ({ attachContact: mocks.attachContact }));
vi.mock("@/lib/contacts/sincronizar-nome", () => ({
	sincronizarNomeDoContato: mocks.sincronizarNomeDoContato,
}));
vi.mock("@/lib/conversions/registry", () => ({ registrarLeadIdentificado: vi.fn() }));
vi.mock("@/lib/conversation/meta", () => ({
	reloadMeta: mocks.reloadMeta,
	persistMeta: mocks.persistMeta,
}));
vi.mock("@/lib/conversation/messages", () => ({
	loadConversationHistory: mocks.loadConversationHistory,
}));
vi.mock("@/lib/conversation/identity", () => ({ loadIdentity: mocks.loadIdentity }));
vi.mock("@/lib/bevi/proposal-repo", () => ({ getLatestBeviProposal: vi.fn(async () => null) }));
vi.mock("@/lib/bevi/pessoa", () => ({
	pessoaDaConversa: vi.fn(async () => null),
	ultimaPropostaDaPessoa: vi.fn(async () => null),
}));
vi.mock("@/lib/bevi/proposal-status", () => ({ checkProposalStatus: vi.fn() }));
vi.mock("@/lib/bevi/fulfillment", () => ({
	fechoJaConcluido: () => false,
	startContract: vi.fn(),
}));
vi.mock("@/lib/agent/orchestrator/choose-offer", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/agent/orchestrator/choose-offer")>()),
	listShownOffersForConversation: vi.fn(async () => []),
}));
// Só a abertura do caso é dublada: `clientePedeHumano` é o código REAL.
vi.mock("@/lib/agent/pi/handoff", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/agent/pi/handoff")>()),
	abrirCasoNaMesa: mocks.abrirCasoNaMesa,
}));

import { buildToolsLivres, type ContextoDasTools } from "./tools-livres";

const CPF = "11144477735";
const CELULAR = "11987654321";

type LeadGravado = {
	id: string;
	conversationId: string;
	name: string | null;
	phone: string | null;
};

/** O LEAD da conversa, como o banco o guardaria: é dele que a mesa lê nome e telefone. */
let leadDaConversa: LeadGravado | null = null;
/** Cada `createLeadFromConversation` chamado, na ordem — a linha criada de verdade. */
let leadsCriados: Array<{ conversationId: string; name: string | null; phone: string | null }> = [];

function ctxDoTurno(over: Partial<ContextoDasTools> = {}): ContextoDasTools {
	return {
		conversationId: "conv-handoff-lead",
		channel: "web",
		userText: "quero falar com um atendente",
		nomeDoCliente: null,
		cards: [],
		falasDoFecho: [],
		cartasNaTela: [],
		gruposRevelados: new Map(),
		pediuHumano: false,
		estadoDepoisDaBusca: null,
		...over,
	};
}

function falarComHumano(ctx: ContextoDasTools): Promise<string> {
	const tools = buildToolsLivres(ctx) as unknown as Record<
		string,
		{ execute: (input: unknown, opts: unknown) => Promise<unknown> }
	>;
	const tool = tools.falar_com_humano;
	if (!tool) throw new Error("a tool falar_com_humano não existe");
	return tool
		.execute({ motivo: "o cliente pediu uma pessoa" }, { toolCallId: "call-1", messages: [] })
		.then(String);
}

beforeEach(() => {
	vi.clearAllMocks();
	leadDaConversa = null;
	leadsCriados = [];
	mocks.leadFindFirst.mockImplementation(async () => leadDaConversa);
	mocks.criarLead.mockImplementation(
		async (args: { conversationId: string; name: string | null; phone: string | null }) => {
			leadsCriados.push(args);
			leadDaConversa = { id: `lead-${leadsCriados.length}`, ...args };
			return { leadId: leadDaConversa.id, isSimulated: false };
		},
	);
	// O UPDATE só muda a linha do lead; `conversations` (contactName) é outra tabela.
	mocks.atualizar.mockImplementation(async (tabela: unknown, valores: Record<string, unknown>) => {
		if (tabela === leads && leadDaConversa) leadDaConversa = { ...leadDaConversa, ...valores };
	});
	mocks.abrirCasoNaMesa.mockResolvedValue({ ok: true, motivo: "caso-aberto", handoffId: "h-1" });
	mocks.reloadMeta.mockResolvedValue({ currentCategory: "auto", qualifyAnswers: {} });
	mocks.persistMeta.mockResolvedValue(undefined);
	mocks.loadConversationHistory.mockResolvedValue([]);
	mocks.loadIdentity.mockResolvedValue({ cpf: CPF, celular: CELULAR });
});

describe("o caso da mesa leva o nome e o telefone já capturados", () => {
	it("nome dito num turno anterior + telefone da conversa: o lead do caso tem os dois", async () => {
		mocks.loadConversationHistory.mockResolvedValue([
			{ role: "user", content: "oi, meu nome é Mário" },
			{ role: "assistant", content: "Prazer, Mário!" },
			{ role: "user", content: "meu whatsapp é 11 98765-4321" },
		]);

		await falarComHumano(ctxDoTurno());

		expect(mocks.abrirCasoNaMesa).toHaveBeenCalledTimes(1);
		// O defeito medido: o lead que o atendente abre no dossiê chegava sem nome/telefone.
		expect(leadDaConversa).toMatchObject({ name: "Mário", phone: CELULAR });
	});

	it("lead que já existia só com o telefone recebe o nome dito na conversa", async () => {
		leadDaConversa = {
			id: "lead-antigo",
			conversationId: "conv-handoff-lead",
			name: null,
			phone: CELULAR,
		};

		await falarComHumano(ctxDoTurno({ userText: "quero falar com uma pessoa. sou o Mário" }));

		expect(leadDaConversa).toMatchObject({ id: "lead-antigo", name: "Mário", phone: CELULAR });
		// Mesmo telefone não regrava o lead (nada de linha suja a cada handoff).
		expect(leadsCriados).toHaveLength(0);
	});

	it("o CPF não vai para o caso — o dossiê da mesa leva nome e telefone, só", async () => {
		await falarComHumano(ctxDoTurno({ userText: "quero falar com uma pessoa. sou a Helena" }));

		expect(JSON.stringify(leadDaConversa)).not.toContain(CPF);
		expect(JSON.stringify(mocks.abrirCasoNaMesa.mock.calls)).not.toContain(CPF);
	});

	it("no WhatsApp o telefone é o da conversa: não se pede de novo nem se perde no caso", async () => {
		mocks.loadIdentity.mockResolvedValue(null);

		await falarComHumano(
			ctxDoTurno({
				channel: "whatsapp",
				waId: "5511987654321",
				userText: "quero falar com um atendente",
				nomeDoCliente: "Mário",
			}),
		);

		// O waId chega com DDI no WhatsApp; o lead guarda o canônico (normalizePhoneBR).
		expect(leadDaConversa).toMatchObject({ name: "Mário", phone: "11987654321" });
	});
});
