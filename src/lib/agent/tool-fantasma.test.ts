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
const ORDEM = /(?<!n[ãa]o\s)(?<!nunca\s)cham(?:e|a|ar|ando)\s+(?:a\s+)?([a-z]+_[a-z_]+)/gi;

function ordensDeChamada(texto: string): Map<string, number> {
	const contagem = new Map<string, number>();
	for (const linha of texto.split("\n")) {
		// Comentário de CÓDIGO nunca chega ao modelo. Sem esta linha, o próprio
		// comentário que explica o defeito ("aqui dizia: Chame search_groups")
		// contaria como defeito — teste que se morde.
		if (/^\s*(\/\/|\*|\/\*)/.test(linha)) continue;
		// PROIBIÇÃO não é ordem, e é justamente o que a correção escreve:
		// "PROIBIDO neste turno: chamar search_groups". Proibir a menção
		// impediria o texto de ensinar o modelo a NÃO usar a ferramenta.
		if (/\b(n[ãa]o|nunca|jamais|proibido|proibida[s]?)\b[^.]{0,100}?cham/i.test(linha)) continue;
		// Exemplo negativo do prompt ("BAD: *[chama present_value_picker]*") é
		// material didático mostrando o erro — o oposto de uma ordem.
		if (/\bBAD\b|\bERRADO\b/.test(linha)) continue;
		for (const m of linha.matchAll(ORDEM)) {
			contagem.set(m[1], (contagem.get(m[1]) ?? 0) + 1);
		}
	}
	return contagem;
}

describe("nenhum texto ordena tool fora do toolset do grafo", () => {
	for (const arquivo of FONTES) {
		it(`${arquivo} só manda chamar o que o modelo tem`, () => {
			const fonte = readFileSync(join(process.cwd(), "src/lib/agent", arquivo), "utf8");
			const fantasmas = [...ordensDeChamada(fonte).entries()]
				.filter(([nome]) => !TOOLSET.has(nome))
				.map(([nome, n]) => `${nome} (${n}×)`);
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

	// Guarda o próprio detector: sem isto, um regex que não casa com nada faria
	// o teste passar para sempre, medindo nada.
	it("o detector realmente encontra uma ordem", () => {
		const achado = ordensDeChamada("1. Chame search_groups com category=moto");
		expect(achado.get("search_groups")).toBe(1);
	});

	it("o detector não confunde proibição com ordem", () => {
		expect(ordensDeChamada("NÃO tente chamar search_groups, ela não é sua").size).toBe(0);
	});
});
