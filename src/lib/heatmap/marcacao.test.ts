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

/** Onde mora o arquivo de cada landing. */
function arquivoDa(path: string): string {
	return path === "/"
		? join(RAIZ, "src/app/page.tsx")
		: join(RAIZ, `src/app/(verticais)${path}/page.tsx`);
}

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

		expect(fonte).toContain(`<HeatmapTracker path="${path}" />`);
	});
});
