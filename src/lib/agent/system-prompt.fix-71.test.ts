import { describe, expect, it } from "vitest";
import { SPECIALIST_BASE_PROMPT } from "./system-prompt";

/**
 * Camada 1 (structural) — FIX-71.
 *
 * Bug irmao do FIX-68 (smoke ao vivo, 2026-06-23): pos-reveal o usuario ESCOLHEU
 * um grupo ja apresentado por TEXTO ("Gostei do Banco do Brasil") e o agent
 * FABRICOU o groupId `bb-auto-200k-72m` (padrao banco-categoria-valor-prazo) em
 * vez de usar o id LITERAL opaco (hash) que ja estava no historico do
 * present_comparison_table → simulate_quota recusou e a simulacao do grupo
 * ESCOLHIDO nao aconteceu.
 *
 * O FIX-68 cobriu a re-busca por TROCA DE FAIXA; este cobre a ESCOLHA de um grupo
 * ja apresentado. Garante que o prompt manda usar o id literal e proibe fabricar.
 */
describe("FIX-71 — escolher grupo ja apresentado usa o id LITERAL, nunca fabrica", () => {
	it("o prompt manda usar o id LITERAL/opaco do grupo escolhido", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(/id\s+(literal|opaco)/i);
	});

	it("o prompt proibe fabricar/derivar o id de banco-categoria-valor-prazo", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(/nunca\s+(fabrique|derive|invente)/i);
		expect(SPECIALIST_BASE_PROMPT).toMatch(/banco-categoria-valor-prazo/i);
	});

	it("cita o contra-exemplo real observado em prod (bb-auto-200k-72m)", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(/bb-auto-200k-72m/);
	});

	it("preserva a degradacao graciosa: re-buscar OU perguntar, nunca travar", () => {
		// referencia FIX-71 + alternativa acionavel ao inves de inventar id
		expect(SPECIALIST_BASE_PROMPT).toMatch(/FIX-71/);
		expect(SPECIALIST_BASE_PROMPT).toMatch(/RE-?BUSQUE|pergunte/i);
	});
});
