/**
 * FIX-398 — `viu oferta` tem UMA verdade.
 *
 * Palavras da Bruna (call de 29/09/2026, 12:19, lendo o funil dela):
 * *"viram oferta, 9 → 18... e a proposta criada: zero"*. Ela está medindo
 * exatamente este degrau — e é o degrau que o teste de quinta vai mover.
 *
 * O defeito medido no código em 29/09/2026: o painel contava "viu oferta" por
 * `["real_offer","simulation_result"]`, mas os escritores gravam OUTROS tipos
 * também — `comparison_table` (`src/app/api/chat/route.ts`),
 * `recommendation_card` (`converse.ts`), `real_offer`
 * (`closing-presentation.ts`). Quem viu a comparação no chat web NÃO era
 * contado. Duas listas para a mesma pergunta.
 *
 * Este teste AMARRA as duas pontas: lê os tipos de artifact declarados em
 * `src/lib/chat/types.ts` e exige que CADA UM esteja classificado no painel —
 * se um tipo novo nascer sem classificação, ele aponta (em vez de o funil
 * subcontar em silêncio).
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	ARTIFACTS_DE_OFERTA,
	CLASSIFICACAO_DOS_ARTIFACTS,
	PADRAO_SQL_DE_OFERTA,
} from "./sinais-do-funil";

const AQUI = dirname(fileURLToPath(import.meta.url));
const TIPOS_TS = resolve(AQUI, "../chat/types.ts");

/** Extrai os tipos de artifact declarados na union `ArtifactByType` do código. */
function tiposDeArtifactDoCodigo(): string[] {
	const fonte = readFileSync(TIPOS_TS, "utf8");
	const inicio = fonte.indexOf("export type ArtifactByType =");
	expect(inicio).toBeGreaterThan(-1);
	// a union termina no `export type ArtifactType` logo abaixo
	const fim = fonte.indexOf("export type ArtifactType", inicio);
	expect(fim).toBeGreaterThan(inicio);
	const trecho = fonte.slice(inicio, fim);
	const tipos = [...trecho.matchAll(/type:\s*"([a-z_]+)"/g)].map((m) => m[1]);
	return [...new Set(tipos)];
}

describe("sinais-do-funil — fonte única de 'viu oferta' (FIX-398)", () => {
	it("os quatro tipos que provam oferta na tela estão na lista", () => {
		for (const tipo of [
			"comparison_table",
			"recommendation_card",
			"real_offer",
			"simulation_result",
		]) {
			expect(ARTIFACTS_DE_OFERTA).toContain(tipo);
		}
	});

	it("comparison_table conta como 'viu oferta' (o degrau que estava subcontado)", () => {
		expect(ARTIFACTS_DE_OFERTA).toContain("comparison_table");
		expect(PADRAO_SQL_DE_OFERTA).toContain("comparison_table");
	});

	it("a lista do painel deriva da classificação — não é uma segunda verdade", () => {
		const derivada = Object.entries(CLASSIFICACAO_DOS_ARTIFACTS)
			.filter(([, ehOferta]) => ehOferta)
			.map(([tipo]) => tipo)
			.sort();
		expect([...ARTIFACTS_DE_OFERTA].sort()).toEqual(derivada);
	});

	it("TODO tipo de artifact do código está classificado (tipo novo ⇒ falha aqui)", () => {
		const doCodigo = tiposDeArtifactDoCodigo();
		// sanidade: o parser achou a union de verdade
		expect(doCodigo.length).toBeGreaterThan(15);

		const classificados = Object.keys(CLASSIFICACAO_DOS_ARTIFACTS);
		const semClassificacao = doCodigo.filter((t) => !classificados.includes(t));
		expect(
			semClassificacao,
			`Tipo(s) de artifact sem classificação em sinais-do-funil.ts: ${semClassificacao.join(", ")}. ` +
				"Classifique como oferta ou não-oferta — o degrau 'viu oferta' do painel depende disso.",
		).toEqual([]);

		// e o inverso: nada classificado que não exista mais no código
		const inexistentes = classificados.filter((t) => !doCodigo.includes(t));
		expect(inexistentes).toEqual([]);
	});
});
