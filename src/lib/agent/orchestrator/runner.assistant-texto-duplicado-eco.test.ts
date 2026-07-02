/**
 * FIX-102 (Camada 1 estrutural) — eco/duplicação de texto do assistant.
 *
 * Achado na validação E2E da jornada web (2026-06-28, persona Helena): a bolha
 * do assistant repetiu a mesma frase 2x coladas, sem separador —
 * `"Boa, então a gente vai direto ao ponto.Boa, então a gente vai direto ao
 * ponto."`. Causa investigada e CRAVADA (não é bug de append/dedup no código):
 * degeneração NÃO-determinística da LLM — `runner.ts` só concatena os deltas
 * do `fullStream` fielmente (sem retry/loop duplo), o client é 100% fiel aos
 * `message.parts`, e a varredura `^(.{15,60}[.!?])\1` no DB inteiro de
 * homologação achou 1 SÓ ocorrência (bug sistemático seria em toda conversa).
 *
 * Mitigação decidida (não a causa, o sintoma — decisão de produto, ver card):
 * guarda defensiva DETERMINÍSTICA que colapsa segmentos/parágrafos 100%
 * idênticos consecutivos antes de persistir/renderizar. Pega o
 * "Boa...Boa..."; NÃO pega o "Bora!Beleza" (eco do label do quick-reply, texto
 * DIFERENTE — fora do escopo desta guarda, ver card).
 *
 * Card: docs/correcoes/todo/bloco-h-chat-render/fix-102-assistant-texto-duplicado-eco.md
 */
import { describe, expect, it } from "vitest";
import { collapseEchoedSegments } from "./runner";

describe("FIX-102 — collapseEchoedSegments", () => {
	it("colapsa frase idêntica repetida colada sem separador (caso real do bug)", () => {
		const input =
			"Boa, então a gente vai direto ao ponto.Boa, então a gente vai direto ao ponto.";
		expect(collapseEchoedSegments(input)).toBe("Boa, então a gente vai direto ao ponto.");
	});

	it("colapsa parágrafo idêntico repetido com quebra de linha entre as cópias", () => {
		const input = "Encontrei um grupo que combina com você.\n\nEncontrei um grupo que combina com você.";
		expect(collapseEchoedSegments(input)).toBe("Encontrei um grupo que combina com você.");
	});

	it("colapsa repetição tripla pra uma única ocorrência", () => {
		expect(collapseEchoedSegments("Show. Show. Show.")).toBe("Show.");
	});

	it("NÃO mexe em frases consecutivas diferentes (texto normal)", () => {
		const input = "Boa, então a gente vai direto ao ponto. Me conta o que você procura.";
		expect(collapseEchoedSegments(input)).toBe(input);
	});

	it("NÃO pega o eco do label do quick-reply (texto DIFERENTE, fora do escopo desta guarda)", () => {
		const input = "Bora!Beleza, Kairo.";
		expect(collapseEchoedSegments(input)).toBe(input);
	});

	it("string vazia não quebra e retorna como está", () => {
		expect(collapseEchoedSegments("")).toBe("");
	});
});
