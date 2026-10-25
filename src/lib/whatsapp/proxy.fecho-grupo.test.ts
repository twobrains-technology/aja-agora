import { beforeEach, describe, expect, it, vi } from "vitest";

// P112/P179/P181 — o atalho determinístico de "quero fechar" por TEXTO no
// WhatsApp monta a diretiva de fecho aqui, fora do grafo. Sem o `groupId` da
// carta em mãos, o `contract_form` saía sem `administradora` (o montador resolve
// a carta pelo id, `cards-livres.ts`) e o caminho curto `fazer_proposta` ficava
// dependendo de o modelo copiar o id do histórico da busca.
const CARTA_EM_FOCO = {
	administradora: "Canopus",
	creditValue: 80_000,
	termMonths: 120,
	monthlyPayment: 700,
	groupId: "grp-em-foco",
};

/** O que a conversa tem no banco: a meta do momento do "quero fechar". */
const metaDaConversa = vi.hoisted(() => ({
	atual: {} as Record<string, unknown>,
}));

/** A menção de administradora/cota que o resolvedor devolve para o texto. */
const mencionada = vi.hoisted(() => ({
	atual: null as null | {
		groupId?: string;
		administradora?: string;
		creditValue?: number;
		termMonths?: number;
		monthlyPayment?: number;
	},
}));

/** Quem conversa com o modelo neste teste é uma CÂMARA: o que importa é a
 * INSTRUÇÃO que sai do proxy, não a fala. */
const despacho = vi.hoisted(() => ({
	diretivas: [] as string[],
}));

vi.mock("@/db", () => ({
	db: {
		query: {
			conversations: {
				findFirst: vi.fn(async () => ({
					id: "conv-1",
					waId: "5511987654321",
					contactName: null,
					isSimulated: false,
					metadata: metaDaConversa.atual,
				})),
				findMany: vi.fn(async () => []),
			},
		},
		update: vi.fn(() => ({
			set: vi.fn(() => ({ where: vi.fn(async () => {}) })),
		})),
	},
}));

vi.mock("@/lib/agent/quem-responde", () => ({
	quemRespondePara: vi.fn(async () => ({ quem: "agente", motivo: "sem-atendimento-aberto" })),
}));

vi.mock("./adapter", () => ({
	runDirectiveWithOrchestrator: vi.fn(async (args: { directive: string }) => {
		despacho.diretivas.push(args.directive);
	}),
}));

vi.mock("./api", () => ({
	sendTextMessage: vi.fn(async () => ({ messageId: "wamid-1" })),
	sendImageMessage: vi.fn(async () => ({ messageId: "wamid-2" })),
	sendAudioMessage: vi.fn(async () => ({ messageId: "wamid-3" })),
	sendVideoMessage: vi.fn(async () => ({ messageId: "wamid-4" })),
	sendDocumentMessage: vi.fn(async () => ({ messageId: "wamid-5" })),
}));

vi.mock("./session", () => ({
	saveMessage: vi.fn(async () => "msg-1"),
	loadConversationHistory: vi.fn(async () => []),
}));

vi.mock("./meta-helpers", () => ({
	persistMeta: vi.fn(async () => {}),
	reloadMeta: vi.fn(async () => metaDaConversa.atual),
}));

vi.mock("@/lib/agent/orchestrator/choose-offer", () => ({
	resolveAdministradoraMentionForConversation: vi.fn(async () => mencionada.atual),
}));

async function fecharPorTexto(
	texto: string,
	meta: Record<string, unknown>,
): Promise<string | undefined> {
	metaDaConversa.atual = { searchDispatched: true, ...meta };
	despacho.diretivas.length = 0;
	const { handlePendingHandoffText } = await import("./proxy");
	const tratado = await handlePendingHandoffText("5511987654321", texto);
	expect(tratado).toBe(true);
	return despacho.diretivas.at(-1);
}

describe("o fecho por texto do WhatsApp leva o groupId da carta", () => {
	beforeEach(() => {
		mencionada.atual = null;
	});

	it("sem menção resolvida, vale a carta em foco na conversa", async () => {
		const diretiva = await fecharPorTexto("quero fechar", {
			recommendedAdministradora: "Canopus",
			recommendedOffer: { ...CARTA_EM_FOCO },
		});
		expect(diretiva).toContain('"contract_form"');
		expect(diretiva).toContain('payload {"groupId":"grp-em-foco"}');
	});

	it("com a cota NOMEADA na frase, o id é o dela — não o da carta em foco", async () => {
		// A escolha por menção não troca a administradora (mesma Canopus, outra
		// cota): a meta não é re-ancorada, então o único lugar onde o id nomeado
		// existe é a própria menção resolvida.
		mencionada.atual = {
			groupId: "grp-canopus-2",
			administradora: "Canopus",
			creditValue: 60_000,
			termMonths: 100,
			monthlyPayment: 620,
		};
		const diretiva = await fecharPorTexto("a da Canopus me atende, bora fechar", {
			recommendedAdministradora: "Canopus",
			recommendedOffer: { ...CARTA_EM_FOCO },
		});
		expect(diretiva).toContain('payload {"groupId":"grp-canopus-2"}');
	});

	it("sem carta nenhuma, não inventa id — pede a que está na tela", async () => {
		const diretiva = await fecharPorTexto("quero fechar", {
			recommendedAdministradora: "Canopus",
			recommendedOffer: {
				administradora: "Canopus",
				creditValue: 80_000,
				termMonths: 120,
				monthlyPayment: 700,
			},
		});
		expect(diretiva).toContain("o groupId da carta que está na tela");
		expect(diretiva).not.toMatch(/payload \{"groupId"/);
	});
});
