/**
 * Os links do site público, em um lugar só.
 *
 * Existe porque o menu e o rodapé falavam das MESMAS coisas com dados próprios,
 * e por isso discordavam: cinco links do rodapé eram `href="#"`, e as três
 * landings de vertical (`/autos`, `/imoveis`, `/motos`) estavam prontas e sem
 * ninguém apontando para elas. `kv-menu.tsx` já tinha aprendido metade da lição
 * — derivava o menu das verticais do menu da home em vez de copiar, depois de
 * as duas divergirem. Isto termina o serviço para o rodapé.
 *
 * Os cards de tipo da home NÃO consomem daqui de propósito: eles não navegam,
 * abrem o chat com o seed do tipo (`kv-tipos.tsx`).
 *
 * `navegacao.rotas-existem.test.ts` cobra destino real de cada href daqui.
 */

import { Car, House, type LucideIcon, Motorbike } from "lucide-react";

export type LinkKv = { label: string; href: string; icone?: LucideIcon };

/**
 * As landings por tipo de bem. São páginas de verdade (`/autos`, `/imoveis`,
 * `/motos`), com hero, números e FAQ próprios — nasceram como destino de
 * campanha e ficaram órfãs, sem nada no site apontando para elas. O menu e o
 * rodapé são as duas portas.
 *
 * O ícone mora aqui, e não num mapa `href → ícone` dentro do menu, porque um
 * segundo lugar descrevendo as mesmas três verticais é exatamente a divergência
 * que este arquivo veio resolver: renomear um href lá em cima faria o ícone
 * sumir calado. É `lucide` e não os pictogramas de `components/icons`
 * (`Carrinho`, `Casinha`, `Motinha`): aqueles são desenhos cheios, feitos para a
 * grade grande de contemplações, e a 20px ao lado de um rótulo pesariam mais que
 * o próprio texto.
 */
export const VERTICAIS: LinkKv[] = [
	{ label: "Carro", href: "/autos", icone: Car },
	{ label: "Imóvel", href: "/imoveis", icone: House },
	{ label: "Moto", href: "/motos", icone: Motorbike },
];

/**
 * Um item da barra de menu: ou leva a algum lugar (`href`), ou desdobra em
 * outros que levam (`submenu`). Nunca os dois — um item que navega E abre
 * obriga a pessoa a adivinhar o que o clique vai fazer.
 */
export type ItemDeMenu =
	| (LinkKv & { submenu?: never })
	| { label: string; href?: never; submenu: LinkKv[] };

/**
 * O menu da home. As âncoras são seções desta página.
 *
 * "Seu Objetivo" é quem desdobra nas verticais (decisão do Kairo, 19/08/2026).
 * Antes eram dois itens para a mesma pergunta: este rolava até o hero e um
 * "Tipo de Consórcio" ao lado abria carro/imóvel/moto. Escolher o bem É o
 * objetivo de quem chega — o segundo item repetia a pergunta com outro nome e
 * gastava espaço da barra.
 *
 * O `#hero` não fica órfão: o logo volta ao início (`kv-menu.logo-volta-para-o-
 * inicio.test.tsx`) e o rodapé mantém "Encontre o consórcio certo".
 */
export const NAV: ItemDeMenu[] = [
	{ label: "Seu Objetivo", submenu: VERTICAIS },
	{ label: "Como funcionamos", href: "#como-funciona" },
	{ label: "Quem somos", href: "#confianca" },
	{ label: "Dúvidas", href: "#faq" },
];

/** Seções que existem só na home — nas verticais viram link para lá. */
const SO_NA_HOME = new Set(["#como-funciona", "#confianca"]);

/**
 * O menu das landings de vertical: os MESMOS itens da home.
 *
 * Sai de `NAV` por construção, e não copiado, para que renomear um item na home
 * não deixe as três verticais para trás — foi assim que elas acabaram com
 * "Quais motos" e "Moto como renda", um menu diferente por página.
 *
 * `#hero` e `#faq` continuam âncoras locais porque as duas seções existem em
 * toda vertical. "Como funcionamos" e "Quem somos" não existem fora da home,
 * então apontam para lá: mesmo rótulo, clique vivo.
 */
export const NAV_VERTICAL: ItemDeMenu[] = NAV.map((item) =>
	item.href && SO_NA_HOME.has(item.href) ? { ...item, href: `/${item.href}` } : item,
);

/** Todo link alcançável por um menu, submenu incluído. */
export function linksDoMenu(itens: ItemDeMenu[]): LinkKv[] {
	return itens.flatMap((item) => (item.submenu ? item.submenu : [item]));
}

/**
 * Coluna "Navegação" do rodapé.
 *
 * Caminho absoluto (`/#...`) e não âncora solta (`#...`): o rodapé aparece nas
 * quatro landings, e âncora relativa resolve na página atual — de `/motos`, um
 * `#como-funciona` não acharia nada, porque a seção só existe na home.
 */
export const RODAPE_NAVEGACAO: LinkKv[] = [
	{ label: "Encontre o consórcio certo", href: "/#hero" },
	{ label: "Como funcionamos", href: "/#como-funciona" },
	{ label: "Tipo de Consórcio", href: "/#tipos" },
];

/** Coluna "Consórcios" do rodapé — as mesmas três verticais dos cards. */
export const RODAPE_CONSORCIOS: LinkKv[] = VERTICAIS;
