// A mesa recebe a última proposta COM oferta real; linha vazia (tentativa com carta
// indisponível, sem oferta) não vira "a proposta" do caso.

import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { beviProposals, conversations, leads, mesaHandoffs } from "@/db/schema";
import { createMesaHandoff } from "./handoff";

const conversas: string[] = [];
afterEach(async () => {
	for (const id of conversas.splice(0)) {
		await db.delete(mesaHandoffs).where(eq(mesaHandoffs.conversationId, id));
		await db.delete(conversations).where(eq(conversations.id, id));
	}
});

describe("createMesaHandoff — seleção da proposta", () => {
	it("escolhe a última linha com oferta real, ignorando a mais recente sem oferta", async () => {
		const [conv] = await db
			.insert(conversations)
			.values({ channel: "web", status: "active", isSimulated: true })
			.returning({ id: conversations.id });
		conversas.push(conv.id);
		const [lead] = await db
			.insert(leads)
			.values({ conversationId: conv.id, stage: "novo", isSimulated: true })
			.returning({ id: leads.id });

		const [valida] = await db
			.insert(beviProposals)
			.values({
				conversationId: conv.id,
				leadId: lead.id,
				proposalId: "p-valida",
				ofertaId: "oferta-real",
				administradora: "CANOPUS",
				createdAt: new Date("2026-11-04T10:00:00Z"),
			})
			.returning({ id: beviProposals.id });
		await db.insert(beviProposals).values({
			conversationId: conv.id,
			leadId: lead.id,
			proposalId: "p-vazia",
			ofertaId: null,
			createdAt: new Date("2026-11-04T11:00:00Z"),
		});

		const r = await createMesaHandoff({ leadId: lead.id });
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.proposal?.id).toBe(valida.id);
	});
});
