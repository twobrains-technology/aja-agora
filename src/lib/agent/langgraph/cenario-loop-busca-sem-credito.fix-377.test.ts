// FIX-377 — o loop de "vou pesquisar agora" que nunca pesquisa.
//
// Visto ao vivo (Kairo, 2026-07-26): o cliente disse que podia pagar "100 reais
// por mês". O agente respondeu, turno após turno, "preciso primeiro pesquisar os
// grupos disponíveis, vou fazer essa busca agora mesmo!" — e nunca buscou. A
// conversa morreu ali, repetindo a mesma frase.
//
// A CAUSA (confirmada no código, e não a que se supõe de cara):
//
//  1. O modelo corrompeu "100 reais/mês" em `creditMax = 1.000` — o gatilho.
//  2. Com `creditMax` preenchido, `readyForDiscovery` (route.ts:13) passa a ser
//     TRUE e a busca REALMENTE roda.
//  3. Mas o piso de crédito da Bevi é R$ 15.000 (`DEFAULT_CREDIT_FLOOR`,
//     bevi-self-contract-adapter.ts:64) — R$ 1.000 volta sempre VAZIO.
//  4. `discovery.ts:128` trata resultado vazio devolvendo `{ events: [] }` em
//     SILÊNCIO e, de propósito, sem marcar `searchDispatched` ("retry liberado
//     num turno seguinte"). Sem limite e sem sinal, o retry virou loop perpétuo:
//     o modelo nunca recebe resultado nem aviso de falha, então promete de novo.
//
// Note que o guard de turno vazio (`empty-turn-guard.ts`) não cobre isto: ele
// exige `textChars === 0`, e aqui o modelo FALA. Turno falado, porém estéril.
//
// Decisão de produto (Kairo, 2026-07-26): faixa abaixo do piso é barrada ANTES
// de virar chamada à Bevi, e o cliente ouve o mínimo real com um pedido de
// ajuste — nunca mais uma promessa de busca.
import { afterAll, describe, expect, it } from "vitest";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** O estado exato da conversa real: categoria e identidade resolvidas e um
 * `creditMax` ABAIXO DO PISO da Bevi (R$ 15 mil) — o valor que o modelo
 * fabricou a partir de "100 reais". É o suficiente pra busca rodar e voltar
 * vazia toda vez. */
const CREDITO_ABAIXO_DO_PISO = {
	desireAsked: true,
	identityCollected: true,
	currentCategory: "auto" as const,
	qualifyAnswers: { creditMax: 1_000 },
};

/** O que o modelo fez ao vivo: prometeu a busca, sem chamar tool nenhuma. */
const PROMETE_E_NAO_BUSCA = [
	{
		text: "Kairo, percebi que preciso primeiro pesquisar os grupos de consórcio disponíveis no mercado para carros. Vou fazer essa busca agora mesmo!",
	},
];

describeIfDb("FIX-377 — turno falado mas estéril não pode virar loop", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it("faixa abaixo do piso não vira chamada à Bevi nem promessa repetida", async () => {
		const r = await runScenario({
			metaInicial: CREDITO_ABAIXO_DO_PISO,
			turns: [
				{ user: "só posso pagar 100 reais por mês", beats: PROMETE_E_NAO_BUSCA },
				// O cliente insiste — e é aqui que o loop se revelava: o agente
				// repetia a MESMA promessa, turno após turno.
				{ user: "uai, falei que só podia pagar 100 reais por mês", beats: PROMETE_E_NAO_BUSCA },
			],
		});
		criadas.push(r.conversationId);

		// 1) A busca NÃO pode nem sair: R$ 1.000 está abaixo do piso conhecido
		// (R$ 15 mil). Gastar chamada na Bevi pra receber vazio é o que alimenta
		// o retry infinito.
		const buscou = r.turns.some((t) =>
			t.events.some(
				(e) => e.type === "tool-call" && /search_groups|recommend_groups/.test(e.toolName),
			),
		);
		expect(buscou).toBe(false);

		// 2) E o cliente precisa receber a saída: o card que coleta um valor
		// novo. Sem isso ele só ouve "vou pesquisar agora" pra sempre.
		const segundo = r.turns[1];
		const ofereceSaida = segundo.trilha.some(
			(t) => t === "gate:credit" || t === "artifact:value_picker",
		);
		expect(ofereceSaida).toBe(true);
	});
});
