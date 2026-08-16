// Agrupa as origens por CANAL — a leitura que o painel devia ter de cima.
//
// A tabela mostrava uma linha por campanha, e o nome de cada uma era o rótulo
// cru do que a Meta manda: `ig · 120250956902860104 · 120250989573330104`. Quinze
// linhas dessas, todas zeradas menos a primeira, e o operador não conseguia
// responder a pergunta mais simples do painel — "quanto o Instagram trouxe?".
//
// Agrupar resolve as duas coisas de uma vez: o canal ganha nome de gente, e o ID
// da campanha deixa de disputar atenção com o número. O detalhe continua a um
// clique, porque quem compra mídia precisa dele para decidir qual criativo
// pausar.
//
// Função pura de propósito: a agregação é regra de negócio (qual canal engloba o
// quê) e merece teste sem banco.

import type { TipoOrigem } from "./origem-label";
import type { LinhaOrigem } from "./performance-types";

/** Como cada fonte de tráfego se chama para quem lê o painel.
 *
 *  O que chega no `utm_source` é o apelido que o anunciante digitou, quase
 *  sempre abreviado ("ig", "fb"). Traduzir é o mínimo: ninguém decide verba
 *  olhando para "ig". */
const NOME_DA_FONTE: Record<string, string> = {
	ig: "Instagram",
	instagram: "Instagram",
	fb: "Facebook",
	facebook: "Facebook",
	meta: "Meta",
	google: "Google",
	adwords: "Google Ads",
	youtube: "YouTube",
	tiktok: "TikTok",
	linkedin: "LinkedIn",
	whatsapp: "WhatsApp",
	email: "E-mail",
	newsletter: "Newsletter",
};

export interface GrupoDeCanal {
	/** Identidade estável da linha (chave de React e de expansão). */
	chave: string;
	/** Como aparece na tela: "Instagram", "Direto", "Referência". */
	nome: string;
	tipo: TipoOrigem;
	visitas: number;
	conversas: number;
	identificados: number;
	propostas: number;
	fechados: number;
	taxaFechamento: number;
	/** As origens que compõem o canal. Vazio quando o canal é uma linha só
	 *  (Direto), porque abrir para mostrar a si mesmo é ruído. */
	detalhe: LinhaOrigem[];
}

export function nomeDaFonte(fonte: string | null): string {
	if (!fonte) return "Outros";
	const chave = fonte.trim().toLowerCase();
	if (NOME_DA_FONTE[chave]) return NOME_DA_FONTE[chave];
	// Fonte desconhecida vira Título: melhor "Taboola" do que "taboola", e muito
	// melhor do que esconder atrás de "Outros" — o time reconhece o nome que ele
	// mesmo digitou na UTM.
	return chave.charAt(0).toUpperCase() + chave.slice(1);
}

/**
 * IDs da Meta têm 18 dígitos e são indistinguíveis entre si nos 12 primeiros.
 * O sufixo é o que diferencia uma campanha da outra na leitura rápida; o valor
 * inteiro continua disponível no atributo `title` de quem renderiza.
 *
 * Só encolhe IDENTIFICADOR — sequência longa de dígitos. Nome que alguém
 * escolheu ("verao2026", "remarketing-agosto") é legível e fica inteiro:
 * truncá-lo destruiria justamente a informação que a abreviação existe para
 * proteger.
 */
export function abreviarId(valor: string, digitos = 6): string {
	const t = valor.trim();
	if (!/^\d+$/.test(t)) return t;
	if (t.length <= digitos + 2) return t;
	return `…${t.slice(-digitos)}`;
}

/** O nome curto de uma campanha dentro do canal dela: sem repetir a fonte. */
export function rotuloDaCampanha(origem: LinhaOrigem["origem"]): string {
	const partes: string[] = [];
	if (origem.campanha) partes.push(`campanha ${abreviarId(origem.campanha)}`);
	if (origem.criativo) partes.push(`criativo ${abreviarId(origem.criativo)}`);
	if (partes.length > 0) return partes.join(" · ");
	// Sem campanha nem criativo, o que resta é o próprio rótulo (referência,
	// Click-to-WhatsApp com headline).
	return origem.label;
}

function chaveDoCanal(origem: LinhaOrigem["origem"]): { chave: string; nome: string } {
	switch (origem.tipo) {
		case "campanha": {
			const nome = nomeDaFonte(origem.fonte);
			return { chave: `campanha:${origem.fonte ?? "outros"}`, nome };
		}
		case "click-to-whatsapp":
			return { chave: "ctwa", nome: "Click-to-WhatsApp" };
		case "referencia":
			return { chave: "referencia", nome: "Referência" };
		case "direto":
			return { chave: "direto", nome: "Direto" };
	}
}

function taxa(fechados: number, visitas: number): number {
	return visitas > 0 ? (fechados / visitas) * 100 : 0;
}

/**
 * Junta as origens em canais, ordenados por visitas.
 *
 * O detalhe de cada canal sai ordenado do mesmo jeito — quem abre o Instagram
 * quer ver primeiro a campanha que mais trouxe, e a que fechou contrato antes
 * da que só trouxe visita.
 */
export function agruparPorCanal(origens: LinhaOrigem[]): GrupoDeCanal[] {
	const grupos = new Map<string, GrupoDeCanal>();

	for (const linha of origens) {
		const { chave, nome } = chaveDoCanal(linha.origem);
		const grupo = grupos.get(chave) ?? {
			chave,
			nome,
			tipo: linha.origem.tipo,
			visitas: 0,
			conversas: 0,
			identificados: 0,
			propostas: 0,
			fechados: 0,
			taxaFechamento: 0,
			detalhe: [],
		};

		grupo.visitas += linha.visitas;
		grupo.conversas += linha.conversas;
		grupo.identificados += linha.identificados;
		grupo.propostas += linha.propostas;
		grupo.fechados += linha.fechados;
		grupo.detalhe.push(linha);

		grupos.set(chave, grupo);
	}

	return [...grupos.values()]
		.map((g) => ({
			...g,
			taxaFechamento: taxa(g.fechados, g.visitas),
			detalhe: [...g.detalhe].sort((a, b) => b.fechados - a.fechados || b.visitas - a.visitas),
		}))
		.sort((a, b) => b.visitas - a.visitas || b.fechados - a.fechados);
}
