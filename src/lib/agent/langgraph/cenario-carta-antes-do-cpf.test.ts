/**
 * A PROVA: a carta aparece sem o cliente entregar o CPF.
 *
 * Este é o cenário exato da conv 70a80fca de produção (10-26/08/2026), que
 * morreu no primeiro turno:
 *
 *   👤 Quero um carro ate R$ 80 mil
 *   🤖 Que legal! Carro novo muda tudo mesmo. Antes de buscar as melhores
 *      opções pra você, preciso de uns detalhes. Já tem um modelo em mente?
 *   (fim — a pessoa nunca mais voltou)
 *
 * O cliente disse o bem e o valor. Tinha tudo que a Bevi precisa para simular.
 * E recebeu uma pergunta, porque o funil exigia CPF antes da busca.
 *
 * Aqui o mesmo turno tem que produzir uma BUSCA REAL. O que o teste espia é o
 * argumento que chega à administradora — é isso que prova qual pergunta foi
 * feita, e não a fala do agente (que é do modelo, e portanto não se testa).
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** Espiona o que foi perguntado à administradora e sob qual identidade. */
function buscaEspia() {
	const chamadas: Array<Record<string, unknown>> = [];
	const busca = async (args: Record<string, unknown>) => {
		chamadas.push(args);
		return {
			groups: [
				{
					groupId: "g-itau-1",
					administradora: "ITAÚ",
					creditValue: 81_973,
					termMonths: 60,
					monthlyPayment: 1_600,
					category: "auto",
				},
			],
		};
	};
	return { busca, chamadas };
}

const ENV_ORIGINAL = { ...process.env };

beforeEach(() => {
	process.env.VITRINE_CPF = "11144477735";
	process.env.VITRINE_CELULAR = "62992496793";
});

// O env é global do worker: sem restaurar, `VITRINE_*` vaza para todos os
// arquivos seguintes e vira explicação silenciosa para falha alheia.
afterEach(() => {
	process.env = { ...ENV_ORIGINAL };
});

describeIfDb("o cliente vê a carta antes de entregar o CPF", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it("BUSCA no turno em que o cliente diz o bem e o valor, sem identidade coletada", async () => {
		const { busca, chamadas } = buscaEspia();
		const r = await runScenario({
			busca: busca as never,
			metaInicial: {
				desireAsked: true,
				currentCategory: "auto" as const,
				// O ponto do teste: NADA de identidade. Antes desta mudança, o
				// funil devolveria o gate `identify` e nenhuma busca sairia.
				identityCollected: false,
				qualifyAnswers: { creditMax: 80_000 },
			},
			turns: [
				{
					user: "Quero um carro ate R$ 80 mil",
					beats: [{ text: "Boa! Deixa eu ver o que tem pra esse valor." }],
				},
			],
		});
		criadas.push(r.conversationId);

		expect(chamadas.length).toBeGreaterThan(0);
	});

	it("busca na FAIXA que o cliente pediu — a vitrine não distorce a pergunta", async () => {
		// A identidade emprestada serve para abrir a proposta na administradora;
		// ela não pode mudar O QUE se pergunta. O valor buscado é o do cliente.
		const { busca, chamadas } = buscaEspia();
		const r = await runScenario({
			busca: busca as never,
			metaInicial: {
				desireAsked: true,
				currentCategory: "auto" as const,
				identityCollected: false,
				qualifyAnswers: { creditMax: 80_000 },
			},
			turns: [{ user: "Quero um carro ate R$ 80 mil", beats: [{ text: "Vou buscar." }] }],
		});
		criadas.push(r.conversationId);

		const args = JSON.stringify(chamadas[0] ?? {});
		expect(args).toContain("80000");
	});

	it("NÃO busca quando a vitrine está desligada — o funil antigo volta inteiro", async () => {
		process.env.VITRINE_CPF = "";
		process.env.VITRINE_CELULAR = "";
		const { busca, chamadas } = buscaEspia();
		const r = await runScenario({
			busca: busca as never,
			metaInicial: {
				desireAsked: true,
				currentCategory: "auto" as const,
				identityCollected: false,
				qualifyAnswers: { creditMax: 80_000 },
			},
			turns: [{ user: "Quero um carro ate R$ 80 mil", beats: [{ text: "Deixa comigo." }] }],
		});
		criadas.push(r.conversationId);

		expect(chamadas.length).toBe(0);
	});
});
