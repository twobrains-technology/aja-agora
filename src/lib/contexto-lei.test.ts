import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Gate de drift do contexto-lei.
 *
 * O `CLAUDE.md` é o único doc que TODA sessão lê antes de qualquer coisa. Quando ele
 * aponta pra um módulo que foi renomeado ou morreu numa reforma, o agente não fica sem
 * resposta — ele fica com a resposta ERRADA, e passa a se autolimitar a uma arquitetura
 * que não existe mais. É o pior tipo de doc desatualizada, porque tem o maior alcance.
 *
 * Por isso ele é a única doc do repo tratada como LEI e ancorada em teste: o próprio
 * `CLAUDE.md` diz que `docs/` é "histórico, não lei", e inflar este gate pra 500 arquivos
 * o transformaria em ruído vermelho que todo mundo aprende a ignorar.
 *
 * Doc que mente vira build vermelho, do mesmo jeito que teste que falha.
 */

const RAIZ = process.cwd();

/** Pastas de topo do repo — prefixo que faz um token dentro de crase ser caminho, não prosa. */
const PREFIXOS_DE_REPO = ["src/", "scripts/", "docs/", "public/", "drizzle/", "infra/", "app/"];

/**
 * Extrai caminhos do repositório citados dentro de crases.
 *
 * Exigir a crase é o que mantém o sinal limpo: no CLAUDE.md todo caminho é escrito como
 * código, e prosa solta com barra ("entrada/saída", "web e/ou WhatsApp") fica de fora.
 */
export function caminhosCitados(markdown: string): string[] {
	const emCrase = markdown.match(/`[^`\n]+`/g) ?? [];
	const achados = new Set<string>();

	for (const bruto of emCrase) {
		let token = bruto.slice(1, -1).trim();

		if (token.includes(" ")) continue; // `pnpm sonda:variancia`, frase — não é caminho
		if (!token.includes("/")) continue; // `graph.ts`, `--aja-ink` — sem pasta, não ancora
		if (!PREFIXOS_DE_REPO.some((p) => token.startsWith(p))) continue;

		token = token.replace(/\/\*+$/, "").replace(/\/$/, ""); // `src/components/ui/*` → dir
		if (token) achados.add(token);
	}

	return [...achados].sort();
}

/** Scripts pnpm citados como `pnpm algo:coisa` — só os com ":", que são sempre custom. */
export function scriptsCitados(markdown: string): string[] {
	const achados = new Set<string>();
	for (const m of markdown.matchAll(/`pnpm ([a-z0-9-]+:[a-z0-9:-]+)`/g)) {
		achados.add(m[1]);
	}
	return [...achados].sort();
}

describe("contexto-lei: o CLAUDE.md não pode mentir", () => {
	const claudeMd = readFileSync(join(RAIZ, "CLAUDE.md"), "utf8");

	it("cita caminhos que existem de verdade", () => {
		const citados = caminhosCitados(claudeMd);
		expect(citados.length).toBeGreaterThan(0); // guarda contra extrator que parou de extrair

		const sumidos = citados.filter((c) => !existsSync(join(RAIZ, c)));
		expect(
			sumidos,
			`O CLAUDE.md aponta para caminho que não existe mais. Toda sessão lê isso e ` +
				`passa a raciocinar sobre uma arquitetura morta. Corrija a referência (não ` +
				`apague a linha): ${sumidos.join(", ")}`,
		).toEqual([]);
	});

	it("cita scripts pnpm que existem no package.json", () => {
		const pkg = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8"));
		const disponiveis = Object.keys(pkg.scripts ?? {});

		const sumidos = scriptsCitados(claudeMd).filter((s) => !disponiveis.includes(s));
		expect(
			sumidos,
			`O CLAUDE.md manda rodar script que não existe no package.json: ${sumidos.join(", ")}`,
		).toEqual([]);
	});

	it("mantém verdadeira a âncora do funil (nextGate é a fonte da ordem)", () => {
		// O CLAUDE.md crava: "Ordem do funil | nextGate em src/lib/agent/qualify-state.ts —
		// o código é a fonte". Se nextGate for renomeado ou movido, essa linha vira mentira
		// sobre a peça mais central do produto.
		const alvo = join(RAIZ, "src/lib/agent/qualify-state.ts");
		expect(existsSync(alvo), "src/lib/agent/qualify-state.ts sumiu").toBe(true);
		expect(
			readFileSync(alvo, "utf8"),
			"nextGate não está mais em qualify-state.ts — o CLAUDE.md aponta pra lá como fonte da ordem do funil",
		).toContain("nextGate");
	});
});

describe("contexto-lei: o extrator realmente pega o que promete", () => {
	// Sem isto, o gate acima poderia ficar verde por não estar extraindo nada.
	it("acusa caminho inexistente", () => {
		const citados = caminhosCitados("veja `src/lib/modulo-que-nunca-existiu.ts` aqui");
		expect(citados).toEqual(["src/lib/modulo-que-nunca-existiu.ts"]);
		expect(existsSync(join(RAIZ, citados[0]))).toBe(false);
	});

	it("ignora prosa com barra e token sem pasta", () => {
		expect(caminhosCitados("`entrada/saída` e `graph.ts` e `--aja-ink`")).toEqual([]);
	});

	it("normaliza glob de diretório", () => {
		expect(caminhosCitados("`src/components/ui/*`")).toEqual(["src/components/ui"]);
	});
});
