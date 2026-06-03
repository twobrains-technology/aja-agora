import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { beviProposals, conversations } from "@/db/schema";
import { MockProposalGateway } from "@/lib/adapters/bevi/mock-proposal-gateway";
import { confirmOffer, startContract } from "./fulfillment";

// Integração REAL contra o Postgres (valida repo drizzle + schema 0022 + FKs +
// cast numérico). Roda SÓ com RUN_DB_TESTS=1 (dentro do container, onde o DB é
// alcançável por nome) — no host (DNS-only) fica pulado, sem quebrar o pre-commit.
const run = process.env.RUN_DB_TESTS === "1";

describe.runIf(run)("fulfillment — integração com o DB (bevi_proposals)", () => {
	const created: string[] = [];
	afterAll(async () => {
		for (const id of created) await db.delete(conversations).where(eq(conversations.id, id));
	});

	it("startContract → confirmOffer persiste e atualiza a proposta", async () => {
		const gw = new MockProposalGateway();
		const [conv] = await db.insert(conversations).values({}).returning();
		created.push(conv.id);

		const start = await startContract(
			conv.id,
			{
				cpf: "12345678909",
				celular: "11999998888",
				lgpd: true,
				segmento: "AUTOS",
				objetivo: "contemplacao_rapida",
				valor: 50000,
			},
			gw,
		);
		expect(start.proposalId).toBeTruthy();
		expect(start.offer?.creditValue).toBeGreaterThan(0);

		// linha criada com snapshot da oferta
		const afterStart = await db
			.select()
			.from(beviProposals)
			.where(eq(beviProposals.conversationId, conv.id));
		expect(afterStart).toHaveLength(1);
		expect(afterStart[0].proposalId).toBe(start.proposalId);
		expect(afterStart[0].proposalStatus).toBe("simulacao");
		expect(Number(afterStart[0].creditValue)).toBeGreaterThan(0);

		const c = await confirmOffer(conv.id, gw);
		expect(c.consortiumProposalLink).toContain("uselink.me");

		const afterConfirm = await db
			.select()
			.from(beviProposals)
			.where(eq(beviProposals.conversationId, conv.id));
		expect(afterConfirm[0].proposalStatus).toBe("documentos");
		expect(afterConfirm[0].consortiumProposalLink).toContain("uselink.me");
		expect(afterConfirm[0].documentsLinkPersonal).toContain("uselink.me");
	});
});
