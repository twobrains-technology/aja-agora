// OC-33 — "Menu 'Perfil' do painel admin cai em 404".
//
// A barra lateral nasceu em 2026-04-14 com dois itens apontando para telas que
// eram placeholders e nunca foram construídas (`/admin/profile`,
// `/admin/settings`). Ficaram QUATRO MESES no ar: quem clicava era cuspido do
// shell administrativo para o 404 do site PÚBLICO — com menu de marketing e CTA
// "Falar com a AJA". Para a `mesa_externa`, que é gente de fora da empresa,
// especialmente ruim.
//
// O agravante que o incidente registra: `/admin/profile` chegou a entrar na
// allowlist de `role-scope.ts` como se fosse rota real, e existe um teste
// afirmando que a mesa "entra no próprio perfil" — ele passava, porque validava
// a ALLOWLIST, não a EXISTÊNCIA da página. Foi assim que o defeito atravessou a
// revisão.
//
// Este teste fecha essa porta lendo o disco: para cada `href` da barra lateral,
// tem que existir o `page.tsx` correspondente em `src/app`. Não depende de
// ninguém lembrar de conferir.

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = join(import.meta.dirname, "..", "..", "app");

/** Os `href` que a barra lateral declara, lidos do próprio componente — assim o
 * teste acompanha o menu sem precisar ser atualizado junto. */
function hrefsDaSidebar(): string[] {
	const fonte = readdirSync(import.meta.dirname).includes("app-sidebar.tsx")
		? require("node:fs").readFileSync(join(import.meta.dirname, "app-sidebar.tsx"), "utf8")
		: "";
	return [...fonte.matchAll(/href:\s*"(\/admin[^"]*)"/g)].map((m) => m[1]);
}

/**
 * Todas as rotas que o App Router de fato serve, varridas do disco.
 *
 * Um diretório vira segmento de URL, EXCETO os route groups — os entre
 * parênteses, que existem só para agrupar layout e não aparecem no caminho.
 * `app/admin/(dashboard)/pipeline/page.tsx` serve `/admin/pipeline`; por isso
 * comparar caminho de arquivo com href, ingenuamente, não funciona.
 */
function rotasQueExistem(dir: string, prefixo = ""): Set<string> {
	const rotas = new Set<string>();
	if (!existsSync(dir)) return rotas;

	for (const entrada of readdirSync(dir, { withFileTypes: true })) {
		if (entrada.isFile() && entrada.name === "page.tsx") {
			rotas.add(prefixo === "" ? "/" : prefixo);
			continue;
		}
		if (!entrada.isDirectory()) continue;
		// Rota dinâmica ([id]) e privada (_pasta) ficam fora: a primeira não casa
		// com href fixo, a segunda não é rota.
		if (entrada.name.startsWith("_") || entrada.name.startsWith("[")) continue;

		const ehGrupo = entrada.name.startsWith("(");
		const novoPrefixo = ehGrupo ? prefixo : `${prefixo}/${entrada.name}`;
		for (const r of rotasQueExistem(join(dir, entrada.name), novoPrefixo)) rotas.add(r);
	}
	return rotas;
}

const ROTAS = rotasQueExistem(RAIZ);

describe("OC-33 — todo item da barra lateral leva a uma rota que existe", () => {
	const hrefs = hrefsDaSidebar();

	it("o teste consegue ler os hrefs (senão ele passaria por vacuidade)", () => {
		expect(hrefs.length).toBeGreaterThan(5);
		expect(hrefs).toContain("/admin/pipeline");
	});

	it.each(hrefs)("%s tem página", (href) => {
		expect(ROTAS.has(href), `${href} está no menu mas não existe página para ela`).toBe(true);
	});

	it("a rota do perfil, que era o defeito do OC-33, existe", () => {
		expect(ROTAS.has("/admin/profile")).toBe(true);
	});
});
