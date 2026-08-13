// FIX-431 (P1 #8) — o servidor não pode prescrever a frase que ele mesmo poda.
//
// Produção, WhatsApp, 2026-08-13, sessão `04fda013`, trace `71191c00`: turno
// completamente mudo. O modelo escreveu — e o que ele escreveu foi exatamente o
// que a directive mandou:
//
//     directive:  'escreva 1-2 frases de introdução no SEU TOM tipo
//                  "Beleza, dá uma olhada na simulação da BANCO DO BRASIL:"'
//     modelo:     "Beleza, dá uma olhada na simulação da BANCO DO BRASIL:"
//     sanitizer:  frase terminada em ":" é GANCHO → segura → descarta no flush
//
// O cliente ficou 15 segundos no silêncio. O servidor ditou o formato que o
// próprio servidor suprime — e o "defeito" apareceu como falha do modelo.
//
// A regra que este teste amarra: directive prescreve INTENÇÃO ("apresente a
// simulação"), nunca a forma da frase. Onde houver exemplo, ele tem que ser uma
// frase completa — não um gancho pendurado esperando o card.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** As duas superfícies que ditam fala ao modelo. O system prompt entrou depois:
 *  a auditoria de 2026-08-13 achou nele o gancho `"Boa! Então deixa eu
 *  confirmar com você:"` — mesma receita de turno mudo, fora do arquivo que a
 *  primeira versão varria. */
const FONTES = [
	"src/lib/agent/orchestrator/directives.ts",
	"src/lib/agent/system-prompt.ts",
] as const;

/**
 * Exemplos de fala prescritos: `tipo "…"`, `ex.: "…"`, `ex: "…"`.
 *
 * Só o que está entre aspas depois desses marcadores é fala sugerida ao modelo
 * — o resto do texto é instrução para o servidor e pode terminar como quiser.
 */
/**
 * O exemplo está sendo citado para PROIBIR? Então não é prescrição.
 *
 * O critério tem que ser EXPLÍCITO, não "tem um 'não' por perto": a linha 476
 * do prompt prescreve dois exemplos logo depois de "que NÃO afirma resultado"
 * — o "não" qualifica o CONTEÚDO da transição, e a fala continua sendo ditada.
 * A heurística genérica perdoava os dois (4ª auditoria). Agora só perdoa quando
 * o texto diz que aquilo é o que NÃO se deve escrever.
 */
const CITADO_PARA_PROIBIR =
	/\b(nunca (escreva|use|diga|termine)|n[ãa]o (escreva|use|diga|termine)|em vez de|deve virar|proibid[oa]s?|jamais)\b/i;

function exemplosDeFalaPrescritos(fonte: string): string[] {
	const encontrados: string[] = [];
	// Todo trecho entre aspas que venha depois de um marcador de exemplo — e os
	// que vêm depois de "OU"/"," dentro da MESMA frase de exemplo também: a
	// primeira versão só pegava o primeiro par de aspas e deixava passar
	// `... tipo "A." ou "B:"`, com o gancho no segundo (auditoria 2026-08-13).
	for (const bloco of fonte.matchAll(
		/(?:tipo|ex\.?:)\s*((?:"[^"]{4,}"(?:\s*(?:ou|,|\/)\s*)?)+)/gi,
	)) {
		for (const m of bloco[1].matchAll(/"([^"]{4,})"/g)) encontrados.push(m[1]);
	}
	// Exemplo de fala entre PARÊNTESES — `("Boa! …")` —, que é como o system
	// prompt escreve boa parte deles. Sem isto, dois ganchos vivos passavam
	// (re-auditoria de 2026-08-13): a regra de formatação que ensinava a
	// terminar a mensagem em ":" e a frase do turno do contrato.
	// `GOOD:` também rotula fala prescrita — é o exemplo do que FAZER.
	for (const bloco of fonte.matchAll(/\bGOOD\b:\s*((?:"[^"]{4,}"(?:\s*(?:ou|,|\/)\s*)?)+)/g)) {
		for (const m of bloco[1].matchAll(/"([^"]{4,})"/g)) encontrados.push(m[1]);
	}
	// Parênteses com MAIS DE UMA aspa: `("A." ou "B:")` — a primeira versão lia
	// só a primeira e o gancho ficava sempre na segunda (3ª auditoria).
	for (const m of fonte.matchAll(/\(\s*((?:"[^"]{4,}"(?:\s*(?:ou|,|\/)\s*)?)+)\s*\)/g)) {
		// Olha a vizinhança: exemplo citado dentro de uma proibição é material
		// didático, não ordem. Sem isto o teste acusaria a própria correção que
		// ensina o modelo a não pendurar frase.
		const inicio = Math.max(0, (m.index ?? 0) - 160);
		const vizinhanca = fonte.slice(inicio, (m.index ?? 0) + m[0].length);
		if (CITADO_PARA_PROIBIR.test(vizinhanca)) continue;
		for (const aspa of m[1].matchAll(/"([^"]{4,})"/g)) encontrados.push(aspa[1]);
	}
	return encontrados;
}

describe("directive prescreve intenção, não formato de frase", () => {
	for (const caminho of FONTES) {
		it(`${caminho}: nenhum exemplo de fala termina em ':' (o sanitizer poda gancho)`, () => {
			const fonte = readFileSync(join(process.cwd(), caminho), "utf8");
			const ganchos = exemplosDeFalaPrescritos(fonte).filter((f) => f.trim().endsWith(":"));
			expect(
				ganchos,
				`estes exemplos são ganchos e serão podados pelo próprio servidor: ${ganchos.join(" | ")}`,
			).toEqual([]);
		});
	}

	// SONDAS DE REGRESSÃO — cada uma é um gancho REAL que este teste deixou
	// passar em 2026-08-13, com o teste verde (dossiê §12.4).
	const GANCHOS_QUE_JA_ESCAPARAM: Array<{ caso: string; texto: string }> = [
		{
			caso: "segundo exemplo, depois de 'ou'",
			texto: 'escreva algo tipo "Show, é este aqui." ou "Olha só:"',
		},
		{
			caso: "exemplo entre parênteses, sem marcador tipo/ex.",
			texto: 'UMA frase natural ("Boa! Pra confirmar seu plano, só preciso de uns dados:").',
		},
		// Da 3ª auditoria: duas formas que o regex de parênteses não via.
		{
			caso: "parênteses com DUAS aspas — só a primeira era lida",
			texto:
				'transição honesta ("Bora ver o que encaixa." ou "Olha só o que a gente consegue na sua faixa:")',
		},
		{
			caso: "exemplo sob o rótulo GOOD:",
			texto: 'GOOD: "Essas são as opções — escolhe uma pra simular:"',
		},
		{
			// LINHA LITERAL do prompt (system-prompt.ts:476). A vizinhança tem
			// "NÃO afirma resultado", e a heurística de proibição perdoava os DOIS
			// exemplos por causa dela — enquanto eles eram, justamente, a fala
			// prescrita. Achado na 4ª auditoria.
			caso: "parênteses após 'NÃO afirma resultado' (linha literal do prompt)",
			texto:
				'Texto antes da tool deve ser uma transição curta e honesta que NÃO afirma resultado ("Bora ver o que encaixa:", "Olha só o que a gente consegue na sua faixa:")',
		},
	];

	for (const { caso, texto } of GANCHOS_QUE_JA_ESCAPARAM) {
		it(`sonda: acusa o gancho que escapou (${caso})`, () => {
			const ganchos = exemplosDeFalaPrescritos(texto).filter((f) => f.trim().endsWith(":"));
			expect(ganchos.length, `este gancho já foi prescrito ao modelo: ${texto}`).toBeGreaterThan(0);
		});
	}

	// Guarda o detector: se o regex parar de casar, o teste viraria decoração.
	it("o detector reconhece um gancho", () => {
		expect(
			exemplosDeFalaPrescritos('escreva algo tipo "Beleza, dá uma olhada na simulação da X:"'),
		).toEqual(["Beleza, dá uma olhada na simulação da X:"]);
	});
});
