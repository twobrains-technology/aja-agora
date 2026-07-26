// FIX-378 (integração) — o valor inflado não pode entrar no funil.
//
// A função pura (`valor-declarado.test.ts`) prova a ancoragem isolada. Aqui se
// prova o que importa pro produto: um valor que o cliente NÃO disse não vira
// `creditMax` no estado persistido, mesmo que o extrator insista.
//
// Por que isso vale um cenário e não só o unit: era exatamente esse valor
// fabricado (R$ 1.000 a partir de "100 reais") que ligava `readyForDiscovery`,
// disparava a busca abaixo do piso e produzia o loop do FIX-377. O guard tem
// que cortar ANTES de chegar lá.
import { afterAll, describe, expect, it } from "vitest";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb("FIX-378 — valor que o cliente não disse não entra no funil", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it("recusa o creditMax inflado e mantém o funil pedindo o valor", async () => {
		const r = await runScenario({
			metaInicial: {
				desireAsked: true,
				identityCollected: true,
				currentCategory: "auto" as const,
				qualifyAnswers: {},
			},
			turns: [
				{
					user: "só posso pagar 100 reais por mês",
					// O extrator faz o que fez ao vivo: grava DEZ VEZES o que foi dito.
					extrai: (meta) => {
						meta.qualifyAnswers = { ...meta.qualifyAnswers, creditMax: 1_000 };
					},
					beats: [{ text: "Entendi, Kairo!" }],
				},
			],
		});
		criadas.push(r.conversationId);

		// O número fabricado não pode sobreviver no estado.
		expect(r.meta.qualifyAnswers?.creditMax).not.toBe(1_000);

		// E o funil segue pedindo o valor — que é o comportamento honesto quando
		// o dado não foi realmente coletado.
		expect(r.turns[0].trilha).toContain("gate:credit");
	});

	it("deixa passar o valor que o cliente realmente disse", async () => {
		const r = await runScenario({
			metaInicial: {
				desireAsked: true,
				identityCollected: true,
				currentCategory: "auto" as const,
				qualifyAnswers: {},
			},
			turns: [
				{
					user: "quero um carro de uns 180 mil",
					extrai: (meta) => {
						meta.qualifyAnswers = { ...meta.qualifyAnswers, creditMax: 180_000 };
					},
					beats: [{ text: "Show, vamos ver as opções." }],
				},
			],
		});
		criadas.push(r.conversationId);

		// Sem esta metade o fix viraria "nunca aceite valor nenhum".
		expect(r.meta.qualifyAnswers?.creditMax).toBe(180_000);
	});
});
