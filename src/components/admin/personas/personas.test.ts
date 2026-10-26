import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda contra UI MORTA no editor de persona.
 *
 * A tela chamava `/api/admin/personas/[id]/assist` e `/api/admin/personas/[id]/preview`
 * (e `/api/admin/personas/preview`) — nenhuma dessas rotas existe como `route.ts`. A
 * página abria, o botão aparecia e o pedido caía em 404: o defeito só era visível quando
 * alguém clicava. Medido em 25/10/2026; as telas foram removidas. O preview de verdade
 * mora em `/admin/caixa/previa`.
 *
 * Fica vermelho se alguém voltar a apontar uma tela do editor para API que não existe.
 */
const PASTA = new URL(".", import.meta.url).pathname;
const RAIZ = new URL("../../../../", import.meta.url).pathname;

function arquivos(dir: string): string[] {
	const out: string[] = [];
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		if (e.isDirectory()) out.push(...arquivos(join(dir, e.name)));
		else if (e.name.endsWith(".tsx")) out.push(join(dir, e.name));
	}
	return out;
}

/** Resolve um segmento dinâmico (`${personaId}`) pelo diretório `[id]` que existe no disco. */
function rotaExiste(url: string): boolean {
	let cur = join(RAIZ, "src/app/api");
	for (const p of url
		.replace(/^\/api\//, "")
		.split("/")
		.filter(Boolean)) {
		if (p.startsWith("$")) {
			const dinamicos = readdirSync(cur, { withFileTypes: true }).filter(
				(e) => e.isDirectory() && e.name.startsWith("["),
			);
			if (dinamicos.length === 0) return false;
			cur = join(cur, dinamicos[0].name);
			continue;
		}
		cur = join(cur, p);
	}
	return existsSync(join(cur, "route.ts"));
}

describe("editor de persona — nenhuma tela aponta para API que não existe", () => {
	it("todo fetch do editor tem rota no disco", () => {
		const offendentes: string[] = [];
		for (const arquivo of arquivos(PASTA)) {
			const fonte = readFileSync(arquivo, "utf8");
			for (const m of fonte.matchAll(/(?:fetch|api)\s*[(:]\s*["'`](\/api\/[^"'`]*)["'`]/g)) {
				if (!rotaExiste(m[1])) offendentes.push(`${arquivo.replace(RAIZ, "")} → ${m[1]}`);
			}
		}
		expect(offendentes).toEqual([]);
	});

	it("o editor não renderiza mais o assistente nem o preview mortos", () => {
		const fonte = readFileSync(join(PASTA, "persona-edit-shell.tsx"), "utf8");
		expect(fonte).not.toMatch(/AIAssistantSidebar|PersonaPreviewPanel/);
	});
});
