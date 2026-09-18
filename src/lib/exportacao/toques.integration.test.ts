// EXPORTAR TOQUES DA RÉGUA — uma linha por entrada (integration-db).

import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const ANO = 1970 + Math.floor(Math.random() * 45);
const MES = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
const DE = new Date(`${ANO}-${MES}-01T00:00:00Z`);
const ATE = new Date(`${ANO}-${MES}-28T23:59:59Z`);
const DENTRO = new Date(`${ANO}-${MES}-15T12:00:00Z`);

describeIfDb("exportação — toques da régua (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let toques: typeof import("./toques");

	const convIds: string[] = [];
	const contactIds: string[] = [];

	async function semear(args: {
		status: "ATIVO" | "OPTOUT";
		comProximoToque: boolean;
		motivoSaida: string | null;
	}): Promise<void> {
		const [contato] = await db
			.insert(schema.contacts)
			.values({ phone: `+55629${String(Math.floor(Math.random() * 1e8)).padStart(9, "0")}` })
			.returning({ id: schema.contacts.id });
		contactIds.push(contato.id);

		const [conversa] = await db
			.insert(schema.conversations)
			.values({ channel: "whatsapp", isSimulated: false, createdAt: DENTRO, updatedAt: DENTRO })
			.returning({ id: schema.conversations.id });
		convIds.push(conversa.id);

		await db.insert(schema.remarketingTouches).values({
			conversationId: conversa.id,
			contactId: contato.id,
			objetivo: "moto",
			step: 1,
			status: args.status,
			nextTouchAt: args.comProximoToque ? new Date(DENTRO.getTime() + 86_400_000) : null,
			ultimoToqueEm: new Date(DENTRO.getTime() + 60_000),
			touches30d: 1,
			motivoSaida: args.motivoSaida,
			createdAt: DENTRO,
			updatedAt: DENTRO,
		});
	}

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		toques = await import("./toques");
	});

	afterAll(async () => {
		if (convIds.length > 0) {
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
		if (contactIds.length > 0) {
			await db.delete(schema.contacts).where(inArray(schema.contacts.id, contactIds));
		}
	});

	it("uma linha por entrada, com o estado e o vazio declarado", async () => {
		await semear({ status: "ATIVO", comProximoToque: true, motivoSaida: null });
		await semear({ status: "OPTOUT", comProximoToque: false, motivoSaida: null });

		const linhas = await toques.exportarToquesDaRegua({ de: DE, ate: ATE });
		expect(linhas.length).toBeGreaterThanOrEqual(2);

		const ativo = linhas.find((l) => l.status === "ATIVO");
		expect(ativo?.motivoSaida).toBe("não aplicável: régua ativa");
		expect(ativo?.proximoToque).toMatch(/-03:00$/);

		const optout = linhas.find((l) => l.status === "OPTOUT");
		expect(optout?.proximoToque).toBe("indisponível: sem próximo toque agendado");
		expect(optout?.motivoSaida).toBe("indisponível: motivo de saída não registrado");

		for (const linha of linhas) {
			for (const valor of Object.values(linha)) expect(valor).not.toBe("");
		}
	});

	it("a contagem bate com as linhas", async () => {
		const { toques: contagem } = await toques.contarToques({ de: DE, ate: ATE });
		const linhas = await toques.exportarToquesDaRegua({ de: DE, ate: ATE });
		expect(linhas.length).toBe(contagem);
	});
});
