// FIX-398 — "Ver outras opções" é determinístico em TODAS as portas do WhatsApp.
//
// Achado pela revisão independente de 2026-07-30. O FIX-390 fechou as duas portas
// da WEB (`proposal-doc.tsx`, `real-offer.tsx`), mas o comentário daquele teste
// dizia "os quatro lugares que oferecem esse botão" — e os quatro eram todos web.
// No WhatsApp, três handlers continuavam mandando a frase pro MODELO:
//
//   offer_reject     (`handleOfferReject`)    → processTextMessage("Quero ver outras opções")
//   show_others      (`handleShowOthers`)     → processTextMessage("Quero ver outras opções")
//   contract_cancel  (`handleContractCancel`) → processTextMessage("Quero ver outras opções")
//
// É exatamente o anti-padrão que o FIX-390 declarou morto: quem monta o
// comparativo das ofertas reais é o SERVIDOR (`buildOtherOptions` — cache do
// adapter, dedupe, exclui a recomendada). Delegando ao modelo, ele anuncia opções
// que não tem como mostrar — foi o que o Bernardo viu na web em 28/07 ("pedi
// outras opções e não veio").
//
// `decision_outras` já fazia certo desde o FIX-119. Este teste trava a paridade
// nas outras três: mesmo caminho model-free, mesmo comparativo.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GroupSummary } from "@/lib/adapters/types";
import type { ConversationMetadata } from "@/lib/agent/personas";

const CONV_ID = "conv-ih-fix398";
const WA = "5562999887766";

const OTHER_GROUPS: GroupSummary[] = [
	{
		id: "g-real-1",
		administradora: "PORTO",
		creditValue: 90_000,
		monthlyPayment: 1_100,
		termMonths: 80,
	} as GroupSummary,
	{
		id: "g-real-2",
		administradora: "ITAU",
		creditValue: 85_000,
		monthlyPayment: 1_050,
		termMonths: 84,
	} as GroupSummary,
];

const mocks = vi.hoisted(() => ({
	sendText: vi.fn().mockResolvedValue(undefined),
	sendInteractive: vi.fn().mockResolvedValue(undefined),
	saveMessage: vi.fn().mockResolvedValue(undefined),
	persistMeta: vi.fn().mockResolvedValue(undefined),
	buildOtherOptions: vi.fn(),
	meta: {} as ConversationMetadata,
	processText: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./session", () => ({ getOrCreateConversation: vi.fn(async () => ({ id: CONV_ID })) }));
vi.mock("./api", () => ({
	sendTextMessage: mocks.sendText,
	sendInteractiveMessage: mocks.sendInteractive,
}));
vi.mock("@/lib/conversation/messages", () => ({ saveMessage: mocks.saveMessage }));
vi.mock("@/lib/conversation/meta", () => ({
	metaOf: () => mocks.meta,
	persistMeta: mocks.persistMeta,
}));
vi.mock("@/db", () => ({
	db: {
		query: {
			conversations: { findFirst: vi.fn(async () => ({ id: CONV_ID, metadata: mocks.meta })) },
		},
	},
}));
vi.mock("./adapter", () => ({
	runDirectiveWithOrchestrator: vi.fn(),
	runSearchSummaryWithOrchestrator: vi.fn(),
	fireGate: vi.fn(),
	runTransitionWithOrchestrator: vi.fn(),
}));
vi.mock("./proxy", () => ({
	getHandoffState: vi.fn().mockResolvedValue({ isHandedOff: false }),
	startInterestHandoff: vi.fn(),
}));
vi.mock("@/lib/bevi/other-options", () => ({ buildOtherOptions: mocks.buildOtherOptions }));

import { dispatchInteractiveReply } from "./interactive-handlers";

function dispatch(replyId: string, replyTitle = "Ver outras opções") {
	return dispatchInteractiveReply({
		from: WA,
		replyId,
		replyTitle,
		processTextMessage: mocks.processText,
	});
}

beforeEach(() => {
	for (const m of [
		mocks.sendText,
		mocks.sendInteractive,
		mocks.saveMessage,
		mocks.persistMeta,
		mocks.buildOtherOptions,
		mocks.processText,
	])
		m.mockClear();
	mocks.meta = { currentCategory: "auto" } as ConversationMetadata;
	mocks.buildOtherOptions.mockResolvedValue({
		text: "Claro! Essas são as outras opções que encontrei pro seu perfil — compara com calma:",
		groups: OTHER_GROUPS,
	});
});

afterEach(() => vi.clearAllMocks());

const PORTAS = [
	{ id: "offer_reject", titulo: "Ver outras opções", onde: "card da oferta real (passo 5)" },
	{ id: "show_others", titulo: "Ver outras opções", onde: "card da recomendada" },
	{ id: "contract_cancel", titulo: "Cancelar", onde: "formulário de contratação" },
] as const;

describe("FIX-398 — todas as portas do WhatsApp usam o comparativo determinístico", () => {
	it.each(PORTAS)("$id ($onde) não delega a frase ao modelo", async ({ id, titulo }) => {
		const claimed = await dispatch(id, titulo);
		expect(claimed).toBe(true);
		// O ponto do bug: mandar "Quero ver outras opções" pro modelo.
		const textosDelegados = mocks.processText.mock.calls.map((c) => c[1]);
		expect(textosDelegados).not.toContain("Quero ver outras opções");
	});

	it.each(PORTAS)(
		"$id chama buildOtherOptions — a fonte real das ofertas",
		async ({ id, titulo }) => {
			await dispatch(id, titulo);
			expect(mocks.buildOtherOptions).toHaveBeenCalledTimes(1);
			expect(mocks.buildOtherOptions.mock.calls[0]?.[0]).toBe(CONV_ID);
		},
	);

	it.each(PORTAS)("$id emite o comparativo com os grupos REAIS", async ({ id, titulo }) => {
		await dispatch(id, titulo);
		expect(mocks.sendInteractive).toHaveBeenCalledTimes(1);
		const interactive = mocks.sendInteractive.mock.calls[0]?.[1];
		const linhas = interactive?.action?.sections?.[0]?.rows ?? [];
		expect(linhas.length).toBe(OTHER_GROUPS.length);
		expect(linhas.map((r: { title: string }) => r.title)).toEqual(
			OTHER_GROUPS.map((g) => g.administradora),
		);
	});

	it("contract_cancel continua limpando a coleta e avisando o cliente antes de comparar", async () => {
		// A ordem importa: o cliente cancelou um formulário. Ele precisa ouvir que o
		// cancelamento aconteceu ANTES de receber uma lista de opções, senão parece
		// que o sistema ignorou o clique.
		await dispatch("contract_cancel", "Cancelar");
		expect(mocks.persistMeta).toHaveBeenCalled();
		expect(mocks.sendText.mock.calls.length).toBeGreaterThanOrEqual(2);
	});

	it("quando buildOtherOptions falha, o cliente recebe resposta — nunca silêncio nem free-run", async () => {
		mocks.buildOtherOptions.mockRejectedValueOnce(new Error("descoberta vazia"));
		const claimed = await dispatch("offer_reject");
		expect(claimed).toBe(true);
		expect(mocks.processText).not.toHaveBeenCalled();
		expect(mocks.sendText).toHaveBeenCalled();
	});
});
