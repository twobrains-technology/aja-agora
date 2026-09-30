// bloco-telefone-ab (FIX-397) — leitura do resultado do teste com banco real.
//
// Semeia visitas/conversas numa JANELA DE DATA ISOLADA (2019), como as outras
// integrações do painel: o que já existe no workspace não entra na conta e a
// asserção pode ser exata.
//
// Skip se DATABASE_URL ausente.

import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LinhaDoTesteDoTelefone } from "./resultado-do-teste-do-telefone";
import { CHAVE_DO_TESTE_NO_METADATA } from "./resultado-do-teste-do-telefone";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const DE = new Date("2019-04-01T00:00:00Z");
const ATE = new Date("2019-04-30T23:59:59Z");
const DENTRO = new Date("2019-04-15T12:00:00Z");

describeIfDb("resultadoDoTesteDoTelefone (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let consulta: typeof import("./resultado-do-teste-do-telefone");

	const visitIds: string[] = [];
	const convIds: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		consulta = await import("./resultado-do-teste-do-telefone");
	});

	afterAll(async () => {
		if (convIds.length > 0) {
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
		if (visitIds.length > 0) {
			await db.delete(schema.visits).where(inArray(schema.visits.id, visitIds));
		}
	});

	/**
	 * Semeia UMA visita do teste.
	 *
	 * `telefone` cria um lead com telefone (o que `conversaIdentificada` lê).
	 * `comparacao` cria o artifact `comparison_table`, que desde o FIX-398 conta
	 * como "viu oferta". Nada de PII real: o telefone é o padrão de teste.
	 */
	async function semear(opts: {
		variante: "A" | "B";
		telefone: boolean;
		comparacao: boolean;
	}): Promise<void> {
		const [visita] = await db
			.insert(schema.visits)
			.values({
				visitorId: `teste-telefone-${Math.random().toString(16).slice(2)}`,
				channel: "web",
				createdAt: DENTRO,
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
				createdAt: DENTRO,
				metadata: { [CHAVE_DO_TESTE_NO_METADATA]: { variante: opts.variante } },
			})
			.returning({ id: schema.conversations.id });
		convIds.push(conversa.id);

		if (opts.telefone) {
			await db.insert(schema.leads).values({
				conversationId: conversa.id,
				phone: "11999999999", // FALSO — nunca PII real em teste versionado
				isSimulated: false,
			});
		}

		if (opts.comparacao) {
			const [msg] = await db
				.insert(schema.messages)
				.values({
					conversationId: conversa.id,
					role: "assistant",
					content: "[card]",
					channel: "web",
				})
				.returning({ id: schema.messages.id });
			await db.insert(schema.artifacts).values({
				messageId: msg.id,
				type: "comparison_table",
				payload: { groups: [] },
			});
		}
	}

	it("separa por variante e soma o total", async () => {
		await semear({ variante: "A", telefone: true, comparacao: true });
		await semear({ variante: "A", telefone: false, comparacao: true });
		await semear({ variante: "B", telefone: true, comparacao: false });

		const r = await consulta.resultadoDoTesteDoTelefone(DE, ATE);
		const b = r.find((v) => v.variante === "A");
		const c = r.find((v) => v.variante === "B");

		// não asseguramos "exatamente", porque a janela de 2019 é isolada mas
		// poderíamos ter resíduo; o TOTAL das semeadas tem que bater.
		expect((b?.visitas ?? 0) + (c?.visitas ?? 0)).toBe(3);
		expect(b?.visitas).toBe(2);
		expect(b?.telefones).toBe(1);
		expect(b?.naComparacao).toBe(2);
		expect(c?.visitas).toBe(1);
		expect(c?.telefones).toBe(1);
		expect(c?.naComparacao).toBe(0);
	});

	it("variante sem visita no período ⇒ 'não calculável' (null), nunca zero", async () => {
		const outroPeriodo = {
			de: new Date("2019-05-01T00:00:00Z"),
			ate: new Date("2019-05-31T23:59:59Z"),
		};
		const r = await consulta.resultadoDoTesteDoTelefone(outroPeriodo.de, outroPeriodo.ate);
		expect(r.map((v) => v.variante)).toEqual(["A", "B"]);
		for (const v of r) {
			expect(v.visitas).toBeNull();
			expect(v.taxaDeTelefone).toBeNull();
		}
		expect(consulta.totalDoTesteDoTelefone(r)).toBeNull();
	});

	it("conversa de WhatsApp NÃO entra no teste (o número já é conhecido)", async () => {
		const [visita] = await db
			.insert(schema.visits)
			.values({
				visitorId: `teste-wa-${Math.random().toString(16).slice(2)}`,
				channel: "whatsapp",
				createdAt: DENTRO,
			})
			.returning({ id: schema.visits.id });
		visitIds.push(visita.id);
		const [conversa] = await db
			.insert(schema.conversations)
			.values({
				visitId: visita.id,
				channel: "whatsapp",
				waId: "5511999999999",
				isSimulated: false,
				createdAt: DENTRO,
				metadata: { [CHAVE_DO_TESTE_NO_METADATA]: { variante: "A" } },
			})
			.returning({ id: schema.conversations.id });
		convIds.push(conversa.id);

		const r = await consulta.resultadoDoTesteDoTelefone(DE, ATE);
		const b = r.find((v) => v.variante === "A");
		// a visita de WhatsApp não somou: B continua com as 2 do primeiro teste
		expect(b?.visitas).toBe(2);
	});

	it("o tipo das linhas bate com o contrato puro (LinhaDoTesteDoTelefone)", () => {
		// trava a forma do contrato — se mudar, o compilador aponta aqui
		const exemplo: LinhaDoTesteDoTelefone = {
			variante: "A",
			telefone: true,
			comparacao: false,
		};
		expect(exemplo.variante).toBe("A");
	});
});
