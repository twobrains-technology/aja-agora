// Nenhum componente do navegador pode importar `@/proxy`.
//
// O proxy puxa `require-role` → `auth` → `db` → `pg`, e o bundler do cliente
// tenta então resolver `dns`, `fs`, `net` e `tls`. O resultado é tela BRANCA.
//
// O que torna este teste necessário é o modo de falha: em 18/08/2026 o import
// entrou por engano no visor do mapa de calor e `pnpm typecheck` e `pnpm lint`
// passaram os DOIS verdes — o erro só aparece quando o navegador tenta montar a
// página. Sem esta rede, o próximo a repetir só descobre em produção.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "../../..");

/** Módulos que só existem no servidor e não podem cruzar para o navegador. */
const PROIBIDOS = ["@/proxy", "@/lib/auth", "@/db", "@/lib/heatmap/store", "@/lib/heatmap/queries"];

function arquivosDe(dir: string): string[] {
	const achados: string[] = [];
	for (const nome of readdirSync(dir)) {
		const caminho = join(dir, nome);
		if (statSync(caminho).isDirectory()) {
			achados.push(...arquivosDe(caminho));
		} else if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome)) {
			achados.push(caminho);
		}
	}
	return achados;
}

/** Um arquivo "do navegador" é o que declara `"use client"` na primeira linha. */
function ehDoNavegador(caminho: string): boolean {
	const fonte = readFileSync(caminho, "utf8");
	return /^["']use client["']/.test(fonte.trimStart());
}

describe("bundle do cliente", () => {
	const doNavegador = [
		...arquivosDe(join(RAIZ, "src/components")),
		...arquivosDe(join(RAIZ, "src/app")),
	].filter(ehDoNavegador);

	it("encontra os componentes de cliente do projeto", () => {
		// Guarda contra o teste virar no-op se a estrutura de pastas mudar.
		expect(doNavegador.length).toBeGreaterThan(10);
	});

	it.each(PROIBIDOS)("nenhum componente de cliente importa %s", (modulo) => {
		// `import type` não conta: o compilador apaga a linha e nada é arrastado
		// para o bundle. Só o import de VALOR quebra.
		const alvo = modulo.replaceAll("/", "\\/");
		const padrao = new RegExp(`^import\\s+(?!type\\s)[^;]*?from\\s+["']${alvo}["']`, "m");

		const infratores = doNavegador
			.filter((f) => padrao.test(readFileSync(f, "utf8")))
			.map((f) => f.replace(`${RAIZ}/`, ""));

		expect(infratores, `importam ${modulo} e quebram o bundle`).toEqual([]);
	});
});
