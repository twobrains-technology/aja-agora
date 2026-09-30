// B6 (FIX-404) — o desfecho do teste NÃO pode inventar braço.
//
// O defeito que este arquivo prende: `registrarDesfechoDoTeste` gravava o
// desfecho e, quando não havia braço válido persistido no metadata, DERIVAVA o
// braço por hash (`varianteDaConversa`) e o persistia. Como o filtro novo do
// painel e a coluna da exportação leem o metadata, o hash virava "fato": a tela
// diria que a conversa nasceu num braço que nunca aconteceu.
//
// Regra: só o metadata é fato. Sem braço válido persistido, o metadata recebe o
// DESFECHO e nenhum `variante` — nem chute, nem `null` fingindo braço.
//
// Integração contra o banco do workspace (skip se DATABASE_URL ausente). PII
// falsa; o que é semeado é apagado no afterAll.

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CHAVE_DO_TESTE_NO_METADATA } from "./resultado-do-teste-do-telefone";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const DENTRO = new Date("2019-04-15T12:00:00Z");

type TestePersistido = Record<string, unknown>;

describeIfDb("registrarDesfechoDoTeste — o desfecho não inventa braço (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let servidor: typeof import("./telefone-ab-do-servidor");

	const convIds: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		servidor = await import("./telefone-ab-do-servidor");
	});

	afterAll(async () => {
		if (convIds.length > 0) {
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
	});

	async function semear(metadata: Record<string, unknown> | null): Promise<string> {
		const [conversa] = await db
			.insert(schema.conversations)
			.values({
				channel: "web",
				isSimulated: false,
				createdAt: DENTRO,
				updatedAt: DENTRO,
				metadata,
			})
			.returning({ id: schema.conversations.id });
		convIds.push(conversa.id);
		return conversa.id;
	}

	async function lerMetadata(conversationId: string): Promise<Record<string, unknown>> {
		const conversa = await db.query.conversations.findFirst({
			where: eq(schema.conversations.id, conversationId),
			columns: { metadata: true },
		});
		return (conversa?.metadata ?? {}) as Record<string, unknown>;
	}

	function testeDa(metadata: Record<string, unknown>): TestePersistido {
		return (metadata[CHAVE_DO_TESTE_NO_METADATA] ?? {}) as TestePersistido;
	}

	it("conversa SEM braço persistido recebe o desfecho e nenhum braço", async () => {
		const id = await semear(null);

		await servidor.registrarDesfechoDoTeste(id, {
			desbloqueadoEm: "2019-04-15T12:30:00.000Z",
		});

		const teste = testeDa(await lerMetadata(id));
		expect(teste.desbloqueadoEm).toBe("2019-04-15T12:30:00.000Z");
		expect("variante" in teste).toBe(false);
	});

	it("braço fora da allowlist é descartado, não trocado por um chute", async () => {
		const id = await semear({
			[CHAVE_DO_TESTE_NO_METADATA]: { variante: "C" },
		});

		await servidor.registrarDesfechoDoTeste(id, { recusado: true });

		const teste = testeDa(await lerMetadata(id));
		expect(teste.recusado).toBe(true);
		expect("variante" in teste).toBe(false);
	});

	it("braço válido persistido é mantido junto do desfecho", async () => {
		const id = await semear({
			[CHAVE_DO_TESTE_NO_METADATA]: { variante: "B" },
		});

		await servidor.registrarDesfechoDoTeste(id, { desbloqueadoEm: "2019-04-15T13:00:00.000Z" });

		const teste = testeDa(await lerMetadata(id));
		expect(teste.variante).toBe("B");
		expect(teste.desbloqueadoEm).toBe("2019-04-15T13:00:00.000Z");
	});

	it("as demais chaves do metadata ficam intactas", async () => {
		const id = await semear({
			webCookie: "cookie-falso",
			outraChave: { a: 1 },
			[CHAVE_DO_TESTE_NO_METADATA]: {},
		});

		await servidor.registrarDesfechoDoTeste(id, { recusado: true });

		const metadata = await lerMetadata(id);
		expect(metadata.webCookie).toBe("cookie-falso");
		expect(metadata.outraChave).toEqual({ a: 1 });
		expect(testeDa(metadata).recusado).toBe(true);
	});
});
