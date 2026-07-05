import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// BUG-LANCE-EMBUTIDO-PULADO (QA noturno E2E browser, 2026-06-21): o handler do
// gate `lance` em route.ts pulava o gate `lance-embutido` (educação + opt-in)
// quando a resposta era "no"/"maybe", indo direto pra busca (pipeSearchSummaryTurn).
// Isso é regressão do FIX-4 (jornada-canonica §2: "a educação de lance embutido
// vale pra QUALQUER resposta — Sim/Não/Talvez; o texto mira quem NÃO tem o valor
// do lance hoje"). O `nextGate` (qualify-state.ts) já passava TODOS por
// lance-embutido, mas o handler do route não foi atualizado pelo FIX-4 → no
// runtime, "no"/"maybe" pulavam a educação (confirmado no browser + DB:
// lanceEmbutido ausente, searchDispatched=true).
//
// Camada 1 (estrutural): trava a invariante de roteamento no source de produção.
// O nome do arquivo NÃO começa com "route" de propósito — `test:unit` exclui
// `route*.test.ts`, e queremos que esta regressão rode em todo PR.
describe("BUG-LANCE-EMBUTIDO-PULADO — gate lance roteia TODOS por lance-embutido (FIX-4)", () => {
	const src = readFileSync(join(process.cwd(), "src/app/api/chat/route.ts"), "utf8");
	// Isola só o bloco do handler do gate "lance" (não lance-value/lance-embutido).
	const start = src.indexOf('if (action.gate === "lance") {');
	const end = src.indexOf('if (action.gate === "simulator-offer")');
	const lanceHandler = src.slice(start, end);

	it("o handler do gate lance existe e está isolado", () => {
		expect(start).toBeGreaterThan(-1);
		expect(end).toBeGreaterThan(start);
	});

	it("o caminho não-yes dispara o gate `lance-embutido` (educação antes da busca)", () => {
		expect(lanceHandler).toContain('gate: "lance-embutido"');
	});

	it("o handler do gate lance NÃO cai direto na busca (pularia a educação FIX-4)", () => {
		// a CHAMADA de pipeSearchSummaryTurn só deve ser alcançada DEPOIS do gate
		// lance-embutido, nunca direto do gate `lance` — senão "no"/"maybe" pulam a
		// educação. (Menção em comentário é ok; o que importa é não haver a chamada.)
		expect(lanceHandler).not.toContain("await pipeSearchSummaryTurn(");
	});
});

// FIX-215 (Ata 2026-07-04) — a conversa de lance inteira (incluindo este 2º
// passo, o opt-in de lance embutido) só acontece PÓS-reveal agora: quando o
// gate lance-embutido resolve, a busca JÁ ocorreu (é pré-requisito pra este
// gate existir, qualify-state.ts). O handler NÃO pode mais chamar
// pipeSearchSummaryTurn incondicionalmente (re-buscaria à toa) — tem que
// despachar o PRÓXIMO passo real (simulator-offer/decision) via nextGate.
describe("FIX-215 — handler do gate lance-embutido despacha o PRÓXIMO gate, nunca re-busca incondicional", () => {
	const src = readFileSync(join(process.cwd(), "src/app/api/chat/route.ts"), "utf8");
	const start = src.indexOf('if (action.gate === "lance-embutido") {');
	// Marca o fim da chain de handlers do gate (não da chamada de objeto mais
	// próxima — o handler tem objetos literais no meio, ex.: persistMeta({...})).
	const end = src.indexOf('trace.setFinish("ok")', start);
	const lanceEmbutidoHandler = src.slice(start, end);

	it("o handler do gate lance-embutido existe e está isolado", () => {
		expect(start).toBeGreaterThan(-1);
		expect(end).toBeGreaterThan(start);
	});

	it("consulta nextGate (não chama pipeSearchSummaryTurn de forma incondicional)", () => {
		expect(lanceEmbutidoHandler).toContain("nextGate(");
		expect(lanceEmbutidoHandler).toContain("pipeGatePrompt(");
	});

	it("só chama pipeSearchSummaryTurn dentro do ramo condicional (nextGate === \"search\")", () => {
		const searchCallIdx = lanceEmbutidoHandler.indexOf("await pipeSearchSummaryTurn(");
		const conditionIdx = lanceEmbutidoHandler.indexOf('=== "search"');
		expect(searchCallIdx).toBeGreaterThan(-1);
		expect(conditionIdx).toBeGreaterThan(-1);
		// A condição precisa vir ANTES da chamada — prova que ela está guardada.
		expect(conditionIdx).toBeLessThan(searchCallIdx);
	});
});
