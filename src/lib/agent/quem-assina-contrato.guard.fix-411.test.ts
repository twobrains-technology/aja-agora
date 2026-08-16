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
		"lib/agent/aceite.ts",
		// P0-1 (dossiê 2026-08-15) — o escritor ÚNICO do aceite, para os dois
		// canais. O gatilho é sempre ação estruturada (clique de card na web,
		// botão interativo no WhatsApp), e o groupId é conferido contra
		// `listShownOffersForConversation` antes de amarrar dinheiro — cota que não
		// foi exibida não ancora nada.
		//
		// Ele existe justamente para ENCOLHER esta lista: enquanto a regra estava
		// escrita em dois lugares, o FIX-386 corrigiu a web e o WhatsApp seguiu
		// prendendo o funil no gate `decision`, prometendo pré-cadastro sem
		// proposta (conversa `9b9f9aab`, `bevi_proposals = 0`).
		"escritor único do aceite — groupId conferido contra as ofertas exibidas, nos dois canais",
	],
	[
		"app/api/chat/route.ts",
		// Cliques de card: `choose_offer` resolve o groupId contra os artifacts
		// REAIS já exibidos (`resolveChosenOffer`); `interest` traz a marca no
		// payload do próprio card. Os dois são dado do servidor, não texto.
		"cliques de card (choose_offer / interest) — payload estruturado",
	],
	[
		"lib/whatsapp/interactive-handlers.ts",
		// O WhatsApp não tem card, mas tem BOTÃO interativo: `handleGroupSelected`
		// responde a um `group_<id>` que o cliente TOCOU, com os números do grupo
		// resolvido. É o equivalente exato do `choose_offer` da web (FIX-414).
		"clique de grupo no WhatsApp — botão interativo, números do grupo resolvido",
	],
	[
		"lib/agent/langgraph/nodes/converse.ts",
		// A tool `escolher_cota`: o modelo aponta QUAL cota, o servidor confere que
		// ela foi exibida nesta conversa (`listShownOffersForConversation`) e VETA o
		// efeito quando o turno é recusa (FIX-405/410, com o predicado inteiro).
		"tool escolher_cota — groupId conferido contra as ofertas exibidas + veto de recusa",
	],
]);

/** Toca o campo de forma que NÃO seja uma projeção pura.
 *
 * FIX-414 — a 1ª versão era `/\b(escolha|contractOffer):\s*\{/`, e a 11ª revisão
 * independente mostrou três bypasses triviais, todos medidos com arquivos-sonda:
 *
 *   contractOffer: variavel        → não pegava
 *   "contractOffer": { … }         → não pegava
 *   meta.contractOffer = { … }     → não pegava
 *
 * E o pior: o handler de `interest` em `route.ts` — escritor VIVO — já era
 * invisível, porque usa `...(x ? { contractOffer: x } : {})`. O guard passava só
 * porque o handler irmão (`choose_offer`) tinha o literal.
 *
 * A regra correta é a inversa: qualquer ESCRITA conta, e só a PROJEÇÃO
 * reconhecida é isenta. Projeção é copiar o campo de uma camada pra outra
 * (`escolha: funnel.escolha`) — o que `emit.ts` e `state.ts` legitimamente fazem.
 *
 * Regex ainda não é AST, e a 11ª revisão tem razão ao pedir AST. Mas a inversão
 * do default (allowlist de FORMA, não blocklist) fecha a família inteira de
 * bypass por sintaxe, que era o buraco real. */
const CAMPOS = "(?:escolha|contractOffer)";
/** Escrita: `campo:` em POSIÇÃO DE CHAVE (início de linha, ou após `{ , ( ;`),
 * ou atribuição `x.campo =`.
 *
 * A exigência de POSIÇÃO não é preciosismo. Sem ela, `system-context.ts` era
 * acusado por uma frase em português dentro de uma string — "…ou pedir que ele
 * confirme a escolha: isso já aconteceu". Guard que acusa prosa é guard que
 * alguém desliga na primeira sexta-feira. */
const ESCREVE = new RegExp(
	`(?:(?:^|[{,(;])\\s*["']?${CAMPOS}["']?\\s*:)|(?:\\.${CAMPOS}\\s*=[^=])`,
);
/** Projeção pura: copia o MESMO campo de outro objeto, sem construir nada. */
const PROJETA = new RegExp(`["']?\\b${CAMPOS}["']?\\s*:\\s*\\w+\\.${CAMPOS}\\s*[,;)]`);
/** LIMPEZA — `campo: undefined`. Isenta por natureza: apagar a âncora reduz
 * compromisso, nunca o cria. É o que `discovery.ts` faz numa busca nova, e o
 * guard tem que deixar passar, senão desincentiva exatamente a higiene que a 12ª
 * revisão independente cobrou (o campo não tinha ciclo de vida: ninguém o
 * limpava, e um clique de duas buscas atrás fechava contrato numa cota que já
 * havia sumido da tela). */
const LIMPA = new RegExp(`["']?\\b${CAMPOS}["']?\\s*:\\s*undefined\\s*[,;)]`);
/** Declaração de tipo/chave booleana de canal — não é escrita de valor. */
const DECLARA = new RegExp(`\\b${CAMPOS}\\??\\s*:\\s*(?:true|ConversationMetadata|FunnelState)`);

function tocaCampo(linha: string): boolean {
	if (!ESCREVE.test(linha)) return false;
	return !PROJETA.test(linha) && !DECLARA.test(linha) && !LIMPA.test(linha);
}

const CRIA_ESCOLHA = { test: (fonte: string) => fonte.split("\n").some(tocaCampo) };

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

	it("o detector pega as formas de ESCRITA, inclusive as três que burlavam", () => {
		// Sem esta prova o detector poderia estar quebrado (nunca casando) e os dois
		// testes acima passariam para sempre. Já aconteceu neste repo: um teste de
		// espelhos comparava listas entre si e ficou verde com a fonte revertida.
		expect(CRIA_ESCOLHA.test('escolha: { administradora: "X", origem: "mencao" }')).toBe(true);
		// Os três bypasses que a 11ª revisão mediu com arquivos-sonda.
		expect(CRIA_ESCOLHA.test("contractOffer: ancoraDoClique,")).toBe(true);
		expect(CRIA_ESCOLHA.test('"contractOffer": { administradora: "X" },')).toBe(true);
		expect(CRIA_ESCOLHA.test('meta.contractOffer = { administradora: "X" };')).toBe(true);
		// E a forma do spread, que era o escritor VIVO invisível ao guard.
		expect(CRIA_ESCOLHA.test("...(x ? { contractOffer: x } : {}),")).toBe(true);
	});

	it("o detector ISENTA projeção e declaração — senão o guard viraria ruído", () => {
		// A contraprova. Um guard que acusa `emit.ts` e `state.ts` a cada rodada é
		// um guard que alguém desliga.
		expect(CRIA_ESCOLHA.test("escolha: funnel.escolha,")).toBe(false);
		expect(CRIA_ESCOLHA.test("contractOffer: meta.contractOffer,")).toBe(false);
		expect(CRIA_ESCOLHA.test("escolha: true,")).toBe(false);
		expect(CRIA_ESCOLHA.test('contractOffer?: ConversationMetadata["contractOffer"];')).toBe(false);
		// Prosa em português dentro de string — o falso positivo REAL que a versão
		// endurecida produziu em `system-context.ts` antes da exigência de posição
		// de chave. Guard que acusa prosa é guard que alguém desliga.
		expect(CRIA_ESCOLHA.test('"…ou pedir que ele confirme a escolha: isso já aconteceu",')).toBe(
			false,
		);
		// Limpeza: apagar a âncora reduz compromisso, nunca o cria (FIX-415).
		expect(CRIA_ESCOLHA.test("contractOffer: undefined,")).toBe(false);
		// …mas escrever um valor logo ao lado continua contando.
		expect(CRIA_ESCOLHA.test('contractOffer: { administradora: "X" },')).toBe(true);
	});
});
