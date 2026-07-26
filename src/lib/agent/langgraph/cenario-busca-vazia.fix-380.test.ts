// FIX-380 — busca vazia não pode ser silêncio.
//
// O FIX-377 cobriu UM motivo de resultado vazio: faixa abaixo do piso conhecido,
// barrada antes de virar chamada. Sobram os outros — Bevi fora do ar, faixa que
// simplesmente não tem grupo real, piso maior que o default nesse segmento. Em
// todos eles `discovery.ts` fazia `return { events: [] }`: sem card, sem aviso,
// sem sinal pro modelo. E de propósito NÃO marcava `searchDispatched`, pra
// liberar retry.
//
// A intenção era boa (a Bevi cai de verdade; travar em "já buscado" sobre um
// vazio seria pior). O efeito, sem limite nem registro, era o loop: o modelo
// promete "vou pesquisar agora", o turno seguinte tenta, volta vazio, promete de
// novo — e a venda morre em silêncio.
//
// Aqui a tentativa fica REGISTRADA (`discoveryEmptyStreak`). Um vazio é
// acidente e o retry continua; dois é a faixa, e o funil volta a pedir o valor
// em vez de prometer. O código não fabrica número nenhum — só para de esconder
// a falha.
import { afterAll, describe, expect, it } from "vitest";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** Faixa PERFEITAMENTE válida (acima do piso) — o vazio aqui vem da Bevi, não
 * do valor. É o que distingue este cenário do FIX-377. */
const PRONTO_PRA_BUSCAR = {
	desireAsked: true,
	identityCollected: true,
	currentCategory: "auto" as const,
	qualifyAnswers: { creditMax: 180_000 },
};

/** A Bevi respondeu, mas sem nenhuma oferta utilizável. */
const BEVI_SEM_OFERTA = async () => ({ groups: [] });

describeIfDb("FIX-380 — busca sem resultado registra a tentativa e para de prometer", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it("registra o vazio no estado em vez de sumir em silêncio", async () => {
		const r = await runScenario({
			metaInicial: PRONTO_PRA_BUSCAR,
			busca: BEVI_SEM_OFERTA,
			turns: [{ user: "manda as opções", beats: [{ text: "Vou buscar agora!" }] }],
		});
		criadas.push(r.conversationId);

		// O sintoma antigo era justamente NÃO haver rastro nenhum do fracasso.
		expect(r.meta.discoveryEmptyStreak).toBe(1);
		// E o reveal não pode ser dado como concluído sobre um resultado vazio.
		expect(r.meta.revealCompleted).not.toBe(true);
	});

	it("na segunda tentativa vazia, volta a pedir o valor", async () => {
		const r = await runScenario({
			metaInicial: PRONTO_PRA_BUSCAR,
			busca: BEVI_SEM_OFERTA,
			turns: [
				{ user: "manda as opções", beats: [{ text: "Vou buscar agora!" }] },
				{ user: "e aí, achou?", beats: [{ text: "Vou buscar agora!" }] },
			],
		});
		criadas.push(r.conversationId);

		expect(r.meta.discoveryEmptyStreak).toBeGreaterThanOrEqual(2);
		// Em vez de prometer pela terceira vez, o funil oferece a saída: outro
		// valor. Quem explica o motivo é o modelo, em português — o código só
		// garante que a pergunta apareça.
		expect(r.turns[1].trilha).toContain("gate:credit");
	});
});
