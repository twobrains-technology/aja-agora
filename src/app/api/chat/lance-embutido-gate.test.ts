import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// BUG-LANCE-EMBUTIDO-PULADO (QA noturno E2E browser, 2026-06-21): o handler do
// gate `lance` em route.ts pulava o gate `lance-embutido` (educação + opt-in)
// quando a resposta era "no"/"maybe", indo direto pra busca (pipeSearchSummaryTurn).
// Isso é regressão do FIX-4 (jornada-canonica §2: "a educação de lance embutido
// vale pra QUALQUER resposta — Sim/Não/Talvez; o texto mira quem NÃO tem o valor
// do lance hoje").
//
// Rodada 3 (remoção do runtime Vercel): o handler não decide mais o PRÓXIMO
// passo inline (isso morava no ramo Vercel-específico, morto) — ele só persiste
// a resposta e delega pro GRAFO via `pipeDirectiveTurn` (LangGraph, `advance` +
// `nextGate` decidem o resto, qualify-state.ts). A invariante que importa agora
// não é mais "route.ts hardcoda gate: lance-embutido", é "route.ts nunca
// decide/pula pra busca sozinho" — o teste foi reescrito pra essa forma.
//
// Camada 1 (estrutural): trava a invariante de roteamento no source de produção.
// O nome do arquivo NÃO começa com "route" de propósito — `test:unit` exclui
// `route*.test.ts`, e queremos que esta regressão rode em todo PR.
describe("BUG-LANCE-EMBUTIDO-PULADO — gate lance nunca decide/pula pro fecho sozinho (FIX-4)", () => {
	const src = readFileSync(join(process.cwd(), "src/app/api/chat/route.ts"), "utf8");
	// Isola só o bloco do handler do gate "lance" (não lance-value/lance-embutido).
	const start = src.indexOf('if (action.gate === "lance") {');
	const end = src.indexOf('if (action.gate === "simulator-offer")');
	const lanceHandler = src.slice(start, end);

	it("o handler do gate lance existe e está isolado", () => {
		expect(start).toBeGreaterThan(-1);
		expect(end).toBeGreaterThan(start);
	});

	it("delega SEMPRE pro grafo (pipeDirectiveTurn), independente da resposta — não hardcoda o próximo gate", () => {
		expect(lanceHandler).toContain("await pipeDirectiveTurn(");
	});

	it("o handler do gate lance NÃO cai direto na busca (pularia a educação FIX-4)", () => {
		// a CHAMADA de pipeSearchSummaryTurn não pode ser alcançada a partir do
		// gate `lance` — senão "no"/"maybe" pulariam a educação de lance embutido
		// (quem decide se passa por ela é o `nextGate`/`advance` do grafo, nunca
		// o handler do click). Menção em comentário é ok; o que importa é não
		// haver a chamada.
		expect(lanceHandler).not.toContain("await pipeSearchSummaryTurn(");
	});
});

// FIX-215 (Ata 2026-07-04) — a conversa de lance inteira (incluindo este 2º
// passo, o opt-in de lance embutido) só acontece PÓS-reveal agora: quando o
// gate lance-embutido resolve, a busca JÁ ocorreu (é pré-requisito pra este
// gate existir, qualify-state.ts). Rodada 3: o handler delega pro GRAFO via
// `pipeUserTurn` (o nó `advance` consulta `nextGate` e decide o passo real:
// simulator-offer/decision/nova busca se o alvo mudou) — nunca re-busca
// incondicional nem decide o próximo passo sozinho no route.ts.
describe("FIX-215 — handler do gate lance-embutido delega pro grafo, nunca re-busca incondicional", () => {
	const src = readFileSync(join(process.cwd(), "src/app/api/chat/route.ts"), "utf8");
	const start = src.indexOf('if (action.gate === "lance-embutido") {');
	const end = src.indexOf('trace.setFinish("ok")', start);
	const lanceEmbutidoHandler = src.slice(start, end);

	it("o handler do gate lance-embutido existe e está isolado", () => {
		expect(start).toBeGreaterThan(-1);
		expect(end).toBeGreaterThan(start);
	});

	it("delega a resposta como turno de usuário pro grafo (pipeUserTurn) — o `advance`/`nextGate` do grafo decide o próximo passo", () => {
		expect(lanceEmbutidoHandler).toContain("await pipeUserTurn(");
	});

	it("NÃO chama pipeSearchSummaryTurn direto (a re-busca, se necessária, é decisão do grafo, não do handler do click)", () => {
		expect(lanceEmbutidoHandler).not.toContain("await pipeSearchSummaryTurn(");
	});
});

// FIX-272 (rodada 8, veredito Fable r7, achado novo D3): dup-click em "Sim,
// considerar lance embutido" (2ª vez que o handler roda pra este gate, ex.
// clique repetido antes do botão desabilitar) reprocessa o estado JÁ avançado
// por click #1 — turno 100% vazio (ar morto). O handler precisa detectar o
// replay ANTES de reprocessar/redespachar. Guard sobrevive intacto ao pivô de
// runtime (rodada 3) — só o que ele guarda mudou de forma (route.ts delega
// pro grafo via `pipeUserTurn` em vez de decidir o gate inline).
describe("FIX-272 — dup-click do gate lance-embutido não reprocessa (evita ar morto)", () => {
	const src = readFileSync(join(process.cwd(), "src/app/api/chat/route.ts"), "utf8");
	const start = src.indexOf('if (action.gate === "lance-embutido") {');
	const end = src.indexOf('trace.setFinish("ok")', start);
	const lanceEmbutidoHandler = src.slice(start, end);

	it("guarda contra reprocessar um gate JÁ respondido (checa qualifyAnswers.lanceEmbutido antes de despachar)", () => {
		expect(lanceEmbutidoHandler).toMatch(/qualifyAnswers\?\.lanceEmbutido\s*!==\s*undefined/);
	});

	it("o guard vem ANTES do despacho pro grafo (curto-circuita o replay)", () => {
		const guardIdx = lanceEmbutidoHandler.search(
			/qualifyAnswers\?\.lanceEmbutido\s*!==\s*undefined/,
		);
		const dispatchIdx = lanceEmbutidoHandler.indexOf("await pipeUserTurn(");
		expect(guardIdx).toBeGreaterThan(-1);
		expect(dispatchIdx).toBeGreaterThan(-1);
		expect(guardIdx).toBeLessThan(dispatchIdx);
	});
});
