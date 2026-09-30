// O RECORTE POR BRAÇO DE EXPERIMENTO NA TELA DE REMARKETING (integration-db).
//
// A linha da régua É uma conversa (`remarketing_touches t JOIN conversations c`),
// então o braço é o da PRÓPRIA conversa, lido do metadata — não há regra de
// pessoa aqui (D10). O invariante que este arquivo protege é o da partição:
// `A + B + sem variante = todas`, e os contadores do topo (que saem das MESMAS
// linhas do recorte) têm que fechar com a lista.
//
// O que ele NÃO prova: que a rota passa o recorte para a consulta (isso é fiação
// da rota). Aqui se prova que a consulta, recebendo o recorte, devolve o balde
// certo — e que sem recorte o resultado é idêntico ao de hoje (C4).

import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CHAVE_DO_TESTE_NO_METADATA } from "@/lib/chat/variante-da-visita";
import type { RecorteAB } from "@/lib/experimentos/registro";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

// Janela própria, num mês aleatório do passado: o recorte fica isolado dos dados
// reais do workspace, e a partição pode ser afirmada sobre o que foi semeado.
const ANO = 1970 + Math.floor(Math.random() * 45);
const MES = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
const DE = new Date(`${ANO}-${MES}-01T00:00:00Z`);
const ATE = new Date(`${ANO}-${MES}-28T23:59:59Z`);
const DENTRO = new Date(`${ANO}-${MES}-15T12:00:00Z`);

const EXPERIMENTO = CHAVE_DO_TESTE_NO_METADATA;

function recorteDe(braco: string): RecorteAB {
	return [{ experimento: EXPERIMENTO, braco }];
}

/** Telefone FALSO — nenhuma PII real entra aqui. */
function telefoneFalso(): string {
	return `+55629${String(Math.floor(Math.random() * 1e8)).padStart(9, "0")}`;
}

describeIfDb("remarketing — recorte por braço de experimento (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let queries: typeof import("./remarketing-queries");

	const conversaIds: string[] = [];
	const contatoIds: string[] = [];

	/** As conversas semeadas por balde, para afirmar a partição por id. */
	const idsPorBalde = { A: [] as string[], B: [] as string[], sem: [] as string[] };

	async function semearConversaNaRegua(braco: "A" | "B" | "C" | null): Promise<void> {
		const [contato] = await db
			.insert(schema.contacts)
			.values({ phone: telefoneFalso() })
			.returning({ id: schema.contacts.id });
		contatoIds.push(contato.id);

		const [conversa] = await db
			.insert(schema.conversations)
			.values({
				channel: braco === null ? "whatsapp" : "web",
				contactId: contato.id,
				isSimulated: false,
				metadata: braco === null ? null : { [EXPERIMENTO]: { variante: String(braco) } },
				createdAt: DENTRO,
				updatedAt: DENTRO,
			})
			.returning({ id: schema.conversations.id });
		conversaIds.push(conversa.id);

		await db.insert(schema.remarketingTouches).values({
			conversationId: conversa.id,
			contactId: contato.id,
			objetivo: "moto",
			step: 1,
			status: "ATIVO",
			nextTouchAt: new Date(DENTRO.getTime() + 86_400_000),
			ultimoToqueEm: new Date(DENTRO.getTime() + 60_000),
			touches30d: 1,
			createdAt: DENTRO,
			updatedAt: DENTRO,
		});

		if (braco === "A") idsPorBalde.A.push(conversa.id);
		else if (braco === "B") idsPorBalde.B.push(conversa.id);
		else idsPorBalde.sem.push(conversa.id);
	}

	/** As linhas do recorte, restritas ao que este teste semeou. */
	function semeadas<T extends { conversationId: string }>(linhas: T[]): T[] {
		return linhas.filter((linha) => conversaIds.includes(linha.conversationId));
	}

	function ids(linhas: Array<{ conversationId: string }>): string[] {
		return semeadas(linhas)
			.map((linha) => linha.conversationId)
			.sort();
	}

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		queries = await import("./remarketing-queries");

		await semearConversaNaRegua("A");
		await semearConversaNaRegua("B");
		await semearConversaNaRegua(null); // WhatsApp: nasce identificado, sem metadata
		await semearConversaNaRegua("C"); // fora da allowlist ⇒ sem variante
	});

	afterAll(async () => {
		if (conversaIds.length > 0) {
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, conversaIds));
		}
		if (contatoIds.length > 0) {
			await db.delete(schema.contacts).where(inArray(schema.contacts.id, contatoIds));
		}
	});

	it("sem recorte, as quatro linhas semeadas aparecem", async () => {
		const linhas = await queries.listarReguas({ de: DE, ate: ATE, objetivo: null });
		expect(semeadas(linhas)).toHaveLength(4);
	});

	it("recorte 'A' e 'B' devolvem só o balde respectivo", async () => {
		const a = await queries.listarReguas({
			de: DE,
			ate: ATE,
			objetivo: null,
			recorte: recorteDe("A"),
		});
		const b = await queries.listarReguas({
			de: DE,
			ate: ATE,
			objetivo: null,
			recorte: recorteDe("B"),
		});

		expect(ids(a)).toEqual([...idsPorBalde.A].sort());
		expect(ids(b)).toEqual([...idsPorBalde.B].sort());
	});

	it("'sem variante' inclui o WhatsApp e o metadata fora da allowlist", async () => {
		const sem = await queries.listarReguas({
			de: DE,
			ate: ATE,
			objetivo: null,
			recorte: recorteDe("sem-variante"),
		});
		expect(ids(sem)).toEqual([...idsPorBalde.sem].sort());
	});

	it("a partição fecha: A + B + sem variante = todas", async () => {
		const [todas, a, b, sem] = await Promise.all([
			queries.listarReguas({ de: DE, ate: ATE, objetivo: null }),
			queries.listarReguas({ de: DE, ate: ATE, objetivo: null, recorte: recorteDe("A") }),
			queries.listarReguas({ de: DE, ate: ATE, objetivo: null, recorte: recorteDe("B") }),
			queries.listarReguas({
				de: DE,
				ate: ATE,
				objetivo: null,
				recorte: recorteDe("sem-variante"),
			}),
		]);

		const soma = semeadas(a).length + semeadas(b).length + semeadas(sem).length;
		expect(soma).toBe(semeadas(todas).length);
	});

	it("os contadores do topo fecham com as linhas do recorte", async () => {
		const a = await queries.listarReguas({
			de: DE,
			ate: ATE,
			objetivo: null,
			recorte: recorteDe("A"),
		});
		expect(semeadas(a)).toHaveLength(idsPorBalde.A.length);
	});

	it("recorte vazio é o MESMO resultado de hoje (C4)", async () => {
		const semParametro = await queries.listarReguas({ de: DE, ate: ATE, objetivo: null });
		const comVazio = await queries.listarReguas({ de: DE, ate: ATE, objetivo: null, recorte: [] });
		expect(comVazio).toEqual(semParametro);
	});

	it("experimento desconhecido no recorte não filtra (nunca tela vazia)", async () => {
		const linhas = await queries.listarReguas({
			de: DE,
			ate: ATE,
			objetivo: null,
			recorte: [{ experimento: "teste-que-nao-existe", braco: "A" }],
		});
		expect(semeadas(linhas)).toHaveLength(4);
	});
});
