/**
 * Os textos que o PRÓPRIO PRODUTO escreve na boca do cliente.
 *
 * Este arquivo existe para uma coisa só: ser o lugar onde a frase que o CTA
 * injeta no chat (chip da landing, semente de campanha, botão de categoria,
 * link `wa.me`) é definida **uma vez**. Enquanto essas frases moravam dentro
 * dos componentes, a medição do funil não tinha como perguntar "essa mensagem
 * foi digitada ou foi o produto que escreveu?" sem duplicar string — e string
 * duplicada é string que diverge no primeiro ajuste de copy.
 *
 * **Isto NÃO é guard sobre fala humana.** É comparação com texto gerado pelo
 * código deste repositório; o `CLAUDE.md` proíbe regex sobre o que o cliente
 * escreve, não a leitura do que o produto injeta. Quem consome mora em
 * `mensagem-pre-preenchida.ts`.
 *
 * É puro de propósito (nenhum import de React): ele é lido por componente
 * cliente (a landing) e por query de servidor (`performance-queries`,
 * `percurso-queries`), e um módulo que puxa React não atravessa essa fronteira
 * sem levar bundle junto.
 */

import type { Category } from "@/lib/agent/personas";
import { WELCOME_OPTIONS } from "@/lib/chat/welcome-options";

/** O bem da conversa — a MESMA chave técnica que o funil já usa. */
export type Bem = Category;

/**
 * O chip do hero (`kv-hero.tsx`), o card de tipo (`kv-tipos.tsx`) e o
 * `sementeVazia` da vertical (`hero-vertical.tsx`) — os três abrem o teatro com
 * esta mesma frase, e é ela a primeira mensagem de 99 das 163 conversas web
 * medidas em produção (47 carro + 36 imóvel + 28 moto, diagnóstico §h).
 */
export const CHIP_DE_BEM: Record<Bem, string> = {
	imovel: "Quero comprar um imóvel.",
	auto: "Quero comprar um carro.",
	moto: "Quero comprar uma moto.",
};

/**
 * O prefixo de `semente(parcela)` — "Quero um carro. Consigo pagar ".
 *
 * Prefixo, e não frase inteira, porque o número é variável: o cliente arrasta o
 * slider e o produto monta a fala com a parcela dele. Casar por igualdade só
 * funcionaria para o texto fixo.
 */
export const SEMENTE_PARCELA_PREFIXO: Record<Bem, string> = {
	imovel: "Quero um imóvel. Consigo pagar ",
	auto: "Quero um carro. Consigo pagar ",
	moto: "Quero uma moto. Consigo pagar ",
};

/** O prefixo de `sementeDeValor(valor)` — "Quero um carro de ". */
export const SEMENTE_VALOR_PREFIXO: Record<Bem, string> = {
	imovel: "Quero um imóvel de ",
	auto: "Quero um carro de ",
	moto: "Quero uma moto de ",
};

/**
 * As sementes dos CTAs de bloco da landing — texto fixo, sem valor variável,
 * abertas como chip (`bloco-formas`, `bloco-upgrade`, `bloco-passos`).
 */
export const SEMENTE_BLOCO_FGTS = "Quero usar meu FGTS no consórcio de imóvel.";
export const SEMENTE_BLOCO_UPGRADE = "Quero trocar de carro usando consórcio.";
export const SEMENTE_BLOCO_MOTO_TRABALHO = "Quero usar consórcio para ter minha moto de trabalho.";

export const SEMENTES_DE_BLOCO = [
	SEMENTE_BLOCO_FGTS,
	SEMENTE_BLOCO_UPGRADE,
	SEMENTE_BLOCO_MOTO_TRABALHO,
] as const;

/**
 * Os rótulos curtos dos chips de ENTRADA do chat web ("Imóvel", "Automóvel",
 * "Moto") — 35 das 163 conversas web medidas em produção abriram com um deles.
 *
 * Vêm da fonte única de `welcome-options.ts` em vez de repetidos aqui: se o
 * rótulo mudar lá, o funil acompanha sozinho.
 */
export const ROTULOS_CATEGORIA_WEB: readonly string[] = WELCOME_OPTIONS.map((o) => o.label);

/**
 * O título dos botões de categoria do WhatsApp (`welcomeButtonsToWhatsApp`).
 *
 * Também é gravado como mensagem do cliente: `recordUserClick` salva o
 * `replyTitle` do botão (`interactive-handlers.ts`). O WhatsApp encurta "auto"
 * para **"Carro"**, e não "Automóvel" como no web — por isso os dois
 * dicionários.
 *
 * Mora aqui em vez de importado do formatter porque `formatter.ts` não declara
 * constante para ele (o literal está colado no objeto do botão) e está fora do
 * escopo desta frente — a válvula registra que ele deve passar a importar daqui.
 */
export const TITULO_CATEGORIA_WHATSAPP: Record<Bem, string> = {
	imovel: "Imóvel",
	auto: "Carro",
	moto: "Moto",
};

/**
 * A fala que já vai escrita no `wa.me` do botão flutuante
 * (`chat-flutuante.tsx`), que a pessoa só aperta enviar.
 *
 * 11 das 13 conversas de WhatsApp medidas em produção começaram com esta frase.
 */
export const PRIMEIRA_FALA_WHATSAPP = "Oi! Quero comparar consórcios.";
