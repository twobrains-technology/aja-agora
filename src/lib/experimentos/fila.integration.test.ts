// FIX-434 (D4) — a fila 50/50 do A/B do telefone, com banco real.
//
// ── O defeito que este arquivo prende ────────────────────────────────────────
//
// A atribuição era `FNV-1a(visitId) % 2` (moeda honesta, mas sem fila: dava 4
// seguidas no mesmo braço) e, pior, 4 de 25 conversas web pós-FIX-403 ficaram
// **sem braço** (`1758757e`, `d108a748`, `cc4f3bac`, `9b30b5ac`) — todas abertas
// por clique de categoria na home ("Automóvel"/"Imóvel"). A causa é de ordem: a
// conversa nasce COM o braço no insert, mas o `meta` da requisição era `{}` para
// conversa recém-criada (o `conv` do banco vem antes do insert) e o branch do
// clique de categoria gravava `{ ...meta, navigationStack }` — apagando o braço
// (e o `webCookie`). `persistMeta` SUBSTITUI a coluna inteira.
//
// ── O que este arquivo prova ─────────────────────────────────────────────────
//
//   1. o contador é ATÔMICO: 2N braços pedidos em PARALELO não perdem incremento
//      e fecham |A − B| ≤ 1;
//   2. em SÉRIE a alternância é estrita A, B, A, B;
//   3. `?variante=` força, grava `forcada: true` e NÃO consome a fila;
//   4. conversa já com braço mantém o braço — nenhum writer posterior o apaga;
//   5. o override de QA não apaga `desbloqueadoEm`/`recusado`;
//   6. o clique de categoria na home não apaga o braço (reproduz `1758757e`);
//   7. conversa `forcada` fica FORA do teste: não soma no resultado e cai em
//      "sem variante" no filtro do painel.
//
// Integração contra o Postgres do workspace (skip se `DATABASE_URL` ausente).
// Mocks: rate-limit, memória e a BORDA de conversa do agente (`@/lib/web/adapter`)
// — o turno do modelo não é o objeto aqui; o que se mede é o metadata persistido.
// PII falsa; tudo que é semeado é apagado no `afterAll`.

import { eq, inArray, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CHAVE_DO_TESTE_NO_METADATA, VARIANTES_DO_TELEFONE } from "@/lib/chat/variante-da-visita";
import { EXPERIMENTOS } from "@/lib/experimentos/registro";

if (!process.env.IDENTITY_ENC_KEY) {
	process.env.IDENTITY_ENC_KEY = Buffer.alloc(32, 9).toString("base64");
}

vi.mock("@/lib/middleware/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true }) }));

const adapter = vi.hoisted(() => ({
	pipeUserTurn: vi.fn(async (_args: { conversationId: string; userText: string }) => {}),
	pipeDirectiveTurn: vi.fn(async (_args: unknown) => ({ emittedVisible: true })),
	pipeGatePrompt: vi.fn(async (_args: unknown) => {}),
	pipeTransitionTurn: vi.fn(async (_args: unknown) => {}),
}));

vi.mock("@/lib/web/adapter", () => adapter);

vi.mock("@/lib/memory/orchestrator-bridge", () => ({
	resolveIdentityForTurn: () => null,
	loadMemoryContextForTurn: vi.fn().mockResolvedValue(null),
	memorySystemMessageFromContext: () => null,
	storeMemoriesForTurn: vi.fn().mockResolvedValue(undefined),
}));

const { POST } = await import("@/app/api/chat/route");

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const TELEFONE = EXPERIMENTOS[0];
if (!TELEFONE) throw new Error("o registro precisa do experimento do telefone");

let ipSeq = 0;
function makePostReq(body: unknown): NextRequest {
	ipSeq += 1;
	return new NextRequest("http://localhost/api/chat", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-forwarded-for": `10.13.0.${(ipSeq % 250) + 1}`,
		},
		body: JSON.stringify(body),
	});
}

describeIfDb("fila 50/50 do A/B do telefone (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let fila: typeof import("./fila");
	let resultado: typeof import("@/lib/chat/resultado-do-teste-do-telefone");
	let filtro: typeof import("@/lib/admin/filtro-variante");

	const convIds: string[] = [];
	const visitaIds: string[] = [];
	/** Experimentos semeados SÓ para o teste da fila — apagados no final. */
	const experimentosDeTeste: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		fila = await import("./fila");
		resultado = await import("@/lib/chat/resultado-do-teste-do-telefone");
		filtro = await import("@/lib/admin/filtro-variante");
	});

	afterAll(async () => {
		if (!db) return;
		if (convIds.length > 0) {
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
		if (visitaIds.length > 0) {
			await db.delete(schema.visits).where(inArray(schema.visits.id, visitaIds));
		}
		if (experimentosDeTeste.length > 0) {
			await db
				.delete(schema.experimentoFila)
				.where(inArray(schema.experimentoFila.experimento, experimentosDeTeste));
		}
	});

	async function lerMetadata(conversationId: string): Promise<Record<string, unknown>> {
		const [row] = await db
			.select({ metadata: schema.conversations.metadata })
			.from(schema.conversations)
			.where(eq(schema.conversations.id, conversationId));
		return (row?.metadata ?? {}) as Record<string, unknown>;
	}

	function testeDa(metadata: Record<string, unknown>): Record<string, unknown> {
		return (metadata[CHAVE_DO_TESTE_NO_METADATA] ?? {}) as Record<string, unknown>;
	}

	async function lerContador(experimento: string): Promise<number | null> {
		const [row] = await db
			.select({ proximo: schema.experimentoFila.proximo })
			.from(schema.experimentoFila)
			.where(eq(schema.experimentoFila.experimento, experimento));
		return row?.proximo ?? null;
	}

	/** Uma conversa web nova, pelo caminho real da rota (clique de categoria). */
	async function criarPorCliqueDeCategoria(input: {
		conversationId: string;
		category: "auto" | "imovel" | "moto";
		variante?: string;
		texto?: string;
	}): Promise<void> {
		const res = await POST(
			makePostReq({
				conversationId: input.conversationId,
				...(input.variante ? { variante: input.variante } : {}),
				action: { kind: "category", category: input.category },
				messages: [
					{
						role: "user",
						parts: [{ type: "text", text: input.texto ?? "Quero comprar um automóvel." }],
					},
				],
			}),
		);
		// Consumir o stream importa: sem isto o turno fica pendurado segurando
		// estado no processo e o teste seguinte entra no handler anterior.
		await res.text();
	}

	it("2N braços pedidos em PARALELO fecham |A − B| ≤ 1 e não perdem incremento", async () => {
		const experimento = `teste-b3-paralelo-${crypto.randomUUID()}`;
		experimentosDeTeste.push(experimento);

		const N = 40;
		const bracos = await Promise.all(
			Array.from({ length: N }, () => fila.bracoDaFila(experimento, VARIANTES_DO_TELEFONE)),
		);

		const A = bracos.filter((b) => b === "A").length;
		const B = bracos.filter((b) => b === "B").length;
		expect(A + B).toBe(N);
		expect(Math.abs(A - B)).toBeLessThanOrEqual(1);
		// 0-based: N incrementos atômicos ⇒ a última leitura é N − 1.
		expect(await lerContador(experimento)).toBe(N - 1);
	});

	it("em SÉRIE a alternância é estrita: A, B, A, B", async () => {
		const experimento = `teste-b3-serie-${crypto.randomUUID()}`;
		experimentosDeTeste.push(experimento);

		const bracos: string[] = [];
		for (let i = 0; i < 6; i++) {
			bracos.push(await fila.bracoDaFila(experimento, VARIANTES_DO_TELEFONE));
		}
		expect(bracos).toEqual(["A", "B", "A", "B", "A", "B"]);
	});

	it("?variante=A força o braço, grava forcada:true e NÃO consome a fila", async () => {
		const antes = await lerContador(TELEFONE.id);
		const id = crypto.randomUUID();
		convIds.push(id);

		await criarPorCliqueDeCategoria({ conversationId: id, category: "auto", variante: "A" });

		const teste = testeDa(await lerMetadata(id));
		expect(teste.variante).toBe("A");
		expect(teste.forcada).toBe(true);
		// A fila não andou: forçar é QA, não entrada do teste.
		expect(await lerContador(TELEFONE.id)).toBe(antes);
	});

	it("clique de categoria na home não apaga o braço nem o webCookie (reproduz 1758757e)", async () => {
		const id = crypto.randomUUID();
		convIds.push(id);

		await criarPorCliqueDeCategoria({ conversationId: id, category: "auto" });

		const metadata = await lerMetadata(id);
		const teste = testeDa(metadata);
		// A conversa nasceu com braço e o turno do clique NÃO pode apagá-lo.
		expect(["A", "B"]).toContain(teste.variante);
		// A mesma escrita apagava o vínculo com o cookie — o outro fato do insert.
		expect(typeof metadata.webCookie).toBe("string");
		// E o clique de categoria rodou o caminho da troca de persona.
		expect(adapter.pipeTransitionTurn).toHaveBeenCalled();
		expect(Array.isArray(metadata.navigationStack)).toBe(true);
	});

	it("conversa já com braço mantém o braço num segundo turno", async () => {
		const id = crypto.randomUUID();
		convIds.push(id);

		await criarPorCliqueDeCategoria({ conversationId: id, category: "imovel", variante: "B" });
		const primeiro = testeDa(await lerMetadata(id));
		expect(primeiro.variante).toBe("B");

		// Segundo turno SEM `?variante`: o sorteio não roda de novo.
		await criarPorCliqueDeCategoria({ conversationId: id, category: "imovel" });

		const teste = testeDa(await lerMetadata(id));
		expect(teste.variante).toBe("B");
	});

	it("o override de QA não apaga desbloqueadoEm/recusado", async () => {
		const id = crypto.randomUUID();
		convIds.push(id);
		await db.insert(schema.conversations).values({
			id,
			channel: "web",
			isSimulated: false,
			metadata: {
				[CHAVE_DO_TESTE_NO_METADATA]: {
					variante: "A",
					desbloqueadoEm: "2019-04-15T12:30:00.000Z",
					recusado: true,
				},
			},
		});

		await criarPorCliqueDeCategoria({ conversationId: id, category: "imovel", variante: "B" });

		const teste = testeDa(await lerMetadata(id));
		expect(teste.variante).toBe("B");
		expect(teste.forcada).toBe(true);
		expect(teste.desbloqueadoEm).toBe("2019-04-15T12:30:00.000Z");
		expect(teste.recusado).toBe(true);
	});

	it("conversa forcada fica FORA do resultado do teste", async () => {
		// Janela própria (2019-06) para não cruzar com as outras integrações.
		const de = new Date("2019-06-01T00:00:00Z");
		const ate = new Date("2019-06-30T23:59:59Z");
		const dentro = new Date("2019-06-15T12:00:00Z");

		async function semear(teste: Record<string, unknown>): Promise<void> {
			const [visita] = await db
				.insert(schema.visits)
				.values({
					visitorId: `teste-b3-${crypto.randomUUID()}`,
					channel: "web",
					createdAt: dentro,
				})
				.returning({ id: schema.visits.id });
			if (!visita) throw new Error("falha ao semear a visita");
			visitaIds.push(visita.id);
			const [conv] = await db
				.insert(schema.conversations)
				.values({
					visitId: visita.id,
					channel: "web",
					isSimulated: false,
					createdAt: dentro,
					metadata: { [CHAVE_DO_TESTE_NO_METADATA]: teste },
				})
				.returning({ id: schema.conversations.id });
			if (!conv) throw new Error("falha ao semear a conversa");
			convIds.push(conv.id);
		}

		await semear({ variante: "A" });
		await semear({ variante: "A", forcada: true });

		const r = await resultado.resultadoDoTesteDoTelefone(de, ate);
		const a = r.find((v) => v.variante === "A");
		// Só a conversa NORMAL soma; a forçada é "sem variante".
		expect(a?.visitas).toBe(1);
	});

	it("braço de conversa forcada cai em 'sem variante' no filtro do painel", async () => {
		const id = crypto.randomUUID();
		convIds.push(id);
		await db.insert(schema.conversations).values({
			id,
			channel: "web",
			isSimulated: false,
			metadata: { [CHAVE_DO_TESTE_NO_METADATA]: { variante: "A", forcada: true } },
		});

		const expressao = filtro.bracoDaConversaSql(TELEFONE, sql`c`);
		const { rows } = await db.execute<{ braco: string | null }>(
			sql`SELECT ${expressao} AS braco FROM conversations c WHERE c.id = ${id}`,
		);
		expect(rows[0]?.braco).toBeNull();

		// E o recorte "braço A" de fato NÃO alcança a conversa forçada.
		const condicaoA = filtro.condicaoDeBracoNaConversa(
			[{ experimento: CHAVE_DO_TESTE_NO_METADATA, braco: "A" }],
			sql`conversations`,
		);
		if (!condicaoA) throw new Error("o recorte A devia produzir condição");
		const { rows: contagem } = await db.execute<{ total: string }>(
			sql`SELECT count(*)::text AS total FROM conversations WHERE id = ${id} AND ${condicaoA}`,
		);
		expect(Number(contagem[0]?.total ?? 0)).toBe(0);
	});
});
