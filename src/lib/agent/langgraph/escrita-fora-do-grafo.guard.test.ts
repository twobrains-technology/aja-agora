// Guard de arquitetura: dentro de um turno, SÓ o nó `persist` escreve no
// `metadata` da conversa.
//
// Por quê isso precisa ser código e não combinado: `persistMeta` faz
// `UPDATE ... SET metadata = <objeto inteiro>`, e o nó `persist` roda por
// último, gravando `projectToMeta(state)`. Qualquer escrita feita ANTES dele —
// de dentro de uma tool, de um nó anterior — é sobrescrita e some. Some em
// SILÊNCIO: nenhuma exceção, nenhum log, só o agente esquecendo o que o cliente
// acabou de dizer alguns turnos depois. Já custou três caças ao bug no mesmo
// dia; a terceira foi uma tool que persistia de dentro do próprio `execute`.
//
// O caminho certo pra um efeito de tool virar estado é devolvê-lo no `return`
// do nó, que é o que a documentação do LangGraph prescreve pra nó customizado
// que chama tools ("manually propagate any Command objects returned by the
// tools as the update from your node").
//
// Este teste lê os fontes em vez de exercitar comportamento de propósito: a
// armadilha é uma propriedade da ARQUITETURA (quem pode escrever onde), não de
// uma execução específica — e nenhum teste de comportamento pega a linha que
// alguém ainda não escreveu.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = join(process.cwd(), "src/lib/agent");

/** Onde escrever meta durante o turno é proibido, e a única exceção. */
const AREAS_PROIBIDAS = ["tools", "langgraph/nodes"];
const UNICO_AUTORIZADO = "langgraph/nodes/persist.ts";

/** Funções que substituem a coluna `metadata`/identidade inteira. */
const ESCRITORES = /\b(persistMeta|storeIdentity)\s*\(/;

function arquivosTs(dir: string): string[] {
	const saida: string[] = [];
	for (const entrada of readdirSync(dir)) {
		const caminho = join(dir, entrada);
		if (statSync(caminho).isDirectory()) {
			saida.push(...arquivosTs(caminho));
		} else if (entrada.endsWith(".ts") && !entrada.includes(".test.")) {
			saida.push(caminho);
		}
	}
	return saida;
}

/** Comentário citando a função (isto aqui é comum e legítimo) não é escrita. */
function linhasDeCodigo(fonte: string): { numero: number; texto: string }[] {
	return fonte
		.split("\n")
		.map((texto, i) => ({ numero: i + 1, texto }))
		.filter(({ texto }) => {
			const t = texto.trimStart();
			return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
		});
}

describe("escrita de estado dentro do turno do grafo", () => {
	it("só o nó persist escreve no metadata — tools e demais nós devolvem pelo estado", () => {
		const infratores: string[] = [];

		for (const area of AREAS_PROIBIDAS) {
			for (const caminho of arquivosTs(join(RAIZ, area))) {
				const relativo = caminho.slice(RAIZ.length + 1);
				if (relativo === UNICO_AUTORIZADO) continue;
				for (const { numero, texto } of linhasDeCodigo(readFileSync(caminho, "utf8"))) {
					if (ESCRITORES.test(texto)) {
						infratores.push(`agent/${relativo}:${numero} → ${texto.trim()}`);
					}
				}
			}
		}

		expect(
			infratores,
			[
				"Escrita de metadata dentro do turno do grafo — o nó `persist` sobrescreve isto no fim",
				"do turno e a mudança some sem erro nenhum.",
				"",
				"Faça o efeito virar estado pelo caminho que o grafo controla: devolva o campo no",
				"`return { funnel: ... }` do nó (registrando-o em FUNNEL_KEYS, projectToMeta e",
				"funnelFromMeta — ver state.projecao.test.ts).",
				"",
				infratores.join("\n"),
			].join("\n"),
		).toEqual([]);
	});
});
