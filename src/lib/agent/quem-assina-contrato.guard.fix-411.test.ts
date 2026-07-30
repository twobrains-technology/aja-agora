// GUARD DE ARQUITETURA — quem pode ESCREVER `escolha` (FIX-411).
//
// Este é o teste que faltou nas nove rodadas de revisão independente. O padrão do
// erro foi sempre o mesmo, e ele é estrutural, não de raciocínio:
//
//   FIX-400 → o commit declarou "as origens inferidas foram removidas". Era
//             verdade no `advance.ts` e FALSO no sistema: o proxy do WhatsApp
//             continuava gravando. A 6ª revisão achou.
//   FIX-406 → o commit declarou "só clique de card e a tool assinam". Era verdade
//             no grafo e FALSO no sistema: o mesmo proxy, de novo. A 9ª achou.
//
// Duas vezes a mesma declaração, duas vezes falsa, com testes de comportamento
// verdes nas duas. Testes de comportamento não pegam isso por construção: eles
// exercitam os caminhos que alguém LEMBROU de exercitar, e o defeito é
// justamente o caminho de que ninguém lembrou.
//
// Então a regra vira código, como manda a lei do projeto — e como ALLOWLIST, não
// blocklist (`~/.claude/reference/arquitetura-agentes-ia.md`): um escritor NOVO
// falha por padrão e precisa ser declarado aqui, com justificativa. É a diferença
// entre "esqueci de varrer as irmãs" e "o teste me obrigou a olhar".
//
// ── ATUALIZADO PELO FIX-413 ──
//
// A 1ª versão deste arquivo trazia uma ressalva honesta: "`escolha` não é o campo
// que move dinheiro; quem chega ao contract_form é `recommendedAdministradora`, e
// a separação estrutural é decisão de jornada em aberto". A décima revisão
// independente confirmou a ressalva medindo NOVE falas que amarravam o contrato
// na marca errada, e a separação foi feita.
//
// Agora o guard cobre os DOIS campos, e `contractOffer` é o que importa: ele é o
// único que o `contract_form` lê (emit-card.ts, PASSO 5). `recommendedOffer`
// segue livre pro texto mexer — ela é a cota EM FOCO na conversa, e errar ali
// custa uma frase confusa, não um contrato.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = join(process.cwd(), "src");

/** Quem pode CRIAR uma `escolha`. Cada entrada precisa de um porquê que sobreviva
 * à pergunta "isto é ação estruturada do cliente, ou interpretação de texto?". */
const AUTORIZADOS = new Map<string, string>([
	[
		"app/api/chat/route.ts",
		// Cliques de card: `choose_offer` resolve o groupId contra os artifacts
		// REAIS já exibidos (`resolveChosenOffer`); `interest` traz a marca no
		// payload do próprio card. Os dois são dado do servidor, não texto.
		"cliques de card (choose_offer / interest) — payload estruturado",
	],
	[
		"lib/agent/langgraph/nodes/converse.ts",
		// A tool `escolher_cota`: o modelo aponta QUAL cota, o servidor confere que
		// ela foi exibida nesta conversa (`listShownOffersForConversation`) e VETA o
		// efeito quando o turno é recusa (FIX-405/410, com o predicado inteiro).
		"tool escolher_cota — groupId conferido contra as ofertas exibidas + veto de recusa",
	],
]);

/** Cria uma `escolha` do zero (literal de objeto), em oposição a PROJETAR uma que
 * já existe (`escolha: funnel.escolha`, `escolha: meta.escolha`) — que é o que
 * `emit.ts` e `state.ts` legitimamente fazem ao copiar estado entre camadas. */
const CRIA_ESCOLHA = /\b(escolha|contractOffer):\s*\{/;

function arquivosTs(dir: string): string[] {
	const saida: string[] = [];
	for (const entrada of readdirSync(dir)) {
		const caminho = join(dir, entrada);
		if (statSync(caminho).isDirectory()) saida.push(...arquivosTs(caminho));
		else if (/\.tsx?$/.test(entrada) && !entrada.includes(".test.")) saida.push(caminho);
	}
	return saida;
}

/** Comentário citando o campo não é escrita — e este repo comenta MUITO. */
function semComentarios(fonte: string): string {
	return fonte
		.split("\n")
		.filter((l) => {
			const t = l.trimStart();
			return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
		})
		.join("\n");
}

describe("FIX-411 — allowlist de quem assina contrato", () => {
	it("só os arquivos declarados criam `escolha`", () => {
		const infratores = arquivosTs(RAIZ)
			.filter((caminho) => CRIA_ESCOLHA.test(semComentarios(readFileSync(caminho, "utf8"))))
			.map((caminho) => relative(join(process.cwd(), "src"), caminho))
			.filter((rel) => !AUTORIZADOS.has(rel));

		expect(
			infratores,
			"Escritor NOVO de `escolha`. Comprometer o cliente com uma cota é dinheiro: " +
				"ou o gatilho é ação estruturada (clique/tool com groupId conferido e veto " +
				"de recusa) e você declara o arquivo em AUTORIZADOS com o porquê, ou é " +
				"inferência sobre texto livre e não pode existir — foi essa a classe de " +
				"defeito das nove revisões independentes.",
		).toEqual([]);
	});

	it("a allowlist não apodrece: todo autorizado ainda existe e ainda escreve", () => {
		// Entrada obsoleta é pior que ausente: ela afrouxa o guard em silêncio, e
		// alguém lê a lista achando que aquele caminho ainda é o vivo.
		for (const [rel, porque] of AUTORIZADOS) {
			const fonte = readFileSync(join(RAIZ, rel), "utf8");
			expect(CRIA_ESCOLHA.test(semComentarios(fonte)), `${rel} (${porque})`).toBe(true);
		}
	});

	it("o detector distingue CRIAR de PROJETAR — senão o guard seria inútil", () => {
		// Sem esta prova, `CRIA_ESCOLHA` poderia estar quebrada (nunca casando) e os
		// dois testes acima passariam para sempre. Já aconteceu neste repo: um teste
		// de espelhos comparava listas entre si e ficou verde com a fonte revertida.
		expect(CRIA_ESCOLHA.test('escolha: { administradora: "X", origem: "mencao" }')).toBe(true);
		expect(CRIA_ESCOLHA.test("escolha: funnel.escolha,")).toBe(false);
		expect(CRIA_ESCOLHA.test("escolha: meta.escolha,")).toBe(false);
		expect(CRIA_ESCOLHA.test("escolha: true,")).toBe(false);
	});
});
