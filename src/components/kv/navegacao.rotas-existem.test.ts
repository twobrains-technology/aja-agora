// Todo link do site público leva a algum lugar que existe.
//
// É o mesmo defeito que o OC-33 registrou no admin — menu apontando para tela
// que nunca foi construída, quatro meses no ar — só que aqui ele apareceu de
// duas formas ao mesmo tempo, e foi o cliente quem viu antes de nós:
//
//   1. `href="#"` no rodapé. Cinco links que não faziam NADA ao clique. O
//      "#" sozinho é âncora para lugar nenhum: o navegador só põe o "#" na
//      URL e a página fica parada.
//   2. As landings de vertical (`/autos`, `/imoveis`, `/motos`) prontas e
//      órfãs — nada no site apontava para elas. O comentário no `sitemap.ts`
//      até dizia isso em voz alta, e mesmo assim ficou.
//
// O teste lê os DADOS de navegação (não regex sobre JSX) e cobra destino real
// de cada href: rota tem que ter `page.tsx` no disco, âncora tem que ter `id`
// na página onde o menu renderiza. Como `navegacao.ts` é a fonte única que o
// menu e o rodapé consomem, cobrir esses arrays cobre os links do site.
//
// Vale a mesma lição do OC-33: lá existia um teste que passava validando a
// ALLOWLIST em vez da EXISTÊNCIA da página. Este aqui lê o disco.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
	type LinkKv,
	linksDoMenu,
	NAV,
	NAV_VERTICAL,
	RODAPE_CONSORCIOS,
	RODAPE_NAVEGACAO,
} from "./navegacao";

const APP = join(import.meta.dirname, "..", "..", "app");
const KV = import.meta.dirname;

/**
 * Toda rota que o App Router de fato serve → arquivo que a serve.
 *
 * Um diretório vira segmento de URL, EXCETO os route groups — os entre
 * parênteses, que existem só para agrupar layout e não aparecem no caminho.
 * `app/(verticais)/autos/page.tsx` serve `/autos`; por isso comparar caminho
 * de arquivo com href, ingenuamente, não funciona.
 */
function rotasQueExistem(dir: string, prefixo = ""): Map<string, string> {
	const rotas = new Map<string, string>();
	if (!existsSync(dir)) return rotas;

	for (const entrada of readdirSync(dir, { withFileTypes: true })) {
		if (entrada.isFile() && entrada.name === "page.tsx") {
			rotas.set(prefixo === "" ? "/" : prefixo, join(dir, entrada.name));
			continue;
		}
		if (!entrada.isDirectory()) continue;
		// Rota dinâmica ([id]) e privada (_pasta) ficam fora: a primeira não casa
		// com href fixo, a segunda não é rota.
		if (entrada.name.startsWith("_") || entrada.name.startsWith("[")) continue;

		const ehGrupo = entrada.name.startsWith("(");
		const novoPrefixo = ehGrupo ? prefixo : `${prefixo}/${entrada.name}`;
		for (const [rota, arquivo] of rotasQueExistem(join(dir, entrada.name), novoPrefixo)) {
			rotas.set(rota, arquivo);
		}
	}
	return rotas;
}

const ROTAS = rotasQueExistem(APP);

/** Os `id` que a página declara — o destino possível de uma âncora `#`. */
function ancorasDaPagina(rota: string): Set<string> {
	const arquivo = ROTAS.get(rota);
	if (!arquivo) return new Set();
	const fonte = readFileSync(arquivo, "utf8");
	return new Set([...fonte.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
}

/**
 * Os grupos de link, com as páginas onde cada um aparece na tela.
 *
 * A distinção importa porque âncora relativa (`#faq`) resolve na página ATUAL:
 * o menu da home pode apontar para `#confianca` porque a seção está ali, e o
 * menu das verticais NÃO pode — é justamente por isso que `NAV_VERTICAL`
 * reescreve as seções que só existem na home como `/#...`. O rodapé aparece
 * nas quatro páginas, então tudo nele tem que valer nas quatro.
 */
const VERTICAIS_ROTAS = ["/autos", "/imoveis", "/motos"];
const GRUPOS: { nome: string; links: LinkKv[]; renderizaEm: string[] }[] = [
	// `linksDoMenu` achata o submenu: o que interessa aqui é todo destino que o
	// menu oferece, esteja ele na barra ou uma camada abaixo.
	{ nome: "NAV (menu da home)", links: linksDoMenu(NAV), renderizaEm: ["/"] },
	{
		nome: "NAV_VERTICAL (menu das verticais)",
		links: linksDoMenu(NAV_VERTICAL),
		renderizaEm: VERTICAIS_ROTAS,
	},
	{
		nome: "RODAPE_NAVEGACAO",
		links: RODAPE_NAVEGACAO,
		renderizaEm: ["/", ...VERTICAIS_ROTAS],
	},
	{
		nome: "RODAPE_CONSORCIOS",
		links: RODAPE_CONSORCIOS,
		renderizaEm: ["/", ...VERTICAIS_ROTAS],
	},
];

const TODOS = GRUPOS.flatMap((g) => g.links.map((link) => ({ ...link, grupo: g.nome })));

describe("navegação — o teste enxerga os links (senão passaria por vacuidade)", () => {
	it("achou as rotas do App Router", () => {
		expect(ROTAS.has("/")).toBe(true);
		expect(ROTAS.has("/autos")).toBe(true);
	});

	it("achou links em todos os grupos", () => {
		for (const grupo of GRUPOS) {
			expect(grupo.links.length, `${grupo.nome} está vazio`).toBeGreaterThan(0);
		}
	});
});

describe('nenhum link é "#" — o defeito que o cliente reportou', () => {
	it.each(TODOS)("$grupo → $label não é link morto", ({ href, label }) => {
		expect(href, `"${label}" aponta para "#", que não leva a lugar nenhum`).not.toBe("#");
		expect(href.trim(), `"${label}" tem href vazio`).not.toBe("");
	});
});

describe("todo link aponta para rota que existe ou âncora que existe", () => {
	for (const grupo of GRUPOS) {
		for (const link of grupo.links) {
			// Link externo e protocolo (mailto:, tel:) saem: o destino deles não
			// está neste repositório e o teste não tem como conferir.
			if (/^(https?:|mailto:|tel:)/.test(link.href)) continue;

			const [caminho, ancora] = link.href.split("#");

			if (caminho !== "") {
				it(`${grupo.nome} → ${link.label} (${link.href}): a rota existe`, () => {
					expect(
						ROTAS.has(caminho),
						`${link.href} está na navegação mas não existe página para ${caminho}`,
					).toBe(true);
				});
			}

			if (ancora) {
				// Âncora sem caminho ("#faq") resolve na página onde o menu está;
				// com caminho ("/#faq" ou "/autos#faq") resolve na página de destino.
				const paginas = caminho === "" ? grupo.renderizaEm : [caminho];
				for (const pagina of paginas) {
					it(`${grupo.nome} → ${link.label} (${link.href}): #${ancora} existe em ${pagina}`, () => {
						expect(
							ancorasDaPagina(pagina).has(ancora),
							`${link.href} rola para #${ancora}, mas ${pagina} não declara esse id`,
						).toBe(true);
					});
				}
			}
		}
	}
});

describe('nenhum href="#" solto no JSX das seções', () => {
	// Os arrays acima são a fonte única, mas nada impede alguém de escrever um
	// href direto no JSX de uma seção. Esta varredura fecha essa porta.
	//
	// As redes sociais do rodapé ficam de fora POR CONSTRUÇÃO, não por exceção
	// no teste: elas declaram `REDE_SOCIAL_PENDENTE`, uma constante nomeada, em
	// vez do literal — as URLs ainda não vieram do operador (FIX-353). Quando
	// chegarem, o literal some junto com a constante.
	const arquivos = readdirSync(KV, { recursive: true, withFileTypes: true })
		.filter((e) => e.isFile() && e.name.endsWith(".tsx") && !e.name.includes(".test."))
		.map((e) => join(e.parentPath, e.name));

	it("achou os componentes do KV", () => {
		expect(arquivos.length).toBeGreaterThan(5);
	});

	it.each(arquivos)("%s", (arquivo) => {
		const fonte = readFileSync(arquivo, "utf8");
		expect(fonte, 'href="#" é link morto').not.toContain('href="#"');
	});
});
