/**
 * O índice do turno do cliente, contado de um jeito que não erra.
 *
 * ── O defeito, medido ao vivo ───────────────────────────────────────────────
 *
 * A primeira versão contava `state.messages.filter(human).length - 1`. Parecia
 * óbvio e estava errado: numa conversa real de três falas do cliente, o smoke
 * de 30/08/2026 registrou `turnoDoCliente` **0 → 1 → 3**. O 2 não existiu.
 *
 * A causa é que `state.messages` é montado por dois caminhos diferentes em
 * `run-turn.ts`: no primeiro turno da conversa vem do banco
 * (`loadConversationHistory`), nos seguintes vem do checkpointer acrescido do
 * `resume`. Quando a fala corrente entra na lista muda entre eles, e o `-1`
 * compensa um caso e desloca o outro.
 *
 * ── Por que isso não é um detalhe de telemetria ─────────────────────────────
 *
 * `turnoDoCliente` é publicado no `TurnTrace` e o score
 * `primeira_resposta_com_numero` depende dele. O invariante de que o score
 * precisa — "zero acontece uma vez, na primeira fala" — o jeito antigo até
 * cumpria. Mas o campo tem nome de contagem e vai para o painel: o primeiro que
 * ler "turno 3" em cima de uma conversa de 3 falas vai depurar a conversa em
 * vez do contador. É a mesma família de defeito que esta branch vem
 * perseguindo — o número que o servidor publica tem de ser verdade.
 *
 * ── A contagem certa ────────────────────────────────────────────────────────
 *
 * `funnel.turnosDoCliente`, incrementado uma vez por turno de CLIENTE e
 * persistido no metadata (o mesmo caminho de `nameCardExibido`). Não depende de
 * como `state.messages` foi montado, nem de quando a fala entra na lista, e
 * atravessa os dois canais porque vive no nó que os dois atravessam.
 *
 * Turno de SERVIDOR não conta: directive e retomada não são fala do cliente, e
 * contá-las faria o "primeiro turno" do score ser consumido por uma mensagem
 * que a pessoa nunca escreveu.
 *
 * Skip se DATABASE_URL ausente.
 */

import { afterAll, describe, expect, it } from "vitest";
import type { TurnEvent } from "../orchestrator/types";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** Os índices que o turno anunciou — normalmente um só. */
const indices = (events: TurnEvent[]): number[] =>
	events
		.filter(
			(e): e is Extract<TurnEvent, { type: "turno-do-cliente" }> => e.type === "turno-do-cliente",
		)
		.map((e) => e.indice);

describeIfDb("o índice do turno do cliente", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it("conta 0, 1, 2 — sem buraco e sem repetição", async () => {
		const r = await runScenario({
			contactName: "Cliente Cenário",
			metaInicial: { identityCollected: true, currentCategory: "auto" },
			turns: [
				{ user: "Quero comprar um carro.", beats: [{ text: "Ótimo! Qual valor?" }] },
				{ user: "Uns 90 mil", beats: [{ text: "Anotado." }] },
				{ user: "Pode seguir", beats: [{ text: "Seguindo." }] },
			],
		});
		criadas.push(r.conversationId);

		expect(r.turns.map((t) => indices(t.events))).toEqual([[0], [1], [2]]);
	});

	it("o turno de SERVIDOR não gasta um índice", async () => {
		// Directive e retomada entram por `isUserTurn: false`. Se contassem, o
		// índice 0 — que é o que o score `primeira_resposta_com_numero` observa —
		// seria consumido por uma fala que o cliente nunca escreveu.
		const r = await runScenario({
			contactName: "Cliente Cenário",
			metaInicial: { identityCollected: true, currentCategory: "auto" },
			turns: [
				{ user: "[retomada]", isUserTurn: false, beats: [{ text: "Oi! Voltamos?" }] },
				{ user: "Quero comprar um carro.", beats: [{ text: "Ótimo!" }] },
			],
		});
		criadas.push(r.conversationId);

		expect(indices(r.turns[0].events)).toEqual([]);
		expect(indices(r.turns[1].events)).toEqual([0]);
	});

	it("o contador sobrevive ao turno — é estado do funil, não da requisição", async () => {
		const r = await runScenario({
			contactName: "Cliente Cenário",
			metaInicial: { identityCollected: true, currentCategory: "auto" },
			turns: [
				{ user: "Oi", beats: [{ text: "Olá!" }] },
				{ user: "Quero um carro", beats: [{ text: "Certo." }] },
			],
		});
		criadas.push(r.conversationId);

		// Duas falas do cliente → o metadata persistido tem que dizer 2.
		expect(r.meta.turnosDoCliente).toBe(2);
	});
});
