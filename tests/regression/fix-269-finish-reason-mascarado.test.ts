// FIX-269 (rodada 7, veredito Fable r6, nit de observabilidade — Lei 5): o
// route.ts aplicava `trace.setFinish("ok")` incondicional depois de qualquer
// turno que emitiu algo visível — sobrescrevendo cego o finishReason real de
// turnos CONTIDOS (ex.: "tool-error-recovered", emitido pelo orquestrador e
// agora forwardado pelo adapter web, FIX-269 em adapter.ts). Trava
// source-level (mesmo padrão de tests/regression/fix-237-cards-orfaos.test.ts)
// que os 2 pontos de `trace.setFinish("ok")` do route.ts são guardados por
// `trace.hasFinish()`.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(rel: string): string {
	return readFileSync(resolve(process.cwd(), rel), "utf-8");
}

describe("FIX-269 — route.ts não sobrescreve finishReason real com 'ok'", () => {
	it("nenhuma ocorrência de trace.setFinish(\"ok\") é incondicional — todas guardadas por !trace.hasFinish()", () => {
		const route = readSource("src/app/api/chat/route.ts");
		const marker = 'trace.setFinish("ok")';
		let idx = route.indexOf(marker);
		let occurrences = 0;
		while (idx !== -1) {
			occurrences++;
			const windowBefore = route.slice(Math.max(0, idx - 200), idx);
			expect(
				windowBefore,
				`ocorrência de trace.setFinish("ok") em offset ${idx} sem guard !trace.hasFinish() nos 200 chars anteriores`,
			).toMatch(/trace\.hasFinish\(\)/);
			idx = route.indexOf(marker, idx + marker.length);
		}
		expect(occurrences, "esperava pelo menos 1 trace.setFinish(\"ok\") no route.ts").toBeGreaterThan(0);
	});

	it("adapter.ts (web) forwarda o TurnEvent 'finish' pro trace (não é mais no-op puro)", () => {
		const adapter = readSource("src/lib/web/adapter.ts");
		const finishCaseIdx = adapter.indexOf('case "finish":');
		expect(finishCaseIdx, "case 'finish' não encontrado em adapter.ts").toBeGreaterThan(-1);
		const windowAfter = adapter.slice(finishCaseIdx, finishCaseIdx + 200);
		expect(windowAfter).toMatch(/getTraceForWriter\(writer\)\?\.setFinish\(ev\.reason\)/);
	});
});
