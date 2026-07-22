// FIX-123 — Camada 1 (structural, roda em test:unit). Congela a REGRA de quais
// transições transbordam: o worker dispara o transbordo automático SÓ quando a raia
// REALMENTE mudou (`applied === true`) E SÓ para `na_administradora` (Decisão 1 do bloco
// — docs/correcoes/decisions/2026-07-01-bloco-mesa-transbordo-auto.md). Lê o source de
// produção — não importa @/db.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("FIX-123 — gatilho automático do transbordo (structural)", () => {
	const workerSrc = readFileSync(
		join(process.cwd(), "src/lib/workers/proposal-status-poll.ts"),
		"utf8",
	);

	it("o worker dispara o transbordo automático (dispatchAutoTransbordo)", () => {
		expect(workerSrc).toContain("dispatchAutoTransbordo");
	});

	it("só dispara quando a raia REALMENTE mudou (applied) e é na_administradora", () => {
		// A guarda tem que amarrar applied + na_administradora — senão re-polls do mesmo
		// status re-disparariam (applied) ou raias erradas transbordariam (na_administradora).
		expect(workerSrc).toMatch(
			/applied[\s\S]{0,80}na_administradora|na_administradora[\s\S]{0,80}applied/,
		);
	});

	it("o transbordo é best-effort — envolto em try/catch, não derruba o ciclo", () => {
		// Falha do transbordo/broadcast NÃO pode derrubar a transição de raia nem o poll.
		expect(workerSrc).toMatch(/try\s*{[\s\S]*dispatchAutoTransbordo[\s\S]*catch/);
	});
});
