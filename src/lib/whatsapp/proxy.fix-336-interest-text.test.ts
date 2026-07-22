// FIX-336 (bloco-c-whatsapp-invariantes, invariante I4) — "tenho interesse"
// por TEXTO LIVRE (sem clicar no botão) não tinha caminho determinístico no
// WhatsApp: `handlePendingHandoffText` (proxy.ts) rodava `isInterestExpression`
// só pra disparar HANDOFF HUMANO — resíduo de um refactor que corrigiu o
// clique (handleInterest, FIX-117) mas nunca voltou pra consertar o texto.
// Sem card real renderizado (dossiê auto-whatsapp, jornada degradada por
// G1/turno-morto), o usuário digitou "bora, tenho interesse" em vez de
// clicar — o texto caía direto no LLM livre, que alucinou "Sua proposta com
// a ITAÚ já saiu" com ZERO linhas em bevi_proposals.
//
// Este teste trava a paridade: texto livre "tenho interesse" pós-reveal
// segue o MESMO caminho self-service do clique (buildAdvanceToContractDirective),
// nunca a frase de handoff pra consultor.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";

const CONV_ID = "conv-proxy-fix336";
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
			conversations: { findFirst: vi.fn(async () => mocks.conv) },
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
	mocks.conv.metadata = {
		searchDispatched: true,
		recommendedAdministradora: "ITAÚ",
	} as ConversationMetadata;
});

afterEach(() => vi.clearAllMocks());

describe("FIX-336 — 'tenho interesse' por TEXTO LIVRE é self-service, não handoff humano", () => {
	it("'bora, tenho interesse' pós-reveal dispara o MESMO directive do clique (present_contract_form)", async () => {
		const handled = await handlePendingHandoffText(WA, "bora, tenho interesse");
		expect(handled).toBe(true);
		expect(mocks.runDirective).toHaveBeenCalledTimes(1);
		const directive = mocks.runDirective.mock.calls[0]?.[0]?.directive as string;
		// A diretiva não cita mais a TOOL: no runtime LangGraph o formulário é
		// emitido pelo grafo (gate `contract`) e `present_contract_form` nem existe
		// no toolset do modelo — mandá-lo chamar uma tool inexistente era turno
		// perdido. O que importa é o AVANÇO pro passo 5 (pré-cadastro), não o nome
		// da ferramenta.
		expect(directive).toMatch(/pré-cadastro|dados rápidos/i);
		// e segue proibindo o desvio pro caminho de lead humano
		expect(directive).toMatch(/NUNCA inicie captura de lead/i);
	});

	it("'tenho interesse, quero fechar' também casa (regex não pode ser âncora estrita)", async () => {
		const handled = await handlePendingHandoffText(WA, "tenho interesse, quero fechar");
		expect(handled).toBe(true);
		expect(mocks.runDirective).toHaveBeenCalledTimes(1);
	});

	it("NÃO manda a frase de handoff pra consultor", async () => {
		await handlePendingHandoffText(WA, "bora, tenho interesse");
		expect(mocks.sendTextMessage).not.toHaveBeenCalled();
	});

	it("marca decisionDispatched=true antes de avançar (mesma idempotência do clique)", async () => {
		await handlePendingHandoffText(WA, "bora, tenho interesse");
		const marked = mocks.persistMeta.mock.calls.some(
			(c) => (c[1] as ConversationMetadata | undefined)?.decisionDispatched === true,
		);
		expect(marked, "decisionDispatched deve ser persistido como true").toBe(true);
	});

	it("registra o texto do usuário no histórico antes de avançar", async () => {
		await handlePendingHandoffText(WA, "bora, tenho interesse");
		expect(mocks.saveMessage).toHaveBeenCalledWith(
			CONV_ID,
			"user",
			"bora, tenho interesse",
			"whatsapp",
		);
	});

	it("NÃO classifica 'tenho interesse em saber sobre lance' como interesse de fechamento (falso-positivo)", async () => {
		const handled = await handlePendingHandoffText(WA, "tenho interesse em saber sobre lance");
		expect(handled).toBe(false);
		expect(mocks.runDirective).not.toHaveBeenCalled();
	});

	it("sem reveal (searchDispatched=false) NÃO intercepta — segue pro pipeline geral", async () => {
		mocks.conv.metadata = { searchDispatched: false } as ConversationMetadata;
		const handled = await handlePendingHandoffText(WA, "tenho interesse");
		expect(handled).toBe(false);
		expect(mocks.runDirective).not.toHaveBeenCalled();
	});

	it("com captura textual de contrato já ativa (contractCollection) NÃO intercepta — deixa captureContractText cuidar", async () => {
		mocks.conv.metadata = {
			searchDispatched: true,
			contractCollection: { stage: "confirm" },
		} as ConversationMetadata;
		const handled = await handlePendingHandoffText(WA, "tenho interesse");
		expect(handled).toBe(false);
		expect(mocks.runDirective).not.toHaveBeenCalled();
	});

	it("pós-fechamento (contractClosed=true) NÃO intercepta — estado terminal", async () => {
		mocks.conv.metadata = {
			searchDispatched: true,
			contractClosed: true,
		} as ConversationMetadata;
		const handled = await handlePendingHandoffText(WA, "tenho interesse");
		expect(handled).toBe(false);
		expect(mocks.runDirective).not.toHaveBeenCalled();
	});
});
