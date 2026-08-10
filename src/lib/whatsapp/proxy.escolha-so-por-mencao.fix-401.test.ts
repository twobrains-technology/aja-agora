// FIX-401 (porta 2) — o WhatsApp também para de ancorar escolha por texto.
//
// 6ª revisão independente: o FIX-400 removeu as origens `afirmacao`/`criterio`
// do `advance.ts` e o commit declarou que elas tinham sido removidas. Era
// verdade no grafo e FALSO no sistema — `proxy.ts:251` grava
// `origem: "afirmacao"` a partir de regex pura (`isInterestExpression`), em TODA
// mensagem do WhatsApp pós-reveal, SEM passar pelo grafo, sem analyzer, sem gate.
// E havia um teste verde afirmando isso como correto.
//
// O WhatsApp é onde está o volume de vendas real. Deixar a porta aberta ali e
// fechada na web seria o pior dos dois mundos: a arquitetura nova valeria só no
// canal de menor tráfego.
//
// A regra é a mesma do FIX-400: texto livre não compromete dinheiro. O que o
// proxy pode continuar fazendo é RE-ANCORAR a oferta exibida quando o cliente
// NOMEIA outra administradora (`origem: "mencao"`, lookup contra o conjunto
// fechado do que ele viu) — isso não é inferência, é resolução.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";

const WA = "5562999887766";

const mocks = vi.hoisted(() => ({
	runDirective: vi.fn().mockResolvedValue(undefined),
	saveMessage: vi.fn().mockResolvedValue(undefined),
	persistMeta: vi.fn().mockResolvedValue(undefined),
	sendTextMessage: vi.fn().mockResolvedValue(undefined),
	conv: {
		id: "conv-proxy-fix336",
		waId: "5562999887766",
		status: "active" as string,
		contactName: null as string | null,
		metadata: {} as ConversationMetadata,
	},
}));

vi.mock("./api", () => ({ sendTextMessage: mocks.sendTextMessage }));
vi.mock("./session", () => ({
	loadConversationHistory: vi.fn().mockResolvedValue([]),
	saveMessage: mocks.saveMessage,
}));
vi.mock("./meta-helpers", () => ({
	persistMeta: mocks.persistMeta,
	reloadMeta: vi.fn(async () => mocks.conv.metadata),
}));
vi.mock("./adapter", () => ({ runDirectiveWithOrchestrator: mocks.runDirective }));
vi.mock("@/db", () => ({
	db: {
		query: {
			conversations: {
				findFirst: vi.fn(async () => mocks.conv),
				// `findMany` = "quem atende esta pessoa?" (quem-responde.ts). Vazio:
				// ninguém em atendimento humano, que é a premissa destes casos.
				findMany: vi.fn(async () => []),
			},
		},
	},
}));

import { handlePendingHandoffText } from "./proxy";

beforeEach(() => {
	mocks.runDirective.mockClear();
	mocks.saveMessage.mockClear();
	mocks.persistMeta.mockClear();
	mocks.sendTextMessage.mockClear();
	mocks.conv.status = "active";
	mocks.conv.contactName = null;
	// `recommendedOffer` PRESENTE de propósito: sem ela `ancora` é falsy e o bloco
	// que grava `escolha` nem é alcançado — o teste passaria por vacuidade, sem
	// exercitar a linha que o revisor apontou (proxy.ts:251).
	mocks.conv.metadata = {
		searchDispatched: true,
		recommendedAdministradora: "ITAÚ",
		recommendedOffer: {
			groupId: "grp-itau",
			administradora: "ITAÚ",
			creditValue: 721_000,
			termMonths: 221,
			monthlyPayment: 4_430.98,
		},
	} as ConversationMetadata;
});

afterEach(() => vi.clearAllMocks());

describe("FIX-401 — proxy do WhatsApp não ancora escolha por texto livre", () => {
	it.each(["bora fechar", "topei", "fechado", "tenho interesse", "quero fechar essa"])(
		"texto de interesse NÃO grava escolha por afirmacao: %s",
		async (fala) => {
			mocks.persistMeta.mockClear();
			await handlePendingHandoffText(WA, fala);
			const origens = mocks.persistMeta.mock.calls
				.map((c) => (c[1] as ConversationMetadata | undefined)?.escolha?.origem)
				.filter(Boolean);
			expect(origens, `${fala} → origens gravadas`).not.toContain("afirmacao");
		},
	);
});
