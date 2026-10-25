import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { conversations, leads } from "@/db/schema";
import { loadIdentity, storeIdentity } from "./identity";
import { reloadMeta } from "./meta";

// L05 — o celular capturado no WEB tem que virar `leads.phone`: é o que faz a
// pessoa contar como identificada no painel (`performance-queries.ts` lê
// `leads.phone`/`email`). Este teste anda o caminho de verdade (identidade
// cifrada → lead), porque o defeito era justamente a costura entre os dois.

const CPF_VALIDO = "52998224725";
const conversasCriadas: string[] = [];

async function conversaDeTeste(channel: "web" | "whatsapp") {
	const [row] = await db
		.insert(conversations)
		.values({
			channel,
			waId: channel === "whatsapp" ? `SIM-${crypto.randomUUID()}` : null,
			metadata: {},
		})
		.returning({ id: conversations.id });
	conversasCriadas.push(row.id);
	return row.id;
}

/** Número que não existe no banco, pra não casar com contato de outra conversa. */
function celularInedito(): string {
	const sufixo = String(Math.floor(Math.random() * 100_000_000)).padStart(8, "0");
	return `119${sufixo}`;
}

afterAll(async () => {
	for (const id of conversasCriadas) {
		await db.delete(leads).where(eq(leads.conversationId, id));
		await db.delete(conversations).where(eq(conversations.id, id));
	}
});

describe("L05 — a identidade cifrada do web abastece o lead", () => {
	it("celular digitado na web vira leads.phone e a conversa aponta pro contato", async () => {
		const conversationId = await conversaDeTeste("web");
		const celular = celularInedito();

		await storeIdentity(conversationId, { cpf: CPF_VALIDO, celular });

		const lead = await db.query.leads.findFirst({
			where: eq(leads.conversationId, conversationId),
		});
		expect(lead?.phone).toBe(celular);

		const conversa = await db.query.conversations.findFirst({
			where: eq(conversations.id, conversationId),
			columns: { contactId: true },
		});
		expect(conversa?.contactId).not.toBeNull();
	});

	it("no WhatsApp o telefone já é a conversa: o waId NÃO é sobrescrito", async () => {
		const conversationId = await conversaDeTeste("whatsapp");
		const waIdOriginal = (
			await db.query.conversations.findFirst({
				where: eq(conversations.id, conversationId),
				columns: { waId: true },
			})
		)?.waId;

		await storeIdentity(conversationId, { cpf: CPF_VALIDO, celular: celularInedito() });

		const conversa = await db.query.conversations.findFirst({
			where: eq(conversations.id, conversationId),
			columns: { waId: true },
		});
		// O `waId` é o hash `SIM-…` que o fechamento usa pra achar o par de teste:
		// trocá-lo por um celular apontaria o contrato pro número errado.
		expect(conversa?.waId).toBe(waIdOriginal);
		expect(conversa?.waId).toMatch(/^SIM-/);
	});

	it("identidade sem celular (só CPF) não inventa telefone pro lead", async () => {
		const conversationId = await conversaDeTeste("web");

		await storeIdentity(conversationId, { cpf: CPF_VALIDO, celular: "" });

		const lead = await db.query.leads.findFirst({
			where: eq(leads.conversationId, conversationId),
		});
		expect(lead?.phone ?? null).toBeNull();
	});
});

describe("P272 — parcial é GUARDADO, completo é o que conta como identidade coletada", () => {
	it("só CPF fica cifrado e recuperável, e identityCollected NÃO é marcado", async () => {
		const conversationId = await conversaDeTeste("web");

		await storeIdentity(conversationId, { cpf: CPF_VALIDO, celular: "" });

		// O dado não se perde: é o que o pedido do celular no turno seguinte consome.
		expect(await loadIdentity(conversationId)).toEqual({ cpf: CPF_VALIDO, celular: "" });
		// E não prova identidade: a `main` só marcava o fato com o par CPF+celular.
		expect((await reloadMeta(conversationId)).identityCollected).not.toBe(true);
	});

	it("CPF + celular marca identityCollected", async () => {
		const conversationId = await conversaDeTeste("web");

		await storeIdentity(conversationId, { cpf: CPF_VALIDO, celular: celularInedito() });

		expect((await reloadMeta(conversationId)).identityCollected).toBe(true);
	});

	it("o pedaço que chegou antes não se perde quando o outro chega depois", async () => {
		const conversationId = await conversaDeTeste("web");
		const celular = celularInedito();

		await storeIdentity(conversationId, { cpf: CPF_VALIDO, celular: "" });
		await storeIdentity(conversationId, { cpf: "", celular });

		expect(await loadIdentity(conversationId)).toEqual({ cpf: CPF_VALIDO, celular });
		expect((await reloadMeta(conversationId)).identityCollected).toBe(true);
	});
});
