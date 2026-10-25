import { beforeEach, describe, expect, it, vi } from "vitest";

// Os cards foram emitidos por uma busca anterior: o que a conversa guardou é a
// única fonte que o clique pode usar.
const CARTA_NO_CARD = {
	id: "grp-canopus-1",
	administradora: "Canopus",
	category: "auto",
	creditValue: 80000,
	monthlyPayment: 700,
	termMonths: 120,
	contempladosMes: 5,
};

vi.mock("@/db", () => ({
	db: {
		query: {
			messages: {
				findMany: vi.fn(async () => [
					{ artifacts: [{ type: "comparison_table", payload: { groups: [CARTA_NO_CARD] } }] },
				]),
			},
		},
	},
}));

// Quem conversa com o modelo neste teste é uma CÂMARA: os handlers de clique
// existem para dizer ao vendedor o que acabou de acontecer e o que ele tem de
// fazer — o que este arquivo confere é a INSTRUÇÃO que sai daqui, não a fala.
const despacho = vi.hoisted(() => ({
	diretivas: [] as string[],
}));

vi.mock("./adapter", () => ({
	runDirectiveWithOrchestrator: vi.fn(async (args: { directive: string }) => {
		despacho.diretivas.push(args.directive);
	}),
	fireGate: vi.fn(async () => {}),
	runTransitionWithOrchestrator: vi.fn(async () => {}),
}));

/** A meta da conversa que o clique lê — `identityCollected` muda o que a
 * diretiva de fechamento pede (formulário que coleta × confirmação de 1 clique). */
const metaDaConversa = vi.hoisted(() => ({
	atual: {} as Record<string, unknown>,
}));

vi.mock("@/db", () => ({
	db: {
		query: {
			messages: {
				findMany: vi.fn(async () => [
					{ artifacts: [{ type: "comparison_table", payload: { groups: [CARTA_NO_CARD] } }] },
				]),
			},
			conversations: {
				findFirst: vi.fn(async () => ({ metadata: metaDaConversa.atual })),
			},
		},
	},
}));

vi.mock("./session", () => ({
	getOrCreateConversation: vi.fn(async () => ({ id: "conv-1", isNew: false })),
}));
vi.mock("@/lib/conversation/messages", () => ({ saveMessage: vi.fn(async () => "msg-1") }));
vi.mock("./api", () => ({
	sendTextMessage: vi.fn(async () => ({ messageId: "wamid-1" })),
	sendInteractiveMessage: vi.fn(async () => ({ messageId: "wamid-2" })),
}));
vi.mock("@/lib/conversation/meta", () => ({
	metaOf: (conv: { metadata: unknown } | null | undefined) =>
		(conv?.metadata ?? {}) as Record<string, unknown>,
	persistMeta: vi.fn(async () => {}),
}));
vi.mock("./proxy", () => ({
	getHandoffState: vi.fn(async () => null),
	startInterestHandoff: vi.fn(async () => {}),
}));
vi.mock("@/lib/agent/aceite", () => ({
	aplicarAceiteEstruturado: vi.fn(async ({ meta }: { meta: Record<string, unknown> }) => ({
		meta,
		efeito: "escolha-ancorada",
	})),
}));
vi.mock("@/lib/conversation/cards", () => ({
	ultimoQuickReply: vi.fn(async () => ({ options: [{ groupId: "grp-canopus-1" }] })),
	registrarCardEnviado: vi.fn(async () => "msg-2"),
}));
vi.mock("./quick-reply-tap", () => ({
	cotaDoTapDeAtalho: vi.fn(() => "grp-canopus-1"),
}));

const PROPOSTA = {
	url: "https://tb-dev-aja-agora.twobrainstechnology.com/api/proposta/p-1",
	urlAssinada:
		"https://s3.amazonaws.com/ajapropostas/p-1.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=300",
};

describe("o fecho do WhatsApp manda a proposta UMA vez, pelo link estável", () => {
	it("o envio é o link /api/proposta/<id>, não a URL assinada do S3", async () => {
		const { urlDeEnvioDaProposta } = await import("./interactive-handlers");
		const url = urlDeEnvioDaProposta(PROPOSTA);
		expect(url).toBe(PROPOSTA.url);
		// A assinada expira em 5 minutos: quem abre depois vê AccessDenied.
		expect(url).not.toMatch(/X-Amz-Expires/);
	});

	it("sem proposta não há envio (o fecho segue sem o beat)", async () => {
		const { urlDeEnvioDaProposta } = await import("./interactive-handlers");
		expect(urlDeEnvioDaProposta(null)).toBeNull();
	});
});

describe("o clique na carta usa a carta que a conversa MOSTROU", () => {
	it("group_/simulate_/whatif_ resolvem a cota pelo card persistido", async () => {
		const { cartaDaConversa } = await import("./interactive-handlers");
		const carta = await cartaDaConversa("conv-1", "grp-canopus-1");
		expect(carta).not.toBeNull();
		// Os NÚMEROS são os do card — não de uma busca nova (que poderia devolver
		// outra carta e ancorar uma cota que o cliente nunca viu).
		expect(carta?.administradora).toBe("Canopus");
		expect(carta?.creditValue).toBe(80000);
		expect(carta?.monthlyPayment).toBe(700);
		expect(carta?.termMonths).toBe(120);
	});

	it("cota que a conversa não mostrou não é inventada", async () => {
		const { cartaDaConversa } = await import("./interactive-handlers");
		expect(await cartaDaConversa("conv-1", "grp-que-nunca-apareceu")).toBeNull();
	});
});

// P161/P179/P181 — o clique de fechamento no WhatsApp tem de levar a uma diretiva
// que PEDE o formulário (ou a proposta, que é o passo seguinte). Na main o
// `contract_form` era emitido pelo nó `emitCard` (`nodes/emit-card.ts:510`); no
// vendedor livre o card só chega à tela pelo `mostrar_card` que o MODELO chama.
// Enquanto a diretiva dizia "o sistema pede os dados logo depois da sua fala",
// `qr_*`, `decision_contratar` e `interest_*` ancoravam a cota e terminavam sem
// formulário nenhum na tela — a conversa morria em "só preciso de uns dados".
const CARD_DE_FECHAMENTO = {
	administradora: "Canopus",
	creditValue: 80000,
	monthlyPayment: 700,
	termMonths: 120,
	groupId: "grp-canopus-1",
};

const clique = async (replyId: string, meta: Record<string, unknown>) => {
	metaDaConversa.atual = {
		currentCategory: "auto",
		recommendedAdministradora: "Canopus",
		recommendedOffer: { ...CARD_DE_FECHAMENTO },
		...meta,
	};
	const { dispatchInteractiveReply } = await import("./interactive-handlers");
	const processTextMessage = vi.fn(async () => {});
	const tratado = await dispatchInteractiveReply({
		from: "5511987654321",
		replyId,
		replyTitle: "Tenho interesse",
		processTextMessage,
	});
	return { tratado, diretiva: despacho.diretivas.at(-1) ?? "" };
};

describe("o clique de fechamento pede o formulário ao vendedor livre", () => {
	beforeEach(() => {
		despacho.diretivas.length = 0;
	});

	for (const replyId of ["decision_contratar", "interest_grp-canopus-1"]) {
		it(`${replyId}: a diretiva manda MOSTRAR o card contract_form`, async () => {
			const { tratado, diretiva } = await clique(replyId, {});
			expect(tratado).toBe(true);
			expect(diretiva).toContain("mostrar_card");
			expect(diretiva).toContain('"contract_form"');
			// Sem identidade no sistema, o formulário é o que COLETA os dados.
			expect(diretiva).toContain("coleta os dados dele");
		});

		it(`${replyId}: com a identidade já no sistema, o card é a confirmação e a proposta é o caminho curto`, async () => {
			const { tratado, diretiva } = await clique(replyId, { identityCollected: true });
			expect(tratado).toBe(true);
			expect(diretiva).toContain('"contract_form"');
			expect(diretiva).toContain("JÁ estão no sistema desta conversa");
			expect(diretiva).toContain("fazer_proposta");
		});
	}

	it("qr_<índice>: o atalho de resposta leva à mesma diretiva de fecho", async () => {
		const { tratado, diretiva } = await clique("qr_0", {});
		expect(tratado).toBe(true);
		expect(diretiva).toContain("ESCOLHEU uma cota");
		expect(diretiva).toContain("mostrar_card");
		expect(diretiva).toContain('"contract_form"');
	});
});
