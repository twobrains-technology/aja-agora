// bloco B2 (FIX-433, D2/D3) — a trava do telefone cobre TODO card de oferta e o
// braço B não fica legível esperando o fim do turno.
//
// Writer falso + banco real (padrão de `adapter.fix-268-text-boundary.test.ts`):
// o adapter lê o desbloqueio da conversa no banco (`leituraDoDesbloqueio`) e
// persiste os cards do telefone (`pipeServerArtifact`), então a conversa precisa
// existir de verdade. A ordem dos parts no writer é o que o cliente vê.
//
// Sem DB (CI sem Postgres) o bloco inteiro é pulado, como as outras integrações.

import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CARDS_QUE_REVELAM_OFERTA } from "@/lib/chat/desbloqueio-do-telefone";
import { CHAVE_DO_TESTE_NO_METADATA } from "@/lib/chat/resultado-do-teste-do-telefone";

vi.mock("@/lib/admin/lead-stage-tracker", () => ({
	recordStageReached: vi.fn().mockResolvedValue(undefined),
}));

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

async function* events(evs: unknown[]) {
	for (const ev of evs) yield ev as never;
}

function card(type: string, toolCallId: string): unknown {
	return { type: "artifact", artifactType: type, payload: {}, toolCallId };
}

/** Os tipos de `data-artifact` que o writer recebeu, NA ORDEM em que saíram. */
function tiposEscritos(writer: { write: ReturnType<typeof vi.fn> }): string[] {
	return writer.write.mock.calls
		.map((call) => call[0] as { type?: string; data?: { type?: string } })
		.filter((part) => part.type === "data-artifact")
		.map((part) => part.data?.type ?? "");
}

describeIfDb("pipeOrchestratorToWriter — desbloqueio cobre todo card (FIX-433)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let adapter: typeof import("./adapter");

	const visitIds: string[] = [];
	const convIds: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		adapter = await import("./adapter");
	});

	afterAll(async () => {
		if (convIds.length > 0) {
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
		if (visitIds.length > 0) {
			await db.delete(schema.visits).where(inArray(schema.visits.id, visitIds));
		}
	});

	/** Conversa web com o braço PERSISTIDO; sem lead ⇒ telefone desconhecido. */
	async function semear(variante: "A" | "B"): Promise<string> {
		const [visita] = await db
			.insert(schema.visits)
			.values({
				visitorId: `teste-b2-${Math.random().toString(16).slice(2)}`,
				channel: "web",
				createdAt: new Date("2019-06-10T12:00:00Z"),
				userAgent:
					"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
			})
			.returning({ id: schema.visits.id });
		visitIds.push(visita.id);

		const [conversa] = await db
			.insert(schema.conversations)
			.values({
				visitId: visita.id,
				channel: "web",
				isSimulated: false,
				createdAt: new Date("2019-06-10T12:00:00Z"),
				metadata: { [CHAVE_DO_TESTE_NO_METADATA]: { variante } },
			})
			.returning({ id: schema.conversations.id });
		convIds.push(conversa.id);
		return conversa.id;
	}

	async function comTelefone(conversationId: string): Promise<void> {
		await db.insert(schema.leads).values({
			conversationId,
			phone: "11999999999", // FALSO — PII de teste
			isSimulated: false,
		});
	}

	function writerFalso(): { write: ReturnType<typeof vi.fn>; merge: ReturnType<typeof vi.fn> } {
		return { write: vi.fn(), merge: vi.fn() };
	}

	it("braço B sem lead ⇒ o card do telefone sai ANTES do primeiro card de oferta", async () => {
		const conversationId = await semear("B");
		const writer = writerFalso();

		await adapter.pipeOrchestratorToWriter(
			events([card("simulation_result", "s1"), card("group_card", "g1")]),
			writer as never,
			conversationId,
		);

		const tipos = tiposEscritos(writer);
		expect(tipos).toContain("telefone_do_desbloqueio");
		expect(tipos.indexOf("telefone_do_desbloqueio")).toBeLessThan(
			tipos.indexOf("simulation_result"),
		);
		// o B mostra a oferta (o cliente é que embaça) — os dois cards saem
		expect(tipos).toEqual(["telefone_do_desbloqueio", "simulation_result", "group_card"]);
	});

	it("braço A sem lead ⇒ todo card de oferta fica RETIDO (só o telefone sai)", async () => {
		const conversationId = await semear("A");
		const writer = writerFalso();

		await adapter.pipeOrchestratorToWriter(
			events([card("simulation_result", "s1"), card("group_card", "g1")]),
			writer as never,
			conversationId,
		);

		expect(tiposEscritos(writer)).toEqual(["telefone_do_desbloqueio"]);
	});

	it("A e B sem lead ⇒ os 6 cards da trava obedecem (retém no A, emite no B)", async () => {
		const todos = [...CARDS_QUE_REVELAM_OFERTA];
		expect(todos).toHaveLength(6);

		for (const tipo of todos) {
			const convA = await semear("A");
			const writerA = writerFalso();
			await adapter.pipeOrchestratorToWriter(events([card(tipo, "a1")]), writerA as never, convA);
			expect(tiposEscritos(writerA)).not.toContain(tipo);

			const convB = await semear("B");
			const writerB = writerFalso();
			await adapter.pipeOrchestratorToWriter(events([card(tipo, "b1")]), writerB as never, convB);
			expect(tiposEscritos(writerB)).toContain(tipo);
		}
	});

	it("com telefone no lead ⇒ todos os cards livres e nenhum card de telefone", async () => {
		const conversationId = await semear("B");
		await comTelefone(conversationId);
		const writer = writerFalso();

		await adapter.pipeOrchestratorToWriter(
			events([card("simulation_result", "s1"), card("group_card", "g1")]),
			writer as never,
			conversationId,
		);

		const tipos = tiposEscritos(writer);
		expect(tipos).not.toContain("telefone_do_desbloqueio");
		expect(tipos).toEqual(["simulation_result", "group_card"]);
	});
});
