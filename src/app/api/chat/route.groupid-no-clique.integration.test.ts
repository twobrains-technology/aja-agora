/**
 * FIX-419/421 — o clique "Tenho interesse" leva o `groupId`, e é ELE que decide
 * a cota que vai à Bevi.
 *
 * ⚠️ POR QUE ESTE ARQUIVO EXISTE: a 15ª revisão independente mediu que esta é a
 * mudança de MAIOR EFEITO da campanha inteira — de 51,5% para 100% de acerto do
 * crédito, e de 10% para 100% do prazo, sobre 549 cliques replayados contra as
 * conversas reais do banco — e que ela estava com ZERO teste. Revertendo os
 * quatro arquivos do FIX-419, a suíte inteira continuava verde.
 *
 * É a quarta entrega seguida com item vácuo, num commit rotulado `fix+test:`. Um
 * teste que não existe é pior que um que falha: o que falha alguém vê.
 *
 * O CENÁRIO QUE IMPORTA, e que é justamente o que a resolução por marca não
 * cobre: DUAS cotas da MESMA administradora exibidas na tela. Aí
 * `findOfferByAdministradora` devolve `null` por ambiguidade — e faz certo em não
 * chutar. Sem `groupId`, o servidor caía no teto declarado e mandava
 * `prazoPreferido: null`; o cliente clicava no card de R$ 150.000 / 96 meses e a
 * Bevi recebia R$ 120.000 sem prazo, devolvendo outro grupo.
 *
 * Mocks: fulfillment (spy — nunca toca a Bevi real), rate-limit, memória. Real:
 * DB (artifacts/messages), route handler, `resolveChosenOffer`.
 */

import { eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
	artifacts as artifactsTable,
	beviProposals,
	conversations,
	messages as messagesTable,
} from "@/db/schema";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { buildStartContractInput } from "@/lib/bevi/contract-input";

if (!process.env.IDENTITY_ENC_KEY) {
	process.env.IDENTITY_ENC_KEY = Buffer.alloc(32, 9).toString("base64");
}

vi.mock("@/lib/middleware/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true }) }));

const fulfillmentRef = vi.hoisted(() => ({
	startContract: vi.fn(),
	confirmOffer: vi.fn(),
	uploadContractDocument: vi.fn(),
}));

vi.mock("@/lib/bevi/fulfillment", () => ({
	startContract: fulfillmentRef.startContract,
	confirmOffer: fulfillmentRef.confirmOffer,
	uploadContractDocument: fulfillmentRef.uploadContractDocument,
}));
vi.mock("@/lib/memory/orchestrator-bridge", () => ({
	resolveIdentityForTurn: () => null,
	loadMemoryContextForTurn: vi.fn().mockResolvedValue(null),
	memorySystemMessageFromContext: () => null,
	storeMemoriesForTurn: vi.fn().mockResolvedValue(undefined),
}));

const { POST } = await import("./route");

let ipSeq = 0;
/** IP DISTINTO por requisição, de propósito.
 *
 * Com todos os casos usando `127.0.0.1`, o 1º passava e os 3 seguintes falhavam
 * com `contractOffer` indefinido — e isolados (`-t`) todos passavam. Sintoma
 * clássico de estado por CHAVE DE USUÁRIO no processo (dedup/idempotência do
 * turno), não de produto. Variar o IP dá a cada caso a sua própria chave. */
function makePostReq(body: unknown): NextRequest {
	ipSeq += 1;
	return new NextRequest("http://localhost/api/chat", {
		method: "POST",
		headers: { "Content-Type": "application/json", "x-forwarded-for": `10.0.0.${ipSeq}` },
		body: JSON.stringify(body),
	});
}

/** Funil no ponto do fecho: só falta o cliente decidir a cota. */
const PRONTO_PRA_DECIDIR: ConversationMetadata = {
	currentPersona: "auto",
	currentCategory: "auto",
	expertiseLevel: "neutro",
	revealCompleted: true,
	identityCollected: true,
	recommendedAdministradora: "RODOBENS",
	// O teto que o cliente declarou. As DUAS cotas abaixo estão acima dele — é o
	// caso normal (a 15ª revisão mediu 80,6% das cartas reais assim).
	qualifyAnswers: { creditMax: 120_000, prazoMeses: 96 },
	// Sem isto o `contract-submit` não chega ao gateway e TODOS os casos passam por
	// vacuidade — inclusive o do groupId forjado, cujo `not.toBe(...)` fica
	// verdadeiro de graça sobre `undefined`. Foi o que a 1ª versão deste arquivo
	// fez, e as sentinelas `toHaveBeenCalled` abaixo são o que expõe.
	contractFormDispatched: true,
} as ConversationMetadata;

/** DUAS cotas da MESMA administradora — o caso que a resolução por marca não
 * consegue desambiguar, e que por isso é o único que prova o `groupId`. */
const DUAS_DA_MESMA_MARCA = {
	groups: [
		{
			id: "grp-rodobens-A",
			administradora: "RODOBENS",
			creditValue: 130_000,
			termMonths: 200,
			monthlyPayment: 1_100,
		},
		{
			id: "grp-rodobens-B",
			administradora: "RODOBENS",
			creditValue: 150_000,
			termMonths: 96,
			monthlyPayment: 2_719,
		},
	],
};

async function conversaComAsDuasCotas(): Promise<string> {
	const [c] = await db
		.insert(conversations)
		.values({ contactName: "Kairo", metadata: PRONTO_PRA_DECIDIR })
		.returning({ id: conversations.id });
	const [m] = await db
		.insert(messagesTable)
		.values({ conversationId: c.id, role: "assistant", content: "Achei duas opções." })
		.returning({ id: messagesTable.id });
	await db.insert(artifactsTable).values({
		messageId: m.id,
		type: "comparison_table",
		payload: DUAS_DA_MESMA_MARCA,
	});
	return c.id;
}

describe("FIX-419/421 — o groupId do clique decide a cota que vai à Bevi", () => {
	let convId: string;

	afterEach(async () => {
		if (!convId) return;
		await db.delete(beviProposals).where(eq(beviProposals.conversationId, convId));
		const msgs = await db
			.select({ id: messagesTable.id })
			.from(messagesTable)
			.where(eq(messagesTable.conversationId, convId));
		const ids = msgs.map((m) => m.id);
		if (ids.length > 0) {
			await db.delete(artifactsTable).where(inArray(artifactsTable.messageId, ids));
		}
		await db.delete(messagesTable).where(eq(messagesTable.conversationId, convId));
		await db.delete(conversations).where(eq(conversations.id, convId));
		// ⚠️ SEM `vi.restoreAllMocks()` aqui, de propósito. Copiei-o do
		// `route.fix-263-antirefazer`, onde faz sentido, e aqui ele derrubava os
		// mocks para os casos SEGUINTES: o 1º passava e os 3 outros falhavam com
		// `contractOffer` indefinido. Isolados, todos passavam — sintoma clássico de
		// estado entre casos, não de produto.
	});

	/** Dá o clique REAL na rota e devolve o que a Bevi receberia a partir do
	 * estado que ele persistiu.
	 *
	 * A composição é deliberada e não é tautologia: o clique passa pelo handler
	 * real e pelo `resolveChosenOffer` real contra os artifacts do Postgres; a meta
	 * resultante é lida do BANCO; e a derivação é a função de produção que os dois
	 * canais usam. Encadear o `contract-submit` por cima acrescentaria só o caminho
	 * de identidade/stream, que já tem teste próprio (`route.fix-263-antirefazer`). */
	async function clicarEDerivar(groupId?: string) {
		const res = await POST(
			makePostReq({
				conversationId: convId,
				action: {
					kind: "interest",
					administradora: "RODOBENS",
					...(groupId ? { groupId } : {}),
					label: "Tenho interesse",
				},
				messages: [{ role: "user", parts: [{ type: "text", text: "Tenho interesse" }] }],
			}),
		);
		// ⚠️ CONSUMIR o stream importa. Sem isto o 1º caso passava e os 3 seguintes
		// falhavam com `contractOffer` indefinido (isolados, todos passavam): o turno
		// ficava pendurado segurando estado no processo, e o caso seguinte entrava
		// num handler que ainda não tinha terminado o anterior.
		await res.text();
		const [row] = await db.select().from(conversations).where(eq(conversations.id, convId));
		const meta = (row as { metadata: ConversationMetadata }).metadata;
		return {
			meta,
			input: buildStartContractInput(meta, {
				cpf: "02874137138",
				celular: "62992496793",
				lgpd: true,
			}),
		};
	}

	it("clique na SEGUNDA cota da mesma marca leva crédito e prazo DELA", async () => {
		convId = await conversaComAsDuasCotas();

		const { meta, input } = await clicarEDerivar("grp-rodobens-B");

		// Sentinela: sem cota ancorada o resto não prova nada — seria o teste
		// passando por vacuidade, que é o defeito que este arquivo veio corrigir.
		expect(meta.contractOffer?.groupId, "o clique precisa ter ancorado a cota").toBe(
			"grp-rodobens-B",
		);
		// A cota B — nem a A (130.000/200) nem o teto declarado (120.000).
		expect(input.valor).toBe(150_000);
		expect(input.prazoPreferido).toBe(96);
		expect(input.administradoraPreferida).toBe("RODOBENS");
	});

	it("clique na PRIMEIRA cota leva a dela — o groupId é que discrimina", async () => {
		// A contraprova. Sem ela, um servidor que sempre pegasse a última cota
		// exibida passaria no caso acima sem nunca olhar o `groupId`.
		convId = await conversaComAsDuasCotas();

		const { meta, input } = await clicarEDerivar("grp-rodobens-A");

		expect(meta.contractOffer?.groupId).toBe("grp-rodobens-A");
		expect(input.valor).toBe(130_000);
		expect(input.prazoPreferido).toBe(200);
	});

	it("groupId de OUTRA conversa não resolve — o lookup é escopado", async () => {
		// O `groupId` vem do CLIENTE. Se o lookup não fosse escopado por conversa,
		// um id forjado fixaria qualquer cota já exibida em QUALQUER conversa numa
		// proposta real com consulta de bureau. A 15ª revisão verificou em 43 pares
		// cruzados (0/43); aqui fica travado.
		convId = await conversaComAsDuasCotas();

		const { meta, input } = await clicarEDerivar("grp-de-outra-conversa-999");

		// Ancora a MARCA (o cliente clicou de verdade), mas nenhum número.
		expect(meta.contractOffer?.administradora).toBe("RODOBENS");
		expect(meta.contractOffer?.groupId).toBeUndefined();
		expect(input.valor).not.toBe(130_000);
		expect(input.valor).not.toBe(150_000);
	});

	it("clique SEM groupId (bundle antigo) ainda ancora a marca — não quebra", async () => {
		// Durante a janela de deploy há abas com o bundle anterior, que não manda o
		// `groupId`. O caminho antigo tem que continuar funcionando; a 15ª revisão
		// mediu que ele fica pior que produção nesse recorte, e isso está anotado —
		// mas quebrar seria muito pior que degradar.
		convId = await conversaComAsDuasCotas();

		const { meta } = await clicarEDerivar();

		expect(meta.contractOffer?.administradora).toBe("RODOBENS");
		expect(meta.decisionDispatched).toBe(true);
	});
});
