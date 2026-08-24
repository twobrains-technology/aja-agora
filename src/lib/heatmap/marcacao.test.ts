// A marcação `data-heat` das páginas TEM que bater com `SECOES_POR_LANDING`.
//
// O servidor recusa seção fora da allowlist (`normalizeEvent`), e recusa em
// silêncio — é o comportamento certo para um endpoint público, mas significa que
// um `data-heat` com nome errado não gera erro em lugar nenhum: a seção
// simplesmente nunca aparece no painel, e o funil mostra "0 visitantes" como se
// ninguém tivesse chegado lá.
//
// Ler o JSX cru é feio, e é de propósito: qualquer alternativa (renderizar a
// página) exigiria montar TheaterProvider, fontes e o chat inteiro, e a coisa
// que precisa ser verificada é textual.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LANDINGS_COM_MAPA, SECOES_POR_LANDING } from "./events";

const RAIZ = join(__dirname, "../../..");

/**
 * Onde mora o JSX de cada landing.
 *
 * A home saiu de `src/app/page.tsx` em 21/08/2026 (`d845b10e`), quando o teste
 * A/B de hero moveu a página inteira para `landing-kv.tsx` — um componente
 * servido por `/` e por `/direto`. O `page.tsx` virou uma casca de três linhas,
 * e este teste passou a ler a casca: nenhuma marcação, nenhum coletor. Ele
 * ficou VERMELHO desde então, o que é melhor do que verde, mas ninguém o viu, e
 * enquanto isso o único guarda das seções da página mais visitada estava fora do
 * ar.
 */
function arquivoDa(path: string): string {
	return path === "/"
		? join(RAIZ, "src/components/kv/landing-kv.tsx")
		: join(RAIZ, `src/app/(verticais)${path}/page.tsx`);
}

/** As cascas que servem a home — cada uma escolhe o path que o mapa grava. */
const CASCAS_DA_HOME = ["src/app/page.tsx", "src/app/direto/page.tsx"];

function marcacoesDe(path: string): string[] {
	const fonte = readFileSync(arquivoDa(path), "utf8");
	return Array.from(fonte.matchAll(/data-heat="([^"]+)"/g), (m) => m[1]);
}

describe.each(LANDINGS_COM_MAPA)("marcação de %s", (path) => {
	const esperadas = SECOES_POR_LANDING[path];

	it("marca no JSX exatamente as seções declaradas, e na mesma ordem", () => {
		// Ordem importa: é ela que o funil de scroll usa para calcular a queda de
		// um degrau para o outro.
		expect(marcacoesDe(path)).toEqual([...esperadas]);
	});

	it("monta o coletor apontando para a própria página", () => {
		const fonte = readFileSync(arquivoDa(path), "utf8");

		// A home recebe o path por prop, porque a mesma árvore serve `/` e
		// `/direto`; as verticais o escrevem literal.
		const esperado =
			path === "/" ? "<HeatmapTracker path={heatPath} />" : `<HeatmapTracker path="${path}" />`;

		expect(fonte).toContain(esperado);
	});
});

/**
 * As duas rotas que servem a home TÊM que gravar como `/`.
 *
 * `SECOES_POR_LANDING` é indexada por path: uma casca que passasse
 * `heatPath="/direto"` faria o servidor recusar toda seção em silêncio, e o
 * mapa da variante em teste ficaria vazio sem ninguém saber por quê. É o mesmo
 * modo de falha que este arquivo existe para pegar, um nível acima.
 */
describe("as cascas da home", () => {
	it("gravam todas como / — o path que o visitante vê na barra de endereços", () => {
		for (const casca of CASCAS_DA_HOME) {
			const fonte = readFileSync(join(RAIZ, casca), "utf8");
			const heatPath = fonte.match(/heatPath="([^"]+)"/)?.[1];

			// Sem a prop vale o default de `LandingKv`, que é `/`.
			expect(heatPath ?? "/", `${casca} grava no path errado`).toBe("/");
		}
	});
});
