// FIX-431 — INVARIANTE: nenhum texto que o modelo lê pode mandar chamar uma
// ferramenta que ele não tem.
//
// Este é o teste que mata a CLASSE do defeito, não a instância. Em produção
// (WhatsApp, 2026-08-13, sessões `a68b1945` e `04fda013`) o modelo recebeu a
// ordem "Chame search_groups", obedeceu, tomou `Error: Tool "search_groups" not
// found. Please fix your mistakes.` e traduziu isso ao cliente como problema
// técnico — uma das duas conversas terminou em handoff com a venda perdida.
//
// A tool não sumiu por fase: a descoberta é do nó `discovery`, determinística, e
// `search_groups`/`recommend_groups` NUNCA estiveram no toolset do grafo
// (`WHAT_IF_TOOL_NAMES`, langgraph/toolset.ts). O que estava desatualizado era o
// TEXTO — herança do runtime Vercel anterior, onde `tool-policy.ts` mandava.
//
// Por que varrer o SOURCE e não só a saída das funções: o system prompt é
// montado por dezenas de blocos condicionais (persona, canal, estágio de optin,
// contrato fechado…). Exercitar todas as combinações daria um teste que passa
// por sorte de fixture. O texto-fonte é a única superfície que contém TODAS as
// ordens que podem chegar ao modelo.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WHAT_IF_TOOL_NAMES } from "./langgraph/toolset";

const TOOLSET: ReadonlySet<string> = new Set(WHAT_IF_TOOL_NAMES);

/**
 * As ferramentas que EXISTEM no vocabulário do projeto e NÃO estão no toolset
 * do grafo — o universo de nomes fantasma.
 *
 * Sai de `tool-policy.ts`, que é o registry do runtime Vercel anterior: é
 * exatamente o corpus que o texto herdou e continua citando. Derivar em vez de
 * listar à mão significa que uma tool nova, se aparecer só lá, entra sozinha
 * na varredura.
 */
function nomesForaDoToolset(): string[] {
	const policy = readFileSync(
		join(process.cwd(), "src/lib/agent/orchestrator/tool-policy.ts"),
		"utf8",
	);
	const nomes = new Set<string>();
	for (const m of policy.matchAll(/"([a-z]+_[a-z_]+)"/g)) {
		if (!TOOLSET.has(m[1])) nomes.add(m[1]);
	}
	return [...nomes];
}

/** Arquivos cujo conteúdo chega ao modelo como instrução. */
const FONTES = ["system-prompt.ts", "orchestrator/directives.ts"] as const;

/**
 * Uma ORDEM de chamada — "chame X", "chamar X", "chama X", "chamando X".
 *
 * Só o imperativo conta. Menção descritiva ("`search_groups` é do sistema",
 * "não tente chamar search_groups") não é ordem, e proibir menção seria
 * impedir o texto de EXPLICAR que a ferramenta não é dele — que é justamente a
 * correção. Por isso a negação vizinha é reconhecida abaixo.
 */
/**
 * Tira os comentários de código antes de varrer.
 *
 * A primeira versão pulava linha que começasse com `//`, `*` ou `/*` — e o `*`
 * engolia **bullet de markdown** dentro do próprio prompt (`* chame X`), que é
 * texto que CHEGA ao modelo. Falso negativo provado pelo revisor: a ordem
 * `chame present_contemplation_dial` na linha 233 do system prompt passava
 * verde. Remover os comentários de verdade é o único jeito de não confundir os
 * dois — o que sobra é código e string, e string é o que o modelo lê.
 */
function semComentarios(fonte: string): string {
	return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

/**
 * O texto MENCIONA uma ferramenta como coisa a fazer?
 *
 * Vale qualquer menção ao nome, não só "chame X". A segunda versão deste
 * detector só olhava o verbo `cham*`, e o revisor mostrou que "use X",
 * "RE-BUSQUE", "refaça com X" escapavam — o corpus inteiro herdado do runtime
 * anterior continuava chegando ao modelo. Menção é barata de reconhecer e a
 * correção certa (dizer que a ferramenta NÃO é dele) sempre vem com negação,
 * que é o que a lista abaixo libera.
 */
/**
 * A negação que perdoa a ordem tem que GOVERNAR O VERBO.
 *
 * Três formas de "não" enganaram este detector, todas achadas em auditoria:
 *   • **citada** — `dizendo "não achei nessa faixa"`: é fala do agente entre
 *     aspas, não instrução sobre a ferramenta;
 *   • **condicional** — `Se não tiver os ids, RE-BUSQUE ...`: o "não" pertence
 *     à condição, e a ordem vem depois dela;
 *   • **de outra oração** — resolvido antes, quebrando em travessão.
 *
 * Por isso a sentença é limpa de citações e de orações condicionais ANTES de
 * procurar a negação: o que sobra é a oração que de fato manda.
 */
function oracaoQueManda(sentenca: string): string {
	return (
		sentenca
			// tira o que está entre aspas (fala citada)
			.replace(/"[^"]*"/g, " ")
			.replace(/[“”][^“”]*[“”]/g, " ")
			// tira a oração condicional EM QUALQUER POSIÇÃO ("…; se não tiver X, ORDEM").
			//
			// A primeira versão só removia a condicional INICIAL (`^`), e a linha real
			// que motivou a regra tinha a condicional no meio, depois de ";" — a ordem
			// seguia perdoada. O `g` e a ausência de âncora são o conserto.
			.replace(/\b(se|quando|caso)\b[^,]{0,120},/gi, " ")
	);
}

const NEGACAO = /\b(n[ãa]o|nunca|jamais|proibid[oa]s?|sem\s+chamar|fora\s+do|deixou\s+de)\b/i;
// Marcador didático vale para o que vem DEPOIS dele na mesma sentença, e só
// quando é rótulo de exemplo de erro. `ex.:` sozinho perdoava a sentença
// inteira — inclusive ordens reais escritas como exemplo (3ª auditoria).
const DIDATICO = /\b(BAD|ERRADO|GOOD)\b|\bANTES\b:/;

/**
 * Quebra o texto em SENTENÇAS, não em linhas.
 *
 * A versão anterior filtrava por linha — e as linhas deste prompt são
 * PARÁGRAFOS inteiros. Bastava um "não" em qualquer ponto do parágrafo para a
 * ordem no outro extremo dele ficar invisível. Provado em auditoria: a linha
 * 233 (`chame present_contemplation_dial`) passava verde, e com ela mais oito
 * ordens vivas. O teste estava medindo o próprio filtro — o anti-padrão que o
 * CLAUDE.md deste repo nomeia. Sentença é a menor unidade em que a negação
 * governa o verbo.
 */
function sentencas(texto: string): string[] {
	return (
		semComentarios(texto)
			// Só `.!?`, travessão e quebra de linha terminam sentença.
			//
			// `:` e `;` NÃO: eles introduzem a lista que pertence à mesma oração, e
			// usá-los como delimitador separava "PROIBIDO neste turno:" do que ele
			// proíbe — o filtro perdia a negação e acusava a própria correção.
			//
			// O TRAVESSÃO entrou na re-auditoria de 2026-08-13. Sem ele, uma oração
			// imperativa emendada a outra negativa ficava invisível: "refaça
			// search_groups na faixa nova — ... você NUNCA pode inventar um id" era
			// perdoada inteira pelo "NUNCA" da segunda metade. Cinco ordens vivas
			// passaram por essa janela, uma delas no `SYSTEM_PROMPT` que chega ao
			// modelo do grafo em produção. Trocar parágrafo por sentença foi mudar o
			// nome da janela; o que fecha é a menor unidade em que a negação
			// realmente governa o verbo.
			// O fim de sentença vale mesmo colado em marcador markdown: o prompt
			// escreve "(present_contemplation_dial).** No passo 4, chame …", e sem
			// reconhecer o `.` antes do `**` a oração imperativa continuava grudada na
			// negativa seguinte. Achado pela própria sonda de regressão abaixo — que é
			// o motivo de ela existir. O lookahead exige espaço/marcador/fim, então
			// "R$ 1.200,50" (ponto seguido de dígito) não é quebrado.
			.split(/(?<=[.!?])(?=[\s*#_]|$)|\s+[—–]\s+|\n+/)
			.map((s) => s.trim())
			.filter(Boolean)
	);
}

function ordensDeChamada(texto: string, universo: readonly string[]): Map<string, number> {
	const contagem = new Map<string, number>();
	for (const sentenca of sentencas(texto)) {
		// A correção escreve "PROIBIDO neste turno: chamar search_groups" e "elas
		// não são suas" — proibir a MENÇÃO impediria o texto de ensinar o modelo a
		// não usar a ferramenta, que é exatamente o conserto.
		if (NEGACAO.test(oracaoQueManda(sentenca))) continue;
		// Exemplo negativo do prompt ("BAD: *[chama present_value_picker]*") é
		// material didático mostrando o erro — o oposto de uma ordem.
		if (DIDATICO.test(sentenca)) continue;
		for (const nome of universo) {
			if (sentenca.includes(nome)) contagem.set(nome, (contagem.get(nome) ?? 0) + 1);
		}
	}
	return contagem;
}

describe("nenhum texto ordena tool fora do toolset do grafo", () => {
	for (const arquivo of FONTES) {
		it(`${arquivo} só manda chamar o que o modelo tem`, () => {
			const fonte = readFileSync(join(process.cwd(), "src/lib/agent", arquivo), "utf8");
			const fantasmas = [...ordensDeChamada(fonte, nomesForaDoToolset()).entries()].map(
				([nome, n]) => `${nome} (${n}×)`,
			);
			expect(
				fantasmas,
				`${arquivo} manda o modelo chamar ferramenta que não existe no toolset: ${fantasmas.join(", ")}`,
			).toEqual([]);
		});
	}

	// A âncora do teste. Se alguém devolver a busca ao LLM um dia, é aqui que a
	// decisão aparece — não numa fala de produção.
	it("a busca é do nó discovery, não do modelo", () => {
		expect(TOOLSET.has("search_groups")).toBe(false);
		expect(TOOLSET.has("recommend_groups")).toBe(false);
	});

	// AS SONDAS DE REGRESSÃO DO PRÓPRIO DETECTOR.
	//
	// Cada string abaixo é uma ordem REAL que este teste deixou passar em algum
	// momento do dia 2026-08-13, com o teste verde. Elas ficam aqui porque a
	// regra que a auditoria arrancou (dossiê §12.4) é essa: invariante que varre
	// TEXTO só vale acompanhado de sonda que prove que ele acusa o caso
	// conhecido — verde sem isso é selo institucional, não medição.
	//
	// Se alguém "simplificar" o detector no futuro, é aqui que a simplificação
	// aparece como vermelho, e não numa conversa de produção.
	const ORDENS_QUE_JA_ESCAPARAM: Array<{ caso: string; texto: string }> = [
		{
			caso: "1ª janela — filtro por LINHA engolia o parágrafo inteiro",
			texto:
				"**Na WEB — a agulha arrastável (present_contemplation_dial).** No passo 4, chame present_contemplation_dial com os dados do plano recomendado, e NÃO descreva a UI.",
		},
		{
			caso: "2ª janela — o travessão emendava a ordem a uma oração negativa",
			texto:
				"EXCEÇÃO (FIX-68): se mudar a FAIXA DE VALOR DO BEM, refaca search_groups na faixa nova ANTES de simular — você NUNCA pode inventar um id.",
		},
		{
			caso: "verbo fora de `cham*` (o detector só olhava 'chame/chamar')",
			texto: "RE-BUSQUE com search_groups na faixa nova e use os ids que voltarem.",
		},
		{
			caso: "bullet markdown, que o filtro de comentário engolia pelo `*`",
			texto: "* chame recommend_groups para montar o ranking.",
		},
		// As três formas abaixo vieram da 3ª auditoria: cada uma perdoava a ordem
		// por um "não" que NÃO governa o verbo imperativo.
		{
			caso: "negação CITADA — o 'não' está dentro de aspas, é fala do agente",
			texto:
				'Se search_groups retornar vazio, amplie a faixa (+-20%) e tente de novo, dizendo "não achei nessa faixa".',
		},
		{
			// LINHA LITERAL do prompt (system-prompt.ts:495), não paráfrase.
			//
			// A primeira versão desta fixture reescreveu a frase com a condicional
			// no INÍCIO — forma que o detector já pegava — enquanto a linha real
			// tem a condicional no MEIO, depois de ";". A fixture passava, a
			// ordem seguia viva: a quarta encarnação do mesmo padrão, agora dentro
			// da correção dele. Fixture é cópia do caso real ou não é fixture.
			caso: "negação CONDICIONAL no MEIO da sentença (linha literal do prompt)",
			texto:
				"copie esse id LITERAL do card que você mostrou; se não tiver os ids a mao (histórico longo, nome ambiguo), RE-BUSQUE com search_groups na faixa e use os ids reais retornados, OU pergunte em UMA frase qual grupo — NUNCA invente um id.",
		},
		{
			caso: "marcador de exemplo perdoando a sentença inteira",
			texto: "ex.: quando o cliente pedir outra faixa, chame search_groups com o valor novo.",
		},
	];

	for (const { caso, texto } of ORDENS_QUE_JA_ESCAPARAM) {
		it(`sonda: acusa a ordem que escapou (${caso})`, () => {
			const achado = ordensDeChamada(texto, [
				"search_groups",
				"recommend_groups",
				"present_contemplation_dial",
			]);
			expect(
				achado.size,
				`esta ordem já chegou ao modelo com o teste verde: ${texto.slice(0, 80)}…`,
			).toBeGreaterThan(0);
		});
	}

	// Guarda o próprio detector: sem isto, um regex que não casa com nada faria
	// o teste passar para sempre, medindo nada.
	it("o detector realmente encontra uma ordem", () => {
		const achado = ordensDeChamada("1. Chame search_groups com category=moto", ["search_groups"]);
		expect(achado.get("search_groups")).toBe(1);
	});

	it("o detector não confunde proibição com ordem", () => {
		expect(
			ordensDeChamada("NÃO tente chamar search_groups, ela não é sua", ["search_groups"]).size,
		).toBe(0);
	});
});
