// Sala de guerra (integration-db).
//
// As queries daqui são relativas a `now()`, então não dá pra isolar por janela
// de data como no relatório de performance. A saída é medir por DELTA: lê o
// estado, semeia, lê de novo e compara a diferença. Assim o teste convive com o
// que já existe no banco do workspace sem precisar limpá-lo.
//
// Skip se DATABASE_URL ausente.

import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb("agora — sala de guerra (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let queries: typeof import("./agora-queries");

	const visitIds: string[] = [];
	const convIds: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		queries = await import("./agora-queries");
	});

	afterAll(async () => {
		if (convIds.length > 0) {
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
		if (visitIds.length > 0) {
			await db.delete(schema.visits).where(inArray(schema.visits.id, visitIds));
		}
	});

	/** Conversa com a última mensagem no papel e na idade pedidos. */
	async function semearConversa(opcoes: {
		ultimaDe: "user" | "assistant";
		minutosAtras: number;
		simulada?: boolean;
		nome?: string;
		comOrigem?: { utmSource: string; utmCampaign: string };
	}): Promise<string> {
		let visitId: string | null = null;
		if (opcoes.comOrigem) {
			const [visita] = await db
				.insert(schema.visits)
				.values({
					visitorId: `v-${crypto.randomUUID()}`,
					channel: "web",
					utmSource: opcoes.comOrigem.utmSource,
					utmCampaign: opcoes.comOrigem.utmCampaign,
				})
				.returning({ id: schema.visits.id });
			visitIds.push(visita.id);
			visitId = visita.id;
		}

		const [conversa] = await db
			.insert(schema.conversations)
			.values({
				channel: "web",
				visitId,
				isSimulated: opcoes.simulada ?? false,
				contactName: opcoes.nome ?? null,
			})
			.returning({ id: schema.conversations.id });
		convIds.push(conversa.id);

		const quando = new Date(Date.now() - opcoes.minutosAtras * 60_000);
		// Uma fala do agente antes, pra a conversa ter história — e a última no
		// papel pedido, que é o que decide "esperando resposta".
		await db.insert(schema.messages).values({
			conversationId: conversa.id,
			role: "assistant",
			content: "olá, como posso ajudar?",
			createdAt: new Date(quando.getTime() - 60_000),
		});
		await db.insert(schema.messages).values({
			conversationId: conversa.id,
			role: opcoes.ultimaDe,
			content: opcoes.ultimaDe === "user" ? "quero simular um carro" : "claro, vamos lá",
			createdAt: quando,
		});

		return conversa.id;
	}

	describe("computePulso", () => {
		// `computePulso` conta o banco INTEIRO — não há como escopá-la a uma
		// conversa. Então a prova é por DELTA, e o delta só é confiável se nada
		// mais escrever entre as duas medições.
		//
		// 2026-08-05 — este bloco era flaky: `antes` era medido num `beforeAll` e
		// `depois` em três `it` separados. A janela entre as medições cobria a
		// semeadura inteira MAIS a execução dos casos anteriores, e qualquer outro
		// arquivo de integração criando conversa não-simulada nesse intervalo
		// entrava no delta (o banco de teste é compartilhado — dívida conhecida,
		// `docs/correcoes/inbox/2026-06-21-divida-infra-teste-qa-noturno.md` §2).
		// Medir os dois lados adjacentes, num caso só, encolhe a janela pro tempo
		// da semeadura. Não conserta o banco compartilhado; tira este arquivo da
		// linha de tiro.
		it("conta ao vivo, espera de resposta e ignora simulada — tudo no mesmo delta", async () => {
			const antes = await queries.computePulso();

			await semearConversa({ ultimaDe: "user", minutosAtras: 2 });
			await semearConversa({ ultimaDe: "user", minutosAtras: 20 });
			await semearConversa({ ultimaDe: "assistant", minutosAtras: 3 });
			// Fora da janela de uma hora: não é "ao vivo".
			await semearConversa({ ultimaDe: "user", minutosAtras: 180 });
			// Simulada: não pode mandar ninguém correr atrás de conversa de teste.
			await semearConversa({ ultimaDe: "user", minutosAtras: 1, simulada: true });

			const depois = await queries.computePulso();

			// 3 reais dentro da janela. A de 180 min ficou de fora; a simulada nunca
			// entra (se entrasse, seria 4).
			expect(depois.conversasAoVivo - antes.conversasAoVivo).toBe(3);
			// Duas com a última fala do cliente e dentro da janela.
			expect(depois.esperandoResposta - antes.esperandoResposta).toBe(2);
		});

		it("devolve todos os contadores como número, nunca indefinido", async () => {
			const pulso = await queries.computePulso();

			for (const [chave, valor] of Object.entries(pulso)) {
				expect(Number.isFinite(valor), `${chave} deveria ser número`).toBe(true);
			}
		});
	});

	describe("computeConversasAoVivo", () => {
		it("traz a última mensagem de cada conversa, não a primeira", async () => {
			const id = await semearConversa({ ultimaDe: "user", minutosAtras: 1, nome: "Joana Teste" });
			const lista = await queries.computeConversasAoVivo();
			const minha = lista.find((c) => c.conversationId === id);

			expect(minha).toMatchObject({
				nome: "Joana Teste",
				ultimaMensagemDe: "user",
				ultimaMensagem: "quero simular um carro",
				esperandoResposta: true,
			});
		});

		it("marca como não-esperando quando quem falou por último foi o agente", async () => {
			const id = await semearConversa({ ultimaDe: "assistant", minutosAtras: 1 });
			const lista = await queries.computeConversasAoVivo();

			expect(lista.find((c) => c.conversationId === id)?.esperandoResposta).toBe(false);
		});

		it("mostra a campanha que trouxe a pessoa", async () => {
			const id = await semearConversa({
				ultimaDe: "user",
				minutosAtras: 1,
				comOrigem: { utmSource: "facebook", utmCampaign: "plantao-teste" },
			});
			const lista = await queries.computeConversasAoVivo();

			expect(lista.find((c) => c.conversationId === id)?.origem).toMatchObject({
				tipo: "campanha",
				label: "facebook · plantao-teste",
			});
		});

		it("chama de Direto quem não tem visita ligada", async () => {
			const id = await semearConversa({ ultimaDe: "user", minutosAtras: 1 });
			const lista = await queries.computeConversasAoVivo();

			expect(lista.find((c) => c.conversationId === id)?.origem.label).toBe("Direto");
		});

		it("ordena da conversa mais recente pra mais antiga", async () => {
			const lista = await queries.computeConversasAoVivo();
			const tempos = lista.map((c) => new Date(c.ultimaAtividadeAt).getTime());

			expect([...tempos].sort((a, b) => b - a)).toEqual(tempos);
		});

		it("não devolve conversa simulada", async () => {
			const id = await semearConversa({ ultimaDe: "user", minutosAtras: 1, simulada: true });
			const lista = await queries.computeConversasAoVivo();

			expect(lista.find((c) => c.conversationId === id)).toBeUndefined();
		});

		it("respeita o limite pedido", async () => {
			const lista = await queries.computeConversasAoVivo(2);

			expect(lista.length).toBeLessThanOrEqual(2);
		});
	});

	describe("esperaCritica", () => {
		it("só alerta quando o cliente está esperando E o tempo passou do limite", async () => {
			const id = await semearConversa({ ultimaDe: "user", minutosAtras: 12 });
			const lista = await queries.computeConversasAoVivo();
			const critica = lista.find((c) => c.conversationId === id);

			expect(critica && queries.esperaCritica(critica)).toBe(true);
		});

		it("não alerta por conversa parada em que o agente já respondeu", async () => {
			const id = await semearConversa({ ultimaDe: "assistant", minutosAtras: 40 });
			const lista = await queries.computeConversasAoVivo();
			const calma = lista.find((c) => c.conversationId === id);

			expect(calma && queries.esperaCritica(calma)).toBe(false);
		});
	});
});
