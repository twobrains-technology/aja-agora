import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// FIX-265 (menor #4, veredito Fable r5, N4): o CLIQUE do simulator-offer
// ("Quero ver!"/"Agora não") só marcava `simulatorOfferDispatched`, nunca
// `simulatorOfferAnswered` — só o texto afirmativo subsequente (index.ts)
// setava essa flag. Isso abria uma janela CROSS-turn: clique → 1º texto
// afirmativo do próximo turno ("quero seguir e fechar") batia na condição de
// index.ts (`simulatorOfferAnswered !== true` + `detectYesNoText === true`) e
// re-emitia o `contemplation_dial` — o mesmo dial já mostrado no clique.
//
// Camada 1 (estrutural, sem DB) — nome NÃO começa com "route" de propósito
// (mesma convenção de lance-embutido-gate.test.ts): `test:unit` exclui
// `route*.test.ts`, e queremos essa invariante rodando em todo PR.
describe("FIX-265 — clique do simulator-offer marca simulatorOfferAnswered (evita dial duplicado cross-turn)", () => {
	const src = readFileSync(join(process.cwd(), "src/app/api/chat/route.ts"), "utf8");
	const start = src.indexOf('if (action.gate === "simulator-offer") {');
	const end = src.indexOf('if (action.gate === "identify") {');
	const handler = src.slice(start, end);

	it("o handler do gate simulator-offer existe e está isolado", () => {
		expect(start).toBeGreaterThan(-1);
		expect(end).toBeGreaterThan(start);
	});

	it('marca simulatorOfferAnswered:true junto com simulatorOfferDispatched (cobre "yes" e "no")', () => {
		// simulatorOfferAnswered precisa estar no MESMO objeto `refreshed` que
		// simulatorOfferDispatched — usado tanto pelo ramo "yes" (linha seguinte)
		// quanto pelo ramo "no" (decisionDispatched), não só num dos dois.
		const refreshedLine = handler.slice(0, handler.indexOf("action.value"));
		expect(refreshedLine).toContain("simulatorOfferDispatched: true");
		expect(refreshedLine).toContain("simulatorOfferAnswered: true");
	});
});
