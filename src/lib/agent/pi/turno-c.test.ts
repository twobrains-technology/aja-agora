// O QUE O TURNO PRECISA VOLTAR A PRODUZIR — onda 6, bloco TURNO-C.
//
// Cada `describe` é uma linha da re-auditoria (reauditoria-310e.md) com o seu
// teste, pelo caminho real do turno (stream + banco), não pela expressão:
//
//  · P188/P263 (L11) — o número que serve como telefone E passa no DV do CPF não
//    é consumido como CPF fora do contexto em que o CPF foi pedido;
//  · P157 — o card sai no RESULTADO da ferramenta, entre as duas falas;
//  · P217/P273 (N09) — o livro-caixa grava o cache do prompt e o custo das
//    quatro parcelas, numa linha por turno.
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { conversations, messages, usoDeIa } from "@/db/schema";
import type { GroupSummary } from "@/lib/adapters/types";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import { loadIdentity } from "@/lib/conversation/identity";
import { decidirCpfDoTexto } from "@/lib/whatsapp/identify-capture";
import { subirServidorRoteirizado } from "./testing/servidor-roteirizado";
import { capturarIdentidadeDoTexto, createRunTurnLivre } from "./turno-livre";

const criadas: string[] = [];
afterEach(async () => {
	vi.unstubAllEnvs();
	for (const id of criadas.splice(0)) {
		await db.delete(usoDeIa).where(eq(usoDeIa.conversationId, id));
		await db.delete(messages).where(eq(messages.conversationId, id));
		await db.delete(conversations).where(eq(conversations.id, id));
	}
});

async function novaConversa(): Promise<string> {
	const [conv] = await db
		.insert(conversations)
		.values({ channel: "web", status: "active", isSimulated: true, contactName: null })
		.returning({ id: conversations.id });
	criadas.push(conv.id);
	return conv.id;
}

const cartas: GroupSummary[] = [
	{
		id: "grupo-itaú-1",
		administradora: "ITAU",
		category: "auto",
		creditValue: 80_000,
		monthlyPayment: 812,
		adminFeePercent: 18,
		termMonths: 120,
		totalParticipants: 900,
		availableSlots: 12,
	},
];

/** Um turno inteiro, com o "modelo" roteirizado e a busca falsa na fronteira. */
async function rodarTurno(args: {
	conversationId: string;
	userText: string;
	beats: Parameters<typeof subirServidorRoteirizado>[0];
}): Promise<{ eventos: TurnEvent[]; fechar: () => Promise<void> }> {
	const servidor = await subirServidorRoteirizado(args.beats);
	const run = createRunTurnLivre({
		provider: { id: "litellm", baseUrl: servidor.url, apiKey: "teste", model: "roteirizado" },
		busca: async () => cartas,
	});
	const eventos: TurnEvent[] = [];
	for await (const ev of run({
		channel: "web",
		conversationId: args.conversationId,
		userText: args.userText,
		isUserTurn: true,
		contactName: null,
	}))
		eventos.push(ev);
	return { eventos, fechar: servidor.fechar };
}

// ── P188/P263 (L11) ──────────────────────────────────────────────────────────
//
// `11900000083` é celular de São Paulo (DDD 11 + 9º dígito) E passa no dígito
// verificador do CPF, como ~1% dos celulares. O capturador do WhatsApp já
// resolvia isso (`identify-capture.test.ts` usa o mesmo número); o do Pi levava
// o número como CPF, porque o passo do CPF rodava antes do telefone.
const AMBIGUO = "11900000083";

describe("P188/P263 — número ambíguo é TELEFONE, não CPF", () => {
	it("os dois capturadores classificam o mesmo número do mesmo jeito", () => {
		expect(decidirCpfDoTexto(AMBIGUO, { pedidoDeCpf: false })).toEqual({ outcome: "none" });

		const pi = capturarIdentidadeDoTexto(AMBIGUO, null);
		expect(pi.recebeuCpf).toBe(false);
		expect(pi.recebeuCelular).toBe(true);
		expect(pi.identidade).toEqual({ cpf: "", celular: AMBIGUO });
		expect(pi.textoLimpo).not.toContain(AMBIGUO);
	});

	it("dito com separador de telefone continua telefone", () => {
		const r = capturarIdentidadeDoTexto("meu número é (11) 90000-0083", null);
		expect(r.recebeuCpf).toBe(false);
		expect(r.identidade).toEqual({ cpf: "", celular: AMBIGUO });
	});

	it("o contexto que torna o número CPF é o cliente DECLARAR o dado", () => {
		const comAPalavra = capturarIdentidadeDoTexto(`meu cpf é ${AMBIGUO}`, null);
		expect(comAPalavra.recebeuCpf).toBe(true);
		expect(comAPalavra.identidade).toEqual({ cpf: AMBIGUO, celular: "" });

		// CPF formatado é inequívoco: não há como ser telefone.
		const formatado = capturarIdentidadeDoTexto("119.000.000-83", null);
		expect(formatado.recebeuCpf).toBe(true);
		expect(formatado.identidade).toEqual({ cpf: AMBIGUO, celular: "" });
	});

	it("o turno inteiro guarda o número como celular e não promove a identidade", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: `meu número é ${AMBIGUO}`,
			beats: [{ text: "Anotado! E qual valor de carta você quer?" }],
		});
		await turno.fechar();

		const identidade = await loadIdentity(conversationId);
		expect(identidade?.cpf).toBe("");
		expect(identidade?.celular).toBe(AMBIGUO);

		// O número não vai em claro ao modelo, ao banco nem ao histórico.
		const [linha] = await db
			.select({ content: messages.content })
			.from(messages)
			.where(eq(messages.conversationId, conversationId));
		expect(linha?.content).not.toContain(AMBIGUO);
		expect(linha?.content).toContain("[telefone recebido e guardado]");
	});
});

// ── P157 ────────────────────────────────────────────────────────────────────
describe("P157 — o card sai no resultado da ferramenta, na ordem do stream", () => {
	const indiceDoCard = (eventos: TurnEvent[]) =>
		eventos.findIndex(
			(e) =>
				e.type === "artifact" &&
				(e as { artifactType: string }).artifactType === "comparison_table",
		);
	const indiceDaFala = (eventos: TurnEvent[], trecho: string) =>
		eventos.findIndex((e) => e.type === "text-delta" && e.text.includes(trecho));

	it("o turno produz texto → card → texto (e não texto → texto → card)", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "quero um carro de 80 mil",
			beats: [
				// A fala que ANTECEDE a busca vem na mesma mensagem do tool_call, como o
				// provedor entrega; a resposta vem depois do resultado da ferramenta.
				{
					text: "Boa! Um carro de 80 mil é bem possível.",
					toolCalls: [{ name: "buscar_cartas", args: { categoria: "auto" } }],
				},
				{ text: "Achei essas três. Alguma te interessa?" },
			],
		});
		await turno.fechar();

		const antes = indiceDaFala(turno.eventos, "Boa!");
		const card = indiceDoCard(turno.eventos);
		const depois = indiceDaFala(turno.eventos, "Achei essas três");
		expect(antes).toBeGreaterThanOrEqual(0);
		expect(card).toBeGreaterThan(antes);
		expect(depois).toBeGreaterThan(card);
		// O card abre balão próprio (R5.1) e sai UMA vez: o mesmo payload não volta
		// no fim do turno.
		expect(turno.eventos[card - 1]?.type).toBe("text-boundary");
		expect(turno.eventos.filter((e) => e.type === "artifact")).toHaveLength(1);
	});

	it("a persistência grava a MESMA ordem: fala → card → fala", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "quero um carro de 80 mil",
			beats: [
				{
					text: "Boa! Um carro de 80 mil é bem possível.",
					toolCalls: [{ name: "buscar_cartas", args: { categoria: "auto" } }],
				},
				{ text: "Achei essas três. Alguma te interessa?" },
			],
		});
		await turno.fechar();

		const linhas = await db
			.select({ role: messages.role, content: messages.content })
			.from(messages)
			.where(eq(messages.conversationId, conversationId))
			.orderBy(messages.createdAt);
		const ordem = linhas
			.filter((l) => l.role === "assistant")
			.map((l) => (l.content.startsWith("[card: ") ? l.content : "fala"));
		expect(ordem).toEqual(["fala", "[card: comparison_table]", "fala"]);
	});
});

// ── P217/P273 (N09) ─────────────────────────────────────────────────────────
describe("P217/P273 — o livro-caixa do turno grava cache e custo completos", () => {
	it("uma linha por turno, com o input LÍQUIDO de cache e as quatro parcelas no custo", async () => {
		vi.stubEnv("AI_MODEL", "claude-haiku-4-5");
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "oi, quero um carro",
			beats: [
				{
					text: "Oi! O que você quer comprar?",
					usage: {
						prompt_tokens: 120_000,
						completion_tokens: 400,
						cacheRead: 100_000,
						cacheWrite: 5_000,
					},
				},
			],
		});
		await turno.fechar();

		const linhas = await db
			.select()
			.from(usoDeIa)
			.where(eq(usoDeIa.conversationId, conversationId));
		expect(linhas).toHaveLength(1);
		expect(linhas[0]).toMatchObject({
			modelo: "claude-haiku-4-5",
			// 120.000 de prompt chegam como 15.000 de entrada + 100.000 lidos + 5.000
			// escritos: o input do provedor é LÍQUIDO de cache.
			tokensInput: 15_000,
			tokensOutput: 400,
			tokensCacheRead: 100_000,
			tokensCacheWrite: 5_000,
		});
		// Entrada 1,5 + saída 0,2 + leitura 1,0 + escrita 0,625 = 3,325 centavos.
		// Sem o cache na conta seriam 1,7 (2 centavos): o 3 prova que ele entrou.
		expect(linhas[0]?.custoUsdCents).toBe(3);
	});

	it("três beats subcentavo somam o custo ANTES de arredondar (N09)", async () => {
		vi.stubEnv("AI_MODEL", "qwen3.6-flash");
		const conversationId = await novaConversa();
		const beatSubcentavo = {
			usage: { prompt_tokens: 80_000, completion_tokens: 0 },
		};
		const turno = await rodarTurno({
			conversationId,
			userText: "quero um carro de 80 mil",
			beats: [
				{
					toolCalls: [{ id: "call-1", name: "buscar_cartas", args: { categoria: "auto" } }],
					...beatSubcentavo,
				},
				{
					toolCalls: [{ id: "call-2", name: "buscar_cartas", args: { categoria: "auto" } }],
					...beatSubcentavo,
				},
				{ text: "Achei essas três. Alguma te interessa?", ...beatSubcentavo },
			],
		});
		await turno.fechar();

		const linhas = await db
			.select()
			.from(usoDeIa)
			.where(eq(usoDeIa.conversationId, conversationId));
		expect(linhas).toHaveLength(1);
		expect(linhas[0]?.tokensInput).toBe(240_000);
		// 3 × 0,4 centavo = 1,2 → 1 centavo. Arredondando por beat daria 0 + 0 + 0.
		expect(linhas[0]?.custoUsdCents).toBe(1);
		// Provedor que não reporta cache deixa a coluna NULA (não medida), não zero.
		expect(linhas[0]?.tokensCacheRead).toBeNull();
		expect(linhas[0]?.tokensCacheWrite).toBeNull();
	});
});
