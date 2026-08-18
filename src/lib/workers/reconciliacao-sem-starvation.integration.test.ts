/**
 * O sinal existia, casava com o caso, e mesmo assim não olhou para ele.
 *
 * A conversa `fd76e393` (prod, 16/08/2026) terminou em `maxStageReached =
 * em_negociacao` com zero propostas — exatamente o que
 * `venda_prometida_sem_proposta` mede. E o campo `reconciliacao` do metadata
 * ficou `null`: o ciclo nunca avaliou aquela conversa.
 *
 * A causa é a seleção: `LIMIT 50` sem `ORDER BY` e sem cursor. O Postgres não
 * promete ordem nenhuma sem `ORDER BY`, e na prática devolve as mesmas linhas a
 * cada varredura — então, com mais de 50 conversas movimentadas na janela de
 * 48h, o excedente sofre starvation e nunca é medido. Um sinal que só enxerga
 * um subconjunto arbitrário da produção não é observabilidade; é a aparência
 * dela, que é pior, porque o painel fica verde.
 *
 * A correção é priorizar quem AINDA NÃO foi medido. Conversa já reconciliada
 * pode esperar o próximo ciclo; conversa nunca vista, não.
 *
 * Skip se DATABASE_URL ausente (mesmo padrão dos demais .integration).
 */

import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** Mais que o teto do ciclo, para que a seleção precise mesmo escolher. */
const JA_MEDIDAS = 60;
const NUNCA_MEDIDAS = 5;

describeIfDb("reconciliação — quem nunca foi medido não fica para trás", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let findConversasParaReconciliar: typeof import("./reconciliacao-cycle").findConversasParaReconciliar;

	const criadas: string[] = [];
	const semReconciliacao: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ findConversasParaReconciliar } = await import("./reconciliacao-cycle"));

		// As já medidas entram primeiro: sem ordenação, são elas que o Postgres
		// tende a devolver, e é assim que as novas somem.
		for (let i = 0; i < JA_MEDIDAS; i++) {
			const [c] = await db
				.insert(schema.conversations)
				.values({
					waId: `55629${String(100000 + i)}`,
					channel: "whatsapp",
					status: "active",
					metadata: {
						maxStageReached: "qualificado",
						reconciliacao: { assinatura: "medido-antes", em: new Date().toISOString() },
					},
				})
				.returning();
			criadas.push(c.id);
		}

		for (let i = 0; i < NUNCA_MEDIDAS; i++) {
			const [c] = await db
				.insert(schema.conversations)
				.values({
					waId: `55629${String(900000 + i)}`,
					channel: "whatsapp",
					status: "active",
					metadata: { maxStageReached: "em_negociacao" },
				})
				.returning();
			criadas.push(c.id);
			semReconciliacao.push(c.id);
		}
	});

	afterAll(async () => {
		if (criadas.length) {
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, criadas));
		}
	});

	it("toda conversa ainda não reconciliada entra no ciclo", async () => {
		const linhas = await findConversasParaReconciliar();
		const ids = new Set(linhas.map((l) => l.id));
		const faltando = semReconciliacao.filter((id) => !ids.has(id));
		expect(faltando).toEqual([]);
	});

	it("o ciclo continua limitado — a correção é de ordem, não de volume", async () => {
		const linhas = await findConversasParaReconciliar();
		expect(linhas.length).toBeLessThanOrEqual(50);
	});
});
