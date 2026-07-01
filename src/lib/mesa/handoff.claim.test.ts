// FIX-125 — Camada 1 (structural, roda em test:unit). Congela o LOCK ATÔMICO do claim
// contra regressão: o UPDATE de `claimMesaHandoff` DEVE ter a guarda
// `mesa_attendant_id IS NULL` (via drizzle `isNull`). Remover o guard reabre a corrida
// de 2 vencedores (D16). Lê o SOURCE de produção — não importa @/db (sem DATABASE_URL).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("FIX-125 — guard atômico do claim (structural)", () => {
	const handoffSrc = readFileSync(join(process.cwd(), "src/lib/mesa/handoff.ts"), "utf8");

	it("expõe a primitiva claimMesaHandoff", () => {
		expect(handoffSrc).toMatch(/export\s+async\s+function\s+claimMesaHandoff/);
	});

	it("o claim usa UPDATE guardado por mesa_attendant_id IS NULL (isNull)", () => {
		// A guarda IS NULL é o que garante 1 vencedor em corrida — o banco serializa a
		// linha e só o primeiro UPDATE casa (os demais têm mesa_attendant_id já setado).
		expect(handoffSrc).toContain("isNull(mesaHandoffs.mesaAttendantId)");
	});

	it("o claim promove o handoff pra em_andamento ao assumir", () => {
		expect(handoffSrc).toMatch(/status:\s*"em_andamento"/);
	});

	it("o handoff pode nascer sem dono (mesa_attendant_id nullable) no caminho broadcast", () => {
		// createMesaHandoff aceita ausência de atendente (broadcast) — a coluna é nullable.
		// Sem estado "sem dono" não há o que dois atendentes disputar.
		expect(handoffSrc).toMatch(/mesaAttendantId\?:/);
	});
});
