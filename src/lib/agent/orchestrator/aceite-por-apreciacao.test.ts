/**
 * "gostei dessa do bb" — o aceite que o funil não reconhecia.
 *
 * Produção (`fd76e393`, 16/08/2026 19:21:30): o cliente escolheu com essas
 * palavras. O analyzer entendeu certo — `intent=ready_to_proceed`, com a
 * justificativa "Intent é aceitação da proposta apresentada" — mas
 * `detectYesNoText` devolveu `null`, porque o léxico de SIM não tinha nenhuma
 * forma de apreciação. Sem o sinal positivo, a ancoragem não acontece
 * (allowlist do FIX-416) e a cota escolhida nunca entra no estado.
 *
 * ## Por que a entrada no léxico, e não a regra em bloco
 *
 * O caminho tentador seria "intent === ready_to_proceed é SIM". Isso JÁ foi
 * tentado (FIX-387) e revertido (FIX-395b) porque, medido com o analyzer real,
 * "de jeito nenhum", "prefiro usar só o meu dinheiro" e "achei caro" também
 * voltam como `ready_to_proceed` — e todos viravam aceite. O cabeçalho de
 * `yes-no.ts` argumenta a assimetria e conclui que ampliar a lista é o trabalho
 * certo, porque cada entrada é uma afirmação inequívoca, enquanto a regra em
 * bloco aposta no infinito.
 *
 * ## E por que isto NÃO é o anti-padrão de regex
 *
 * O anti-padrão revertido em `649320dc` é sobre calar a fala do AGENTE. Aqui o
 * alvo é a fala do CLIENTE, e o resultado é um dado que vai para o banco e para
 * a administradora (a cota do contrato) — o segundo teste de decisão do
 * CLAUDE.md manda que isso seja código, com teste de verdade.
 *
 * As contraprovas abaixo são a parte que importa: apreciação seguida de ressalva
 * NÃO é aceite, e apreciação negada é recusa.
 */

import { describe, expect, it } from "vitest";
import { detectYesNoText } from "./yes-no";

describe("aceite por apreciação — o cliente elogia a cota e isso é um sim", () => {
	it.each([
		"gostei dessa do bb",
		"gostei",
		"gostei dessa",
		"curti essa",
		"adorei essa",
		"fico com essa",
		"prefiro essa",
		"essa mesma",
	])("%j é aceite", (fala) => {
		expect(detectYesNoText(fala, "ready_to_proceed")).toBe(true);
	});

	// CONTRAPROVAS — é aqui que a entrada no léxico se justifica ou cai.
	it("apreciação NEGADA é recusa", () => {
		expect(detectYesNoText("não gostei dessa", "ready_to_proceed")).toBe(false);
		expect(detectYesNoText("não curti", "ready_to_proceed")).toBe(false);
	});

	it("apreciação com RESSALVA não vira aceite — fica indefinido e o funil pergunta", () => {
		for (const fala of [
			"gostei, mas achei caro",
			"gostei, mas queria uma parcela menor",
			"curti, só que o prazo é longo demais",
		]) {
			expect(detectYesNoText(fala, "ready_to_proceed")).not.toBe(true);
		}
	});

	it("apreciação no CONDICIONAL não é aceite", () => {
		expect(detectYesNoText("gostaria de ver outras", "ready_to_proceed")).not.toBe(true);
		expect(
			detectYesNoText("gostei, se a parcela fosse menor eu fechava", "ready_to_proceed"),
		).not.toBe(true);
	});

	it("pergunta continua sendo pergunta, mesmo elogiando", () => {
		expect(detectYesNoText("gostei dessa, quanto fica a parcela?", "asking_question")).toBeNull();
	});

	// A regra em bloco que este teste existe para NÃO reintroduzir: as três falas
	// abaixo voltam do analyzer real como `ready_to_proceed` e são recusas.
	it("recusa rotulada como ready_to_proceed continua não sendo aceite", () => {
		for (const fala of ["de jeito nenhum", "prefiro usar só o meu dinheiro", "achei caro"]) {
			expect(detectYesNoText(fala, "ready_to_proceed")).not.toBe(true);
		}
	});
});
