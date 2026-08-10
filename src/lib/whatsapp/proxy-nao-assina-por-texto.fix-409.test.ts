// FIX-409 — o WhatsApp para de assinar por texto, e para de chamar critério de menção.
//
// A 9ª revisão independente achou DOIS defeitos neste atalho, e os dois são da
// mesma natureza: o commit anterior declarou um invariante que valia no grafo e
// não no sistema. Já é a terceira vez que este repo comete exatamente esse erro
// (FIX-400 → 6ª revisão, FIX-406 → 9ª revisão).
//
//   · `escolha` continuava nascendo aqui, de texto livre, com `origem: "mencao"`.
//     O FIX-406 removeu essa escrita do grafo e afirmou que só clique e tool
//     assinavam. Este bloco ficou intacto, no canal de MAIOR VOLUME. Enquanto os
//     dois canais discordarem sobre o que assina um contrato, o que vale na
//     prática é o mais permissivo.
//
//   · a chamada omitia `permitirCriterio`, cujo default é `true`. "a de menor
//     parcela, quero fechar" resolvia por CRITÉRIO e era gravado como
//     `origem: "mencao"` — mentira no banco, porque `criterio` é justamente a
//     origem que o FIX-400 removeu por não ser verificável.
//
// ⚠️ POR QUE ESTE ARQUIVO EXISTE, e não mais casos no teste do FIX-401: aquele
// harness mocka `@/db` só com `query.conversations`, e
// `resolveAdministradoraMentionForConversation` consulta a tabela de artifacts
// por import dinâmico. A consulta falha, cai no `.catch(() => null)`, e a menção
// NUNCA resolve — qualquer asserção sobre o caminho da menção lá passa por
// vacuidade. (De fato: o teste do FIX-401 só afirma a ausência de `afirmacao`, e
// continuou verde depois de eu remover a escrita inteira.)
//
// Aqui o resolvedor é mockado para RESOLVER. É o que torna a asserção real: com
// uma menção resolvida com sucesso — o caso mais favorável possível à escrita —
// `escolha` continua não sendo gravada.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";

const WA = "5562999887766";

const mocks = vi.hoisted(() => ({
	runDirective: vi.fn().mockResolvedValue(undefined),
	saveMessage: vi.fn().mockResolvedValue(undefined),
	persistMeta: vi.fn().mockResolvedValue(undefined),
	sendTextMessage: vi.fn().mockResolvedValue(undefined),
	resolveMention: vi.fn(),
	conv: {
		id: "conv-fix409",
		// Literal, não `WA`: `vi.hoisted` é içado acima das declarações do módulo.
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
	// `findMany` responde a "quem atende esta pessoa?" (quem-responde.ts). Lista
	// vazia = ninguém em atendimento humano, que é a premissa destes casos.
	db: {
		query: {
			conversations: {
				findFirst: vi.fn(async () => mocks.conv),
				findMany: vi.fn(async () => []),
			},
		},
	},
}));
vi.mock("@/lib/agent/orchestrator/choose-offer", () => ({
	resolveAdministradoraMentionForConversation: mocks.resolveMention,
}));

import { handlePendingHandoffText } from "./proxy";

/** A CANOPUS resolvida com sucesso — diferente da ancorada (ITAÚ), que é o que
 * dispara `trocouDeAdministradora` e alcança o bloco sob teste. */
const CANOPUS = {
	groupId: "grp-canopus",
	administradora: "CANOPUS",
	creditValue: 170_000,
	termMonths: 96,
	monthlyPayment: 1_092,
	avgBidValue: 134_827,
};

beforeEach(() => {
	for (const m of [
		mocks.runDirective,
		mocks.saveMessage,
		mocks.persistMeta,
		mocks.sendTextMessage,
		mocks.resolveMention,
	])
		m.mockClear();
	mocks.resolveMention.mockResolvedValue(CANOPUS);
	mocks.conv.status = "active";
	mocks.conv.contactName = null;
	// `recommendedOffer` PRESENTE de propósito: sem ela o bloco que gravava
	// `escolha` nem era alcançado, e o teste passaria sem exercitar nada.
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

/** Todas as metas persistidas no turno — o proxy chama `persistMeta` mais de uma
 * vez, e olhar só a última esconderia uma escrita intermediária. */
function metasPersistidas(): ConversationMetadata[] {
	return mocks.persistMeta.mock.calls
		.map((c) => c[1] as ConversationMetadata | undefined)
		.filter(Boolean) as ConversationMetadata[];
}

describe("FIX-409 — menção resolvida NÃO assina contrato no WhatsApp", () => {
	// ⚠️ Descoberta ao escrever este teste, pela sentinela abaixo: "quero fechar
	// com a Canopus" NÃO entra neste atalho. `INTEREST_RE` é ancorada por segmento
	// (`^…$`), e "quero fechar com a Canopus" não casa "quero fechar" sozinho —
	// cai no fluxo normal do agente. Comportamento pré-existente, e razoável (o
	// modelo trata), mas não pode entrar aqui: a asserção passaria por vacuidade.
	// Foi exatamente o que a sentinela impediu.
	it.each(["a da Canopus me atende, bora fechar", "topei, Canopus", "Canopus, fechado"])(
		"menção resolvida não grava escolha: %s",
		async (fala) => {
			await handlePendingHandoffText(WA, fala);

			// Sentinela de NÃO-VACUIDADE: se o resolvedor não tiver sido chamado, a
			// asserção abaixo não prova nada — é exatamente assim que o teste do
			// FIX-401 passou sem exercitar este caminho.
			expect(
				mocks.resolveMention,
				`${fala} → resolvedor precisa ter sido chamado`,
			).toHaveBeenCalled();

			for (const meta of metasPersistidas()) {
				expect(meta.escolha, `${fala} → escolha gravada`).toBeUndefined();
			}
		},
	);

	it("a re-âncora de CONVERSA sobrevive — o cliente é atendido na cota que nomeou", async () => {
		// A metade que impede o fix de virar "ignorar o cliente". Ele disse Canopus;
		// o atendimento tem que seguir na Canopus. O que ele NÃO fez foi assinar.
		await handlePendingHandoffText(WA, "a da Canopus me atende, bora fechar");

		const comAncora = metasPersistidas().find((m) => m.recommendedAdministradora === "CANOPUS");
		expect(comAncora, "a menção precisa re-ancorar a administradora").toBeDefined();
		expect(comAncora?.recommendedOffer?.creditValue).toBe(170_000);
		// Campo da cota NOVA, nunca herdado da antiga (invariante do FIX-375).
		expect(comAncora?.recommendedOffer?.avgBidValue).toBe(134_827);
	});

	it("o funil avança: decisionDispatched marcado e a diretiva de contrato roda", async () => {
		// Sem isto, remover a escrita de `escolha` poderia ter deixado o funil mudo
		// no fecho — o defeito oposto, e o que o comentário do FIX-401 temia.
		await handlePendingHandoffText(WA, "a da Canopus me atende, bora fechar");

		expect(metasPersistidas().some((m) => m.decisionDispatched === true)).toBe(true);
		expect(mocks.runDirective).toHaveBeenCalled();
	});

	it("critério NUNCA resolve neste atalho — `permitirCriterio: false`", async () => {
		// O default do parâmetro é `true`, e a chamada o omitia: "a de menor parcela"
		// resolvia por critério e era gravado como `origem: "mencao"`. O grafo passa
		// `permitirCriterio: !perguntaAberta`; aqui não há analyzer pra dizer se o
		// turno é pergunta, então a resposta honesta é nunca.
		await handlePendingHandoffText(WA, "a de menor parcela, quero fechar");

		expect(mocks.resolveMention).toHaveBeenCalledWith(
			expect.any(String),
			expect.any(String),
			expect.objectContaining({ permitirCriterio: false }),
		);
	});
});
