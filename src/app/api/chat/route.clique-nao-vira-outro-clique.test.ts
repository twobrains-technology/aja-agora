/**
 * D7 (PRD 19/08/2026) — O SERVIDOR NÃO MENTE PARA O MODELO.
 *
 * A cadeia que matou a conversa da Rute tinha três elos, e este arquivo cobre o
 * terceiro: o route recebia a ação e emitia ao modelo um directive dizendo que
 * a cliente queria MUDAR O VALOR DO BEM — enquanto ela tinha pedido os cenários
 * de contemplação. O modelo obedeceu com fidelidade; o defeito nunca foi dele.
 *
 * Aqui se prova o contrário: cada clique gera o directive da SUA intenção, com
 * as tools que já existem no toolset (`compute_scenarios`/`present_scenarios`,
 * `compare_with_financing`/`present_financing_comparison`).
 */

import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { conversations, leads, messages as messagesTable } from "@/db/schema";

vi.mock("@/lib/middleware/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true }) }));

const adapter = vi.hoisted(() => ({
	pipeUserTurn: vi.fn(async (_args: { conversationId: string; userText: string }) => {}),
	pipeDirectiveTurn: vi.fn(async (_args: { conversationId: string; directive: string }) => ({
		emittedVisible: true,
	})),
	pipeGatePrompt: vi.fn(async (_args: unknown) => {}),
	pipeTransitionTurn: vi.fn(async (_args: unknown) => {}),
}));

vi.mock("@/lib/web/adapter", () => adapter);
vi.mock("@/lib/memory/orchestrator-bridge", () => ({
	resolveIdentityForTurn: () => null,
	loadMemoryContextForTurn: vi.fn().mockResolvedValue(null),
	memorySystemMessageFromContext: () => null,
	storeMemoriesForTurn: vi.fn().mockResolvedValue(undefined),
}));

const { POST } = await import("./route");

let ipSeq = 0;
function makeReq(body: unknown): NextRequest {
	ipSeq += 1;
	return new NextRequest("http://localhost/api/chat", {
		method: "POST",
		headers: { "Content-Type": "application/json", "x-forwarded-for": `10.0.11.${ipSeq % 250}` },
		body: JSON.stringify(body),
	});
}

describe("D7 — cada clique vira o directive da sua própria intenção", () => {
	let convId: string;

	beforeEach(async () => {
		adapter.pipeDirectiveTurn.mockClear();
		const [c] = await db.insert(conversations).values({ contactName: "Rute" }).returning();
		convId = c.id;
	});

	afterEach(async () => {
		await db.delete(messagesTable).where(eq(messagesTable.conversationId, convId));
		await db.delete(leads).where(eq(leads.conversationId, convId));
		await db.delete(conversations).where(eq(conversations.id, convId));
	});

	it('"Ver cenários de contemplação" manda calcular e apresentar os cenários', async () => {
		const res = await POST(
			makeReq({
				conversationId: convId,
				messages: [
					{ role: "user", parts: [{ type: "text", text: "Ver cenários de contemplação" }] },
				],
				action: {
					kind: "view-scenarios",
					administradora: "ITAÚ",
					groupId: "grp-itau-147",
					label: "Ver cenários de contemplação",
				},
			}),
		);
		await res.text();

		expect(adapter.pipeDirectiveTurn).toHaveBeenCalledTimes(1);
		const { directive } = adapter.pipeDirectiveTurn.mock.calls[0][0];
		expect(directive).toContain("compute_scenarios");
		expect(directive).toContain("present_scenarios");
		// O defeito exato: dizer ao modelo que ela quer mudar o valor do bem.
		expect(directive).not.toMatch(/valor do bem/i);
		expect(directive).not.toMatch(/ajustar valor/i);
	});

	it('"Comparar com financiamento" manda comparar, não ajustar valor', async () => {
		const res = await POST(
			makeReq({
				conversationId: convId,
				messages: [{ role: "user", parts: [{ type: "text", text: "Comparar com financiamento" }] }],
				action: {
					kind: "compare-financing",
					administradora: "ITAÚ",
					creditValue: 524_580,
					label: "Comparar com financiamento",
				},
			}),
		);
		await res.text();

		const { directive } = adapter.pipeDirectiveTurn.mock.calls[0][0];
		expect(directive).toContain("compare_with_financing");
		expect(directive).toContain("present_financing_comparison");
		expect(directive).not.toMatch(/ajustar valor/i);
	});
});
