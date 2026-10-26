import { describe, expect, it, vi } from "vitest";

// "Outras opções"/rejeição no WhatsApp (L45 lado zap, P177 P178 P185): o handler
// NÃO monta a lista e NÃO faz busca própria — ele entrega a meta da conversa ao
// `buildOtherOptions` (que é quem tem o filtro e a exclusão da recomendada, comum
// ao web). O que este teste prova é o que é do CANAL: a carta que o cliente já
// viu como recomendada não reaparece no comparativo, e a busca sai com o filtro
// que a conversa já tinha (não com um orçamento novo).

/** As três ofertas REAIS que a descoberta da conversa guardou. A primeira é a
 * recomendada (mesmos números do `recommendedOffer` da meta); as outras duas são
 * as que o cliente deve ver. */
const GRUPOS = [
	{
		id: "grp-canopus-1",
		administradora: "Canopus",
		category: "auto",
		creditValue: 80000,
		monthlyPayment: 700,
		termMonths: 120,
	},
	{
		id: "grp-itau-1",
		administradora: "Itaú",
		category: "auto",
		creditValue: 85000,
		monthlyPayment: 690,
		termMonths: 108,
	},
	{
		id: "grp-rodobens-1",
		administradora: "Rodobens",
		category: "auto",
		creditValue: 78000,
		monthlyPayment: 720,
		termMonths: 96,
	},
];

const META = {
	currentCategory: "auto",
	currentPersona: "concierge",
	qualifyAnswers: { creditMin: 60000, creditMax: 90000 },
	recommendedAdministradora: "Canopus",
	recommendedOffer: {
		administradora: "Canopus",
		creditValue: 80000,
		monthlyPayment: 700,
		termMonths: 120,
		groupId: "grp-canopus-1",
	},
};

const searchGroups = vi.fn(async () => GRUPOS);

vi.mock("@/db", () => ({
	db: {
		query: {
			conversations: { findFirst: vi.fn(async () => ({ metadata: META })) },
		},
	},
}));
vi.mock("./session", () => ({
	getOrCreateConversation: vi.fn(async () => ({ id: "conv-1", isNew: false })),
}));
vi.mock("@/lib/conversation/messages", () => ({
	saveMessage: vi.fn(async () => "msg-1"),
}));
vi.mock("@/lib/conversation/cards", () => ({
	registrarCardEnviado: vi.fn(async () => "msg-2"),
}));
vi.mock("./api", () => ({
	sendTextMessage: vi.fn(async () => ({ messageId: "wamid-1" })),
	sendInteractiveMessage: vi.fn(async () => ({ messageId: "wamid-2" })),
}));
vi.mock("@/lib/adapters", () => ({
	getDiscoveryAdapter: () => ({ searchGroups }),
}));

const clicar = async (replyId: string) => {
	const { dispatchInteractiveReply } = await import("./interactive-handlers");
	const processTextMessage = vi.fn(async () => {});
	await dispatchInteractiveReply({
		from: "5511987654321",
		replyId,
		replyTitle: "Ver outras",
		processTextMessage,
	});
	const api = await import("./api");
	const enviadas = vi.mocked(api.sendInteractiveMessage).mock.calls;
	const rows = (
		enviadas.at(-1)?.[1] as {
			action: { sections: Array<{ rows: Array<{ id: string }> }> };
		}
	)?.action.sections[0].rows.map((r) => r.id);
	return { rows, processTextMessage };
};

describe("as outras opções do WhatsApp não repetem a carta recomendada", () => {
	for (const clique of ["decision_outras", "show_others", "offer_reject"]) {
		it(`${clique}: o comparativo exclui a recomendada e mantém o filtro da conversa`, async () => {
			const { rows } = await clicar(clique);
			expect(rows).toEqual(["group_grp-itau-1", "group_grp-rodobens-1"]);
			// Mesmo filtro da descoberta — o comparativo não pode abrir o orçamento
			// pra faixas que a conversa não pediu. `objectContaining` porque quem
			// monta a busca é o `buildOtherOptions` (comum ao web): outros critérios
			// da mesma descoberta (parcela-alvo) podem entrar junto.
			expect(searchGroups).toHaveBeenLastCalledWith(
				expect.objectContaining({ category: "auto", creditMin: 60000, creditMax: 90000 }),
			);
		});
	}
});
