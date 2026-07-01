/**
 * FIX-182 (Mirella, 2026-07-01) — narrações de passos internos se colam numa
 * mensagem só sem separador em turnos multi-tool (irmão do FIX-102).
 *
 * Mensagem exata persistida no banco (conv 69a38af1, msg b408ddf4), um único
 * registro, zero separador entre 4 frases de "transição pré-tool":
 *   "Bora ver o que a gente consegue na sua faixa:Deixa eu buscar as opções reais
 *    na sua faixa:Preciso buscar os grupos disponíveis pra você. Um segundo:
 *    Mirella, tive um problema aqui ao carregar as opções..."
 *
 * Causa: no loop do fullStream, `fullResponse += part.text` concatena os textos
 * de STEPS DIFERENTES do turno multi-tool-call sem inserir quebra. Cada delta do
 * MESMO bloco (mesmo id) precisa ficar colado (streaming); entre BLOCOS
 * diferentes (ids diferentes — texto interleavado com tool-calls entre steps)
 * entra `\n\n`. `textBlockSeparator` decide isso deterministicamente, sem
 * heurística de conteúdo (zero falso-positivo em texto legítimo).
 */
import { describe, expect, it } from "vitest";
import { textBlockSeparator } from "./runner";

describe("FIX-182 — textBlockSeparator (separador entre blocos de texto de steps diferentes)", () => {
	it("NÃO separa deltas do MESMO bloco (mesmo id) — streaming fica intacto", () => {
		expect(textBlockSeparator("t1", "t1", "Bora ver")).toBe("");
	});

	it("insere \\n\\n entre BLOCOS diferentes quando já há texto acumulado sem espaço no fim", () => {
		expect(textBlockSeparator("t1", "t2", "Bora ver o que a gente consegue na sua faixa:")).toBe("\n\n");
	});

	it("NÃO separa no PRIMEIRO bloco do turno (não há bloco anterior)", () => {
		expect(textBlockSeparator(undefined, "t1", "")).toBe("");
	});

	it("NÃO duplica separador quando o acumulado já termina em espaço/quebra", () => {
		expect(textBlockSeparator("t1", "t2", "Beleza.\n\n")).toBe("");
		expect(textBlockSeparator("t1", "t2", "Beleza. ")).toBe("");
	});

	it("NÃO separa se o acumulado está vazio (bloco novo mas nada foi dito ainda)", () => {
		expect(textBlockSeparator("t1", "t2", "")).toBe("");
	});

	it("reconstrução do bug real: 4 narrações de steps diferentes NÃO colam mais numa sopa", () => {
		// Simula o loop do runner: cada bloco (step) tem id próprio; deltas do mesmo
		// bloco colam, blocos diferentes ganham \n\n.
		const blocks: Array<{ id: string; text: string }> = [
			{ id: "b1", text: "Bora ver o que a gente consegue na sua faixa:" },
			{ id: "b2", text: "Deixa eu buscar as opções reais na sua faixa:" },
			{ id: "b3", text: "Preciso buscar os grupos disponíveis pra você. Um segundo:" },
			{ id: "b4", text: "Mirella, tive um problema aqui ao carregar as opções." },
		];
		let full = "";
		let lastId: string | undefined;
		for (const b of blocks) {
			full += textBlockSeparator(lastId, b.id, full);
			full += b.text;
			lastId = b.id;
		}

		// A sopa do bug (frases coladas sem separador) NÃO acontece mais.
		expect(full).not.toContain("faixa:Deixa");
		expect(full).not.toContain("faixa:Preciso");
		expect(full).not.toContain("segundo:Mirella");
		// Cada narração fica em seu próprio parágrafo.
		expect(full.split("\n\n")).toHaveLength(4);
	});

	it("turno normal de bloco único (mesmo id em todos os deltas) não ganha separador nenhum", () => {
		const deltas = ["Oi", ", ", "Mirella", "!"];
		let full = "";
		let lastId: string | undefined;
		for (const d of deltas) {
			full += textBlockSeparator(lastId, "one", full);
			full += d;
			lastId = "one";
		}
		expect(full).toBe("Oi, Mirella!");
	});
});

describe("FIX-182 — Camada 1 structural: runner separa blocos de texto no fullStream", () => {
	it("runner.ts usa textBlockSeparator no case text-delta e rastreia o id do bloco", async () => {
		const { readFileSync } = await import("node:fs");
		const { resolve } = await import("node:path");
		const src = readFileSync(resolve(process.cwd(), "src/lib/agent/orchestrator/runner.ts"), "utf-8");
		expect(src, "runner precisa usar textBlockSeparator entre blocos de texto").toMatch(/textBlockSeparator/);
		// rastreia o id do bloco corrente pra distinguir deltas do mesmo bloco de blocos novos.
		expect(src).toMatch(/lastTextBlockId|lastBlockId/);
	});
});
