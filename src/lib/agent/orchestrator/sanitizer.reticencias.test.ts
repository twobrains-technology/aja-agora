// Produção, 2026-08 (conv do Romulo) — o cliente recebeu uma bolha de chat
// contendo UM caractere: ")".
//
// A fala original era:
//   "Qual é o modelo de carro que você tem em mente? (Corolla, Onix, HB20, Gol...)"
//
// O split por frase trata "." como fronteira, e a guarda que existia só protegia
// o ponto de MILHAR (o caractere anterior ser dígito, pra "R$ 4.000" não
// quebrar). Numa reticência o ponto vem depois de LETRA — então "Gol..." virou
// fronteira, o fecha-parêntese ficou órfão do outro lado e virou bolha própria.
//
// Duas correções, ambas determinísticas:
//   1. reticência é UM delimitador, não três fronteiras;
//   2. segmento sem nenhuma letra ou dígito nunca vira bolha — rede de
//      segurança pra qualquer resíduo de pontuação que escape do split.

import { describe, expect, it } from "vitest";
import { splitSegments, stripProcessPreamble } from "@/lib/agent/orchestrator/sanitizer";

describe("reticências não quebram a frase", () => {
	it("a fala literal do Romulo não produz o segmento ')'", () => {
		const fala = "Qual é o modelo de carro que você tem em mente? (Corolla, Onix, HB20, Gol...)";
		const segmentos = splitSegments(fala).map((s) => s.trim());
		expect(segmentos).not.toContain(")");
		expect(segmentos.some((s) => s.includes("Corolla") && s.includes("Gol"))).toBe(true);
	});

	it("reticência no fim de frase segue sendo uma fronteira só", () => {
		const segmentos = splitSegments("Deixa eu ver... Achei três opções.").map((s) => s.trim());
		expect(segmentos.filter((s) => s.length > 0)).toHaveLength(2);
	});

	it("ponto de milhar continua protegido (não regride o FIX-248)", () => {
		const segmentos = splitSegments("A parcela fica em R$ 4.000,00 por mês.");
		expect(segmentos.filter((s) => s.trim())).toHaveLength(1);
	});

	it("bolha só de pontuação nunca chega ao cliente", () => {
		expect(stripProcessPreamble(") ").trim()).toBe("");
		expect(stripProcessPreamble("...").trim()).toBe("");
		expect(stripProcessPreamble(" -- ").trim()).toBe("");
	});

	it("o turno inteiro do Romulo sai como uma fala só, com a lista intacta", () => {
		const limpo = stripProcessPreamble(
			"Qual é o modelo de carro que você tem em mente? (Corolla, Onix, HB20, Gol...)",
		);
		expect(limpo).toContain("Corolla");
		expect(limpo.trim().endsWith(")")).toBe(true);
	});
});
