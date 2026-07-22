// FIX-365 — Camada 1 (structural, roda em test:unit sem DB). Congela no SOURCE de
// produção as 3 peças que, juntas, garantem "mesa notificada 1x, não 2x" no fluxo
// aceite→poll: (1) `createMesaHandoff` checa handoff ATIVO antes de inserir, (2)
// `dispatchAutoTransbordo` só faz broadcast quando o handoff foi de fato CRIADO
// nesta chamada, (3) o worker de polling só rechama o transbordo quando a raia
// REALMENTE mudou pra `na_administradora` nesta reconciliação — nunca a cada
// tick. Remover qualquer uma reabre a duplicação. Complementa o teste de
// integração real (`dispatch.fix-365.integration.test.ts`, skip sem DATABASE_URL).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const handoffSrc = readFileSync(join(process.cwd(), "src/lib/mesa/handoff.ts"), "utf8");
const dispatchSrc = readFileSync(join(process.cwd(), "src/lib/mesa/dispatch.ts"), "utf8");
const pollSrc = readFileSync(
	join(process.cwd(), "src/lib/workers/proposal-status-poll.ts"),
	"utf8",
);

describe("FIX-365 — guards estruturais da idempotência do transbordo de mesa", () => {
	it("createMesaHandoff checa handoff ATIVO existente ANTES do insert (não duplica linha)", () => {
		const existingCheckIdx = handoffSrc.indexOf("handoff_ativo_existe");
		const insertIdx = handoffSrc.indexOf(".insert(mesaHandoffs)");
		expect(existingCheckIdx).toBeGreaterThan(-1);
		expect(insertIdx).toBeGreaterThan(-1);
		expect(existingCheckIdx).toBeLessThan(insertIdx);
		// A checagem cobre os DOIS status ativos (aberto/em_andamento) — checar só
		// "aberto" deixaria um handoff já "em_andamento" (claimado) duplicar.
		expect(handoffSrc).toContain("ACTIVE_HANDOFF_STATUSES");
	});

	it("dispatchAutoTransbordo só faz broadcast quando o handoff foi CRIADO nesta chamada (result.ok)", () => {
		expect(dispatchSrc).toContain("if (!result.ok)");
		const guardIdx = dispatchSrc.indexOf("if (!result.ok)");
		// A CHAMADA ao broadcast (não o import do topo do arquivo) precisa vir
		// DEPOIS do guard de early-return.
		const broadcastCallIdx = dispatchSrc.indexOf("broadcastCaseToAttendants(", guardIdx);
		expect(guardIdx).toBeGreaterThan(-1);
		expect(broadcastCallIdx).toBeGreaterThan(guardIdx);
	});

	it("o worker de polling só rechama dispatchAutoTransbordo quando a raia REALMENTE mudou pra na_administradora (não a cada tick do mesmo status)", () => {
		expect(pollSrc).toMatch(/if\s*\(\s*applied\s*&&\s*stage\s*===\s*"na_administradora"\s*\)/);
	});
});
