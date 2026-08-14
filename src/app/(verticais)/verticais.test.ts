/**
 * Invariantes das landings de vertical que nenhum teste de componente pegaria,
 * porque todos vivem no conteúdo.
 *
 * É uma tabela, e não um arquivo por vertical, porque nenhum dos três
 * invariantes é de uma página só: são regras do domínio (FGTS), da navegação
 * (âncora morta) e da fidelidade ao comp (o bem errado no card). Copiar o
 * arquivo daria três cópias do mesmo helper e três listas de regex fora de
 * vista — e foi copiando conteúdo entre verticais que os erros abaixo nasceram.
 */

import { describe, expect, it } from "vitest";

import { linksDoMenu, NAV_VERTICAL } from "@/components/kv/navegacao";

import { FAQ_AUTO, GUIA_AUTO, HERO_AUTO, NUMEROS_AUTO, UPGRADE_AUTO } from "./autos/conteudo";
import {
	FAQ_IMOVEL,
	FGTS_IMOVEL,
	GUIA_IMOVEL,
	HERO_IMOVEL,
	NUMEROS_IMOVEL,
} from "./imoveis/conteudo";
import { FAQ_MOTO, GUIA_MOTO, HERO_MOTO, NUMEROS_MOTO, PASSOS_MOTO } from "./motos/conteudo";

/** Todo texto da página, achatado — funções e componentes ficam de fora. */
function todoOTexto(valor: unknown): string[] {
	if (typeof valor === "string") return [valor];
	if (Array.isArray(valor)) return valor.flatMap(todoOTexto);
	if (valor && typeof valor === "object") return Object.values(valor).flatMap(todoOTexto);
	return [];
}

const VERTICAIS = [
	{
		nome: "imóvel",
		blocos: [HERO_IMOVEL, NUMEROS_IMOVEL, FGTS_IMOVEL, FAQ_IMOVEL, GUIA_IMOVEL],
		ancoras: ["#hero", "#proposito", "#fgts", "#faq"],
		ofereceFgts: true,
		contemplacoes: NUMEROS_IMOVEL.contemplacoes.descricao,
		falaDoBem: /im[óo]ve(l|is)/i,
		naoFalaDoBem: [/\bcarros?\b/i, /\bmotos?\b/i],
	},
	{
		nome: "auto",
		blocos: [HERO_AUTO, NUMEROS_AUTO, UPGRADE_AUTO, FAQ_AUTO, GUIA_AUTO],
		ancoras: ["#hero", "#proposito", "#upgrade", "#faq"],
		ofereceFgts: false,
		contemplacoes: NUMEROS_AUTO.contemplacoes.descricao,
		falaDoBem: /ve[íi]culos?|carros?/i,
		naoFalaDoBem: [/im[óo]ve(l|is)/i, /\bmotos?\b/i],
	},
	{
		nome: "moto",
		blocos: [HERO_MOTO, NUMEROS_MOTO, PASSOS_MOTO, FAQ_MOTO, GUIA_MOTO],
		ancoras: ["#hero", "#proposito", "#trabalho", "#faq"],
		ofereceFgts: false,
		contemplacoes: NUMEROS_MOTO.contemplacoes.descricao,
		falaDoBem: /\bmotos?\b/i,
		naoFalaDoBem: [/im[óo]ve(l|is)/i, /\bcarros?\b/i],
	},
];

describe.each(VERTICAIS)("conteúdo da vertical de $nome", (vertical) => {
	const textos = todoOTexto(vertical.blocos);

	// FGTS só vale para imóvel residencial. O comp de auto herdou do de imóvel um
	// eyebrow falando de FGTS; se ele (ou qualquer outro texto do tipo) voltar,
	// a página passa a prometer um benefício que não existe para veículo.
	it.skipIf(vertical.ofereceFgts)(
		"não oferece FGTS em lugar nenhum — só nega, na pergunta do FAQ",
		() => {
			for (const texto of textos.filter((t) => /fgts/i.test(t))) {
				const ehPergunta = texto.trim().endsWith("?");
				const nega = /\bnão\b/i.test(texto);
				expect(
					ehPergunta || nega,
					`texto menciona FGTS sem negar o uso em veículo: "${texto}"`,
				).toBe(true);
			}
		},
	);

	it("o menu não tem clique morto", () => {
		// As três verticais usam o MESMO menu da home (`NAV_VERTICAL`), então dois
		// itens — "Como funcionamos" e "Quem somos" — falam de seções que só
		// existem lá e viram link para a home. O resto tem de ser âncora que esta
		// página realmente monta, senão é clique que não faz nada.
		//
		// `linksDoMenu` achata o submenu "Tipo de Consórcio": o que interessa é
		// todo destino clicável, esteja ele na barra ou uma camada abaixo.
		const hrefs = linksDoMenu(NAV_VERTICAL).map((link) => link.href);

		expect(hrefs.length).toBeGreaterThan(0);
		expect(new Set(hrefs).size, "destino repetido no menu").toBe(hrefs.length);

		for (const href of hrefs) {
			// Caminho absoluto (`/#como-funciona`, `/autos`) sai daqui: quem cobra
			// que a rota de destino existe é `navegacao.rotas-existem.test.ts`.
			// Aqui a pergunta é outra — a âncora que resolve NESTA página existe?
			if (href.startsWith("/")) continue;
			expect(href, "âncora do menu tem que ser interna ou apontar para a home").toMatch(/^#/);
			expect(vertical.ancoras, `${href} não é uma seção desta página`).toContain(href);
		}
	});

	// O card de contemplações é o mais copiado entre verticais, e o comp de moto
	// chega com "contemplações DE IMÓVEIS" numa página de moto. Aqui a checagem é
	// estreita de propósito: varrer a página inteira daria falso positivo, porque
	// a resposta de FGTS legitimamente cita "imóvel residencial" nas três.
	it("o card de contemplações fala do bem da própria vertical", () => {
		const fala = todoOTexto(vertical.contemplacoes).join(" ");

		expect(fala, `descrição não cita o bem da vertical: "${fala}"`).toMatch(vertical.falaDoBem);
		for (const errado of vertical.naoFalaDoBem) {
			expect(errado.test(fala), `descrição cita o bem de outra vertical: "${fala}"`).toBe(false);
		}
	});
});
