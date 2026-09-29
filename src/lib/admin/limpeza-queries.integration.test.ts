// A LIMPEZA COM PROPOSTA — o cruzamento que faltava (FIX-384, integration-db).
//
// O caso da cliente (WhatsApp 23/09): "De 01/09 a 21/09 – 5 clientes com
// proposta criada." Os 5 são TESTE — mesmo telefone, todas em 16/09. O painel
// exclui a conversa simulada e mostra 0; mas a proposta continua existindo na
// ADMINISTRADORA, e nada no relatório apontava para ela. A limpeza classificava
// por sinais de conversa e nunca olhava `bevi_proposals`.
//
// O que este arquivo protege: a conversa de teste COM proposta sai nomeada
// (`proposta_em_teste`) com a contagem; e uma proposta REAL — conversa de
// cliente de verdade — NUNCA entra no relatório por causa dela.
//
// Janela própria por execução, como o resto dos integration: as contagens são
// exatas, não "maior que zero". Skip se DATABASE_URL ausente.

import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const ANO = 1970 + Math.floor(Math.random() * 45);
const MES = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
const DE = new Date(`${ANO}-${MES}-01T00:00:00Z`);
const ATE = new Date(`${ANO}-${MES}-28T23:59:59Z`);
const DIA = new Date(`${ANO}-${MES}-16T15:35:00Z`);

// Telefone FALSO (PII nunca em arquivo versionado). O mesmo em todas as cinco,
// como no caso real.
const TELEFONE_DE_TESTE = "+5511900004242";

describeIfDb("limpeza — proposta criada em conversa de teste (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let limpeza: typeof import("./limpeza-queries");
	let exportacao: typeof import("@/lib/exportacao/limpeza");

	const convIds: string[] = [];

	/** Uma conversa na janela, com as propostas que o caso pede. */
	async function semearConversa(args: {
		isSimulated: boolean;
		propostas: number;
		waId?: string | null;
	}): Promise<string> {
		const [conversa] = await db
			.insert(schema.conversations)
			.values({
				channel: "whatsapp",
				waId: args.waId ?? null,
				isSimulated: args.isSimulated,
				createdAt: DIA,
				updatedAt: DIA,
			})
			.returning({ id: schema.conversations.id });
		convIds.push(conversa.id);

		for (let i = 0; i < args.propostas; i++) {
			await db.insert(schema.beviProposals).values({
				conversationId: conversa.id,
				proposalId: `prop-${crypto.randomUUID()}`,
				createdAt: new Date(DIA.getTime() + i * 60_000),
				updatedAt: new Date(DIA.getTime() + i * 60_000),
			});
		}
		return conversa.id;
	}

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		limpeza = await import("./limpeza-queries");
		exportacao = await import("@/lib/exportacao/limpeza");
	});

	afterAll(async () => {
		if (convIds.length > 0) {
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
	});

	it("lista a conversa de teste com 5 propostas como `proposta_em_teste`", async () => {
		const conversaId = await semearConversa({
			isSimulated: true,
			propostas: 5,
			waId: TELEFONE_DE_TESTE,
		});

		const candidatos = await limpeza.listarCandidatosDeLimpeza({ de: DE, ate: ATE });
		const linha = candidatos.find((c) => c.conversationId === conversaId);

		expect(linha).toBeTruthy();
		expect(linha?.motivo).toBe("proposta_em_teste");
		expect(linha?.propostas).toBe(5);
		// A data é a da ÚLTIMA proposta da conversa (a quinta, 16:09 — 4 min após
		// a primeira).
		expect(linha?.propostaCriadaEm).toBe(new Date(DIA.getTime() + 4 * 60_000).toISOString());
	});

	it("o CSV de limpeza leva a contagem e a data da proposta", async () => {
		const candidatos = await limpeza.listarCandidatosDeLimpeza({ de: DE, ate: ATE });
		const alvo = candidatos.find((c) => c.motivo === "proposta_em_teste");
		expect(alvo).toBeTruthy();

		const linhas = await exportacao.exportarCandidatosDeLimpeza({ de: DE, ate: ATE });
		const linha = linhas.find((l) => l.conversaId === alvo?.conversationId);
		expect(linha?.motivo).toBe("proposta_em_teste");
		expect(linha?.propostas).toBe("5");
		// Célula vazia é erro no arquivo — a data sai preenchida quando existe.
		expect(linha?.propostaCriadaEm).toBe(alvo?.propostaCriadaEm);
	});

	it("uma proposta REAL nunca entra no relatório por causa dela", async () => {
		// Conversa de cliente de verdade: não simulada, sem contato, sem mesa —
		// nenhum sinal de limpeza. A proposta dela é venda, não sujeira.
		const conversaId = await semearConversa({ isSimulated: false, propostas: 1 });
		const outroId = await semearConversa({ isSimulated: false, propostas: 3 });

		const candidatos = await limpeza.listarCandidatosDeLimpeza({ de: DE, ate: ATE });
		const ids = candidatos.map((c) => c.conversationId);

		expect(ids).not.toContain(conversaId);
		expect(ids).not.toContain(outroId);
	});
});
