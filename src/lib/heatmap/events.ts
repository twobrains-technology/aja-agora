// src/lib/heatmap/events.ts
//
// Contrato e normalização dos eventos do mapa de calor. Módulo PURO — sem
// banco, sem framework, sem relógio próprio (o `at` vem no payload).
//
// ── A decisão que define o mapa inteiro: âncora no ELEMENTO, não no pixel ────
//
// Heatmap clássico grava a coordenada absoluta do clique e pinta a nuvem sobre
// um screenshot. Numa landing responsiva isso produz mapa mentiroso: o mesmo
// botão "Simular agora" vive em x=1180 no desktop e x=195 no celular, então a
// nuvem soma dois lugares diferentes da tela e não diz nada sobre o botão.
//
// Aqui cada evento carrega o SELETOR estável do alvo, o rótulo visível e a
// seção (`data-heat` nas 11 seções da landing). A pergunta de negócio — "qual
// CTA converte", "até onde a pessoa rola" — se responde por elemento e por
// seção, que sobrevivem à quebra de layout. As coordenadas relativas continuam
// gravadas, mas para o desenho da nuvem, não para a contagem.
//
// ── Por que tudo é recusado por allowlist ────────────────────────────────────
//
// Este endpoint é público e sem sessão: qualquer um pode dar POST nele. Então o
// que entra é o que está explicitamente permitido — tipo conhecido, seção
// conhecida, coordenada dentro de 0..1, viewport plausível. Blocklist aqui
// viraria tabela de lixo com cardinalidade infinita.

/**
 * Seções de cada landing, NA ORDEM em que o visitante as encontra.
 *
 * Por página e não uma lista só porque as verticais não são cópias da home: elas
 * montam `hero-vertical`/`faixa-numeros` no lugar de `kv-hero`/`kv-journey`, e
 * `/imoveis` e `/motos` sequer têm o `bloco-upgrade` que `/autos` tem. Um funil
 * de scroll único mostraria degrau zerado que na verdade não existe naquela
 * página — e degrau zerado é justamente o achado que a tela quer destacar.
 *
 * As chaves têm que ser exatamente `LANDINGS` de `src/proxy.ts` (fora do matcher
 * do proxy não há visita gravada, e o mapa ficaria sem origem). Quem mantém os
 * dois de acordo é `events.landings.test.ts` — esquecer um não quebra nada na
 * tela, então o teste é o único aviso.
 */
export const SECOES_POR_LANDING = {
	"/": [
		"kv-menu",
		"kv-hero",
		"kv-journey",
		"kv-tipos",
		"kv-contemplacao",
		"kv-faq",
		"kv-numbers",
		"kv-depoimentos",
		"kv-confianca",
		"kv-comparacao",
		"kv-footer",
	],
	// As três verticais compartilham o esqueleto e trocam o terceiro bloco — é o
	// argumento próprio de cada uma (troca do carro, FGTS no imóvel, moto de
	// trabalho). Nome distinto por bloco, e não um "bloco-tema" genérico, porque
	// no painel eles não são comparáveis entre si: são conteúdos diferentes.
	"/autos": ["kv-menu", "hero-vertical", "faixa-numeros", "bloco-upgrade", "kv-faq", "kv-footer"],
	"/imoveis": ["kv-menu", "hero-vertical", "faixa-numeros", "bloco-formas", "kv-faq", "kv-footer"],
	"/motos": ["kv-menu", "hero-vertical", "faixa-numeros", "bloco-passos", "kv-faq", "kv-footer"],
} as const satisfies Record<string, readonly string[]>;

export type PathLanding = keyof typeof SECOES_POR_LANDING;
export type SecaoLanding = (typeof SECOES_POR_LANDING)[PathLanding][number];

export const LANDINGS_COM_MAPA = Object.keys(SECOES_POR_LANDING) as PathLanding[];

export function ehPathDeLanding(valor: string): valor is PathLanding {
	return Object.hasOwn(SECOES_POR_LANDING, valor);
}

/** Seções da página, na ordem. Página desconhecida devolve lista vazia. */
export function secoesDe(path: string): readonly string[] {
	return ehPathDeLanding(path) ? SECOES_POR_LANDING[path] : [];
}

/**
 * Marca que a landing está sendo carregada só para ser OLHADA (o preview dentro
 * do painel), não visitada — o proxy vê este parâmetro e não grava a visita.
 *
 * Mora aqui, no módulo puro, e não em `src/proxy.ts`: importar o proxy de um
 * componente cliente arrasta `require-role` → `auth` → `db` → `pg` e o browser
 * tenta resolver `dns`/`fs`/`net`/`tls`. Custou uma tela em branco em
 * 18/08/2026, e o typecheck e o lint passaram os dois verdes.
 */
export const PARAM_PREVIEW = "heatmap-preview";

export const TIPOS_EVENTO = ["click", "rage_click", "section_view", "scroll_depth"] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

export type Device = "mobile" | "tablet" | "desktop";

/** Teto de eventos por POST. Lote maior que isto é script, não visitante. */
export const MAX_EVENTS_POR_LOTE = 60;

/** Tamanho do rótulo. Passou disso não é rótulo de alvo, é parágrafo. */
const MAX_LABEL = 80;

/** Quebras do Tailwind — as mesmas que a landing usa pra trocar de layout. */
const QUEBRA_TABLET = 768;
const QUEBRA_DESKTOP = 1024;

/** Viewport plausível. Fora disso é payload forjado ou bot com janela absurda. */
const VIEWPORT_MIN = 200;
const VIEWPORT_MAX = 8000;

/** Janela e contagem que caracterizam clique de raiva. Convenção de mercado. */
const RAGE_JANELA_MS = 1_000;
const RAGE_MINIMO = 3;

export interface HeatmapEvent {
	type: TipoEvento;
	path: string;
	section: SecaoLanding | null;
	selector: string | null;
	label: string;
	relX: number | null;
	relY: number | null;
	pageRelX: number | null;
	pageY: number | null;
	scrollPct: number | null;
	viewportWidth: number;
	viewportHeight: number;
	device: Device;
	at: number;
}

export function classifyDevice(viewportWidth: number): Device {
	if (viewportWidth < QUEBRA_TABLET) return "mobile";
	if (viewportWidth < QUEBRA_DESKTOP) return "tablet";
	return "desktop";
}

// Dado pessoal que o `textContent` do alvo poderia carregar se o clique cair
// num campo já preenchido. CPF, e-mail e telefone não entram numa tabela de
// analytics — o funil de verdade já tem esses dados, com consentimento, em
// `contacts`. Aqui seria cópia sem propósito e passivo de LGPD de graça.
const PADROES_PII: RegExp[] = [
	/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, // CPF, com ou sem máscara
	/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, // e-mail
	/\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g, // telefone BR
];

export function sanitizeLabel(bruto: string | null | undefined): string {
	if (!bruto) return "";

	let texto = bruto;
	for (const padrao of PADROES_PII) texto = texto.replace(padrao, "");

	// Colapsa quebra de linha e espaço repetido: o mesmo rótulo não pode virar
	// duas chaves diferentes no agrupamento só por causa da indentação do JSX.
	return texto.replace(/\s+/g, " ").trim().slice(0, MAX_LABEL);
}

function numeroRelativo(valor: unknown): number | null {
	if (typeof valor !== "number" || !Number.isFinite(valor)) return null;
	return valor >= 0 && valor <= 1 ? valor : null;
}

/**
 * Normaliza o path e o confere contra a allowlist de landings.
 *
 * A query sai porque a UTM já vive em `visits` — mantê-la aqui multiplicaria a
 * mesma página em milhares de chaves distintas e o agrupamento por página
 * deixaria de fechar. E só landing entra: sendo o endpoint público, path livre
 * viraria coluna de texto arbitrário vindo da internet.
 */
function normalizePath(valor: unknown): PathLanding | null {
	if (typeof valor !== "string" || !valor.startsWith("/")) return null;

	const semQuery = valor.split(/[?#]/)[0];
	// Barra final some ("/autos/" e "/autos" são a mesma página), menos na raiz.
	const limpo = semQuery.length > 1 ? semQuery.replace(/\/+$/, "") : "/";

	return ehPathDeLanding(limpo) ? limpo : null;
}

/**
 * Valida um evento cru do coletor. Devolve `null` pra qualquer coisa fora do
 * contrato — o chamador descarta em silêncio, porque evento perdido é evento
 * perdido, e derrubar o lote inteiro por causa de um torto seria pior.
 */
export function normalizeEvent(bruto: unknown): HeatmapEvent | null {
	if (!bruto || typeof bruto !== "object") return null;
	const cru = bruto as Record<string, unknown>;

	const type = cru.type;
	if (typeof type !== "string" || !(TIPOS_EVENTO as readonly string[]).includes(type)) return null;

	const path = normalizePath(cru.path);
	if (path === null) return null;

	const viewportWidth = cru.viewportWidth;
	const viewportHeight = cru.viewportHeight;
	if (
		typeof viewportWidth !== "number" ||
		typeof viewportHeight !== "number" ||
		!Number.isFinite(viewportWidth) ||
		!Number.isFinite(viewportHeight) ||
		viewportWidth < VIEWPORT_MIN ||
		viewportWidth > VIEWPORT_MAX ||
		viewportHeight < VIEWPORT_MIN ||
		viewportHeight > VIEWPORT_MAX
	) {
		return null;
	}

	// Seção é opcional (scroll_depth não tem), mas quando vem precisa ser uma das
	// seções DAQUELA página — allowlist, senão a coluna vira texto livre vindo da
	// internet, e `kv-journey` apareceria num funil de `/motos`, onde não existe.
	let section: SecaoLanding | null = null;
	if (cru.section !== undefined && cru.section !== null) {
		if (typeof cru.section !== "string" || !secoesDe(path).includes(cru.section)) return null;
		section = cru.section as SecaoLanding;
	}
	if (type === "section_view" && section === null) return null;

	let scrollPct: number | null = null;
	if (type === "scroll_depth") {
		const pct = cru.scrollPct;
		if (typeof pct !== "number" || !Number.isInteger(pct) || pct < 0 || pct > 100) return null;
		scrollPct = pct;
	}

	// Clique precisa de coordenada; os demais tipos não. Quando a coordenada vem,
	// tem que ser relativa — pixel absoluto não é comparável entre telas.
	let relX: number | null = null;
	let relY: number | null = null;
	let pageRelX: number | null = null;
	if (type === "click" || type === "rage_click") {
		relX = numeroRelativo(cru.relX);
		relY = numeroRelativo(cru.relY);
		pageRelX = numeroRelativo(cru.pageRelX);
		if (relX === null || relY === null || pageRelX === null) return null;
	}

	const pageYBruto = cru.pageY;
	const pageY =
		typeof pageYBruto === "number" && Number.isFinite(pageYBruto) && pageYBruto >= 0
			? Math.round(pageYBruto)
			: null;

	const seletorBruto = cru.selector;
	const selector =
		typeof seletorBruto === "string" && seletorBruto.length > 0 ? seletorBruto.slice(0, 200) : null;

	const at = typeof cru.at === "number" && Number.isFinite(cru.at) ? cru.at : 0;

	return {
		type: type as TipoEvento,
		path,
		section,
		selector,
		label: sanitizeLabel(typeof cru.label === "string" ? cru.label : null),
		relX,
		relY,
		pageRelX,
		pageY,
		scrollPct,
		viewportWidth: Math.round(viewportWidth),
		viewportHeight: Math.round(viewportHeight),
		device: classifyDevice(viewportWidth),
		at,
	};
}

/** Normaliza o lote inteiro, descartando os tortos e cortando no teto. */
export function normalizeLote(bruto: unknown): HeatmapEvent[] {
	if (!Array.isArray(bruto)) return [];

	const validos: HeatmapEvent[] = [];
	for (const cru of bruto.slice(0, MAX_EVENTS_POR_LOTE)) {
		const evento = normalizeEvent(cru);
		if (evento) validos.push(evento);
	}
	return validos;
}

/**
 * Promove a N-ésima batida seguida no mesmo alvo a `rage_click`.
 *
 * Clique de raiva é o sinal mais barato de "isto parece clicável e não é" ou
 * "cliquei e nada aconteceu" — vale mais que a nuvem de calor inteira, porque
 * aponta defeito, não preferência. Só as batidas a partir da terceira viram
 * `rage_click`: as duas primeiras continuam cliques legítimos, e rebaixá-las
 * sumiria com o clique de verdade da contagem do CTA.
 */
export function marcarRageClicks(eventos: HeatmapEvent[]): HeatmapEvent[] {
	let alvoCorrente: string | null = null;
	let inicioSequencia = 0;
	let seguidos = 0;

	return eventos.map((evento) => {
		if (evento.type !== "click") {
			alvoCorrente = null;
			seguidos = 0;
			return evento;
		}

		const alvo = evento.selector ?? evento.label;
		const dentroDaJanela = evento.at - inicioSequencia <= RAGE_JANELA_MS;

		if (alvo === alvoCorrente && dentroDaJanela) {
			seguidos += 1;
		} else {
			alvoCorrente = alvo;
			inicioSequencia = evento.at;
			seguidos = 1;
		}

		return seguidos >= RAGE_MINIMO ? { ...evento, type: "rage_click" as const } : evento;
	});
}
