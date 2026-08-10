// O AGENTE cala quando a mesa assume — e volta quando o atendimento encerra.
//
// Achado em 2026-08-10: `claimMesaHandoff` marcava dono e movia a raia, mas
// nunca tocava em `conversations.status`. O `processor.ts` só desvia pro humano
// quando o status é `handed_off` (`getHandoffState` → `isHandedOff`), então,
// depois do "Vou atender", o cliente respondia e o AGENTE respondia de volta —
// enquanto o atendente escrevia pelo painel. Duas vozes no mesmo número, e o
// cliente sem saber com quem falava.
//
// Isto é invariante, não conversa: vale como código e é provado contra o banco.

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb("mesa assume → agente cala", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let claimMesaHandoff: typeof import("./handoff").claimMesaHandoff;
	let closeMesaHandoff: typeof import("./handoff").closeMesaHandoff;
	let createMesaHandoff: typeof import("./handoff").createMesaHandoff;

	const criados = { convs: [] as string[], attendants: [] as string[] };

	function fonePreciso() {
		return `5563${randomUUID().replace(/\D/g, "").slice(0, 9).padEnd(9, "0")}`;
	}

	async function semearCaso() {
		const waId = fonePreciso();
		const [conv] = await db
			.insert(schema.conversations)
			.values({ channel: "whatsapp", status: "active", waId, metadata: {} })
			.returning({ id: schema.conversations.id });
		criados.convs.push(conv.id);

		const [lead] = await db
			.insert(schema.leads)
			.values({
				conversationId: conv.id,
				name: "Cliente Silêncio",
				phone: waId,
				stage: "na_administradora",
			})
			.returning({ id: schema.leads.id });

		const [att] = await db
			.insert(schema.mesaAttendants)
			.values({ nome: "Atendente Silêncio", whatsapp: fonePreciso(), isActive: true })
			.returning({ id: schema.mesaAttendants.id });
		criados.attendants.push(att.id);

		const criado = await createMesaHandoff({ leadId: lead.id });
		if (!criado.ok) throw new Error(`não consegui criar o handoff: ${JSON.stringify(criado)}`);

		return { conversationId: conv.id, handoffId: criado.handoff.id, attendantId: att.id };
	}

	async function statusDaConversa(id: string) {
		const [c] = await db
			.select({ status: schema.conversations.status })
			.from(schema.conversations)
			.where(eq(schema.conversations.id, id))
			.limit(1);
		return c?.status;
	}

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ claimMesaHandoff, closeMesaHandoff, createMesaHandoff } = await import("./handoff"));
	});

	afterAll(async () => {
		for (const id of criados.convs) {
			await db.delete(schema.conversations).where(eq(schema.conversations.id, id));
		}
		for (const id of criados.attendants) {
			await db.delete(schema.mesaAttendants).where(eq(schema.mesaAttendants.id, id));
		}
	});

	it("depois do claim, a conversa fica handed_off — o agente não responde mais", async () => {
		const caso = await semearCaso();
		expect(await statusDaConversa(caso.conversationId)).toBe("active");

		const r = await claimMesaHandoff(caso.handoffId, caso.attendantId);
		expect(r.ok).toBe(true);

		// É ESTE valor que o processor.ts lê pra desviar o turno pro humano.
		expect(await statusDaConversa(caso.conversationId)).toBe("handed_off");
	});

	it("ao encerrar o atendimento, a conversa volta pro agente", async () => {
		const caso = await semearCaso();
		await claimMesaHandoff(caso.handoffId, caso.attendantId);
		expect(await statusDaConversa(caso.conversationId)).toBe("handed_off");

		const fechado = await closeMesaHandoff(caso.handoffId);
		expect(fechado.ok).toBe(true);

		// Sem isto a conversa ficaria muda pra sempre: humano saiu, agente calado.
		expect(await statusDaConversa(caso.conversationId)).toBe("active");
	});

	it("quem perde a corrida do claim não mexe no status da conversa", async () => {
		const caso = await semearCaso();
		const [outro] = await db
			.insert(schema.mesaAttendants)
			.values({ nome: "Atendente B", whatsapp: fonePreciso(), isActive: true })
			.returning({ id: schema.mesaAttendants.id });
		criados.attendants.push(outro.id);

		await claimMesaHandoff(caso.handoffId, caso.attendantId);
		const perdedor = await claimMesaHandoff(caso.handoffId, outro.id);

		expect(perdedor.ok).toBe(false);
		// Segue handed_off pelo dono legítimo — o perdedor não reverte nada.
		expect(await statusDaConversa(caso.conversationId)).toBe("handed_off");
	});
});
