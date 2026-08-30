// O servidor só lê uma resposta como NOME quando foi ELE quem perguntou.
//
// ── O defeito, e por que ele nasceu ─────────────────────────────────────────
//
// `captureAnswerNode` capturava o nome sempre que o gate ativo fosse `name`.
// Isso era seguro enquanto esse gate só existia no PRIMEIRO contato, onde a
// única pergunta na mesa é o nome — e o comentário do próprio arquivo dizia
// exatamente isso: "aqui dentro do gate a heurística é segura porque a pergunta
// ACABOU de ser feita".
//
// Em 30/08/2026 o gate `name` desceu para depois do valor do bem (para não
// gastar a primeira resposta numa pergunta — ver
// `qualify-state.primeira-resposta-tem-numero.test.ts`). A premissa quebrou:
// dali em diante o gate pode estar ativo enquanto o MODELO conversa sobre outra
// coisa, e a resposta do cliente é para ele, não para o funil.
//
//   🤖 (modelo)  Boa escolha. Prefere sedã ou SUV?
//   👤           SUV
//   → contactName = "Suv"
//
// Não é hipótese: foi reproduzido no mesmo dia, e o lead chegou ao banco
// chamado "Suv".
//
// ── Por que a correção é esta, e não mais uma palavra na lista ─────────────
//
// O projeto já tinha três leads reais com nome de palavra solta — "Uma",
// "Sujo", "Voltei" — e a defesa era uma lista em `ehNomeProprioPlausivel`. A
// lista funciona para a palavra que já apareceu e não para a próxima: "SUV",
// "Sedã", "Prata", "Automático" e o resto do vocabulário de carro estão todos
// fora dela. É a lista contra a língua, e o `CLAUDE.md` já nomeia o desfecho —
// "não se fecha porta a porta, fecha-se a parede".
//
// A parede aqui é um FATO do servidor: `nameCardExibido`, marcado em
// `emit-card.ts` no turno em que o card do nome realmente sai. Sem ele, o
// servidor não interpreta nada como nome — não importa quão curta seja a
// resposta.
//
// Skip se DATABASE_URL ausente.

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb("o nome do cliente não é a resposta que ele deu ao modelo", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	beforeEach(() => {
		process.env.VITRINE_CPF = "";
		process.env.VITRINE_CELULAR = "";
	});

	async function nomeGravado(conversationId: string): Promise<string | null> {
		const { db } = await import("@/db");
		const { conversations } = await import("@/db/schema");
		const c = await db.query.conversations.findFirst({
			where: eq(conversations.id, conversationId),
		});
		return c?.contactName ?? null;
	}

	it('"SUV" respondido ao modelo NÃO vira o nome do cliente', async () => {
		const r = await runScenario({
			contactName: null,
			metaInicial: { currentCategory: "auto", qualifyAnswers: { creditMax: 90_000 } },
			turns: [
				// O gate é `name`, mas quem perguntou foi o modelo — e sobre outra
				// coisa. O card cede a vez (FIX-379).
				{ user: "Novo", beats: [{ text: "Boa escolha. Prefere sedã ou SUV?" }] },
				{ user: "SUV", beats: [{ text: "Show. Alguma marca preferida?" }] },
			],
		});
		criadas.push(r.conversationId);

		expect(await nomeGravado(r.conversationId)).not.toBe("Suv");
		expect(await nomeGravado(r.conversationId)).toBeNull();
	});

	it("nenhuma resposta de produto vira nome enquanto o card não aparece", async () => {
		const r = await runScenario({
			contactName: null,
			metaInicial: { currentCategory: "imovel", qualifyAnswers: { creditMax: 400_000 } },
			turns: [{ user: "Apartamento", beats: [{ text: "Legal! Em qual região você procura?" }] }],
		});
		criadas.push(r.conversationId);

		expect(await nomeGravado(r.conversationId)).toBeNull();
	});

	it("mas quando o CARD aparece, a resposta seguinte é o nome — o funil não perde a captura", async () => {
		const r = await runScenario({
			contactName: null,
			metaInicial: { currentCategory: "auto", qualifyAnswers: { creditMax: 90_000 } },
			turns: [
				// Turno 1: o modelo pergunta outra coisa → o card cede a vez.
				{ user: "Novo", beats: [{ text: "Boa escolha. Prefere sedã ou SUV?" }] },
				// Turno 2: o card sai (o adiamento já foi gasto).
				{ user: "SUV", beats: [{ text: "Show." }] },
				// Turno 3: agora sim — a pergunta foi feita pelo servidor.
				{ user: "Marina", beats: [{ text: "Prazer, Marina!" }] },
			],
		});
		criadas.push(r.conversationId);

		expect(await nomeGravado(r.conversationId)).toBe("Marina");
	});

	it("no primeiro contato nada muda — o card sai e o nome é capturado", async () => {
		// O caminho que sempre funcionou continua igual: quem chega sem dizer o
		// que quer é recebido pelo nome, e a resposta é o nome.
		const r = await runScenario({
			contactName: null,
			metaInicial: {},
			turns: [
				{ user: "Oi", beats: [{ text: "Oi! Como posso te chamar?" }] },
				{ user: "Beatriz", beats: [{ text: "Prazer, Beatriz!" }] },
			],
		});
		criadas.push(r.conversationId);

		expect(await nomeGravado(r.conversationId)).toBe("Beatriz");
	});
});
