// FIX-431 — a cadeia de tools que um directive manda encadear TEM QUE FECHAR.
//
// Este teste nasceu de um erro cometido na própria rodada de correção. O
// directive do simulador mandava `present_contemplation_dial`, tool que não
// existe no toolset do grafo. A primeira correção trocou a ordem por uma
// AFIRMAÇÃO falsa ("o SISTEMA coloca a agulha na tela" — ninguém emite). A
// segunda trocou por `simulate_contemplation` + `present_scenarios`, duas tools
// que existem — e que **não se encaixam**: o schema de `present_scenarios` pede
// literalmente o "Output de compute_scenarios" (`{conservador, provavel,
// acelerado}`), enquanto `simulate_contemplation` devolve `ContemplationDialResult`.
//
// Três roupas do mesmo defeito: o servidor prescrevendo ao modelo um passo que
// ele não consegue executar. A terceira só não chegou à produção porque uma
// auditoria leu o schema. Este teste é essa leitura, automatizada.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WHAT_IF_TOOL_NAMES } from "@/lib/agent/langgraph/toolset";

const DIRECTIVES = readFileSync(
	join(process.cwd(), "src/lib/agent/orchestrator/directives.ts"),
	"utf8",
);
const AI_SDK = readFileSync(join(process.cwd(), "src/lib/agent/tools/ai-sdk.ts"), "utf8");

/** O schema de `present_scenarios` declara de quem é o output que ele consome. */
function tabelaDeDependencia(): Map<string, string> {
	const mapa = new Map<string, string>();
	// `.describe("Output de compute_scenarios")` — o contrato está escrito no
	// próprio schema, então é dali que a dependência é lida, não de uma lista
	// paralela que envelheceria sozinha.
	// Para cada "Output de X", a tool dona é a declaração `nome: tool({` mais
	// próxima ACIMA — varrer para trás evita casar com uma tool anterior, que é
	// o que um regex ganancioso faria.
	const declaracoes = [...AI_SDK.matchAll(/^\t(\w+): tool\(\{/gm)];
	for (const dep of AI_SDK.matchAll(/describe\(\s*"Output de (\w+)"/g)) {
		const anteriores = declaracoes.filter((d) => (d.index ?? 0) < (dep.index ?? 0));
		const dona = anteriores.at(-1)?.[1];
		if (dona) mapa.set(dona, dep[1]);
	}
	return mapa;
}

describe("directive não manda encadear tools incompatíveis", () => {
	const dependencia = tabelaDeDependencia();

	it("o schema declara a dependência (o detector tem o que ler)", () => {
		expect(dependencia.get("present_scenarios")).toBe("compute_scenarios");
	});

	it("quando um directive manda chamar uma tool, manda também a que a alimenta", () => {
		const problemas: string[] = [];
		for (const [consumidora, produtora] of dependencia) {
			if (!DIRECTIVES.includes(consumidora)) continue;
			// Basta que a produtora apareça no mesmo arquivo de directives: é o
			// texto que o modelo lê no turno, e o par tem que estar visível nele.
			if (!DIRECTIVES.includes(produtora)) {
				problemas.push(`${consumidora} é prescrita sem ${produtora}, que produz o input dela`);
			}
		}
		expect(problemas).toEqual([]);
	});

	it("as duas pontas da cadeia existem no toolset do grafo", () => {
		for (const [consumidora, produtora] of dependencia) {
			if (!DIRECTIVES.includes(consumidora)) continue;
			expect(WHAT_IF_TOOL_NAMES).toContain(consumidora);
			expect(WHAT_IF_TOOL_NAMES).toContain(produtora);
		}
	});
});
