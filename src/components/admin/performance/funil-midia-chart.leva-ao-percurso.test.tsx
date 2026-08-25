// @vitest-environment happy-dom
/**
 * O funil dizia "8 pararam aqui" e não havia como perguntar QUEM são esses 8 —
 * o painel mostrava o buraco e escondia quem caiu nele.
 *
 * O que este arquivo protege é a ponte: cada etapa vira link para a tela de
 * Percurso, no degrau equivalente e no MESMO período em que o número foi lido.
 * Perder o período no caminho é o defeito silencioso do tipo mais caro — a
 * lista abre, parece certa, e responde por outro intervalo.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { EtapaFunilMidia } from "@/lib/admin/performance-types";
import { FunilMidiaChart } from "./funil-midia-chart";

function etapa(chave: EtapaFunilMidia["chave"], label: string, count: number): EtapaFunilMidia {
	return {
		chave,
		label,
		ajuda: `ajuda de ${label}`,
		count,
		percentDoTopo: 100,
		percentDasConversas: 100,
		quedaDaAnterior: 0,
		pararamAqui: 1,
		aindaVivas: 0,
	};
}

const ETAPAS: EtapaFunilMidia[] = [
	etapa("visitas", "Visitas", 500),
	etapa("conversas", "Conversas", 20),
	etapa("engajadas", "Engajaram", 12),
	etapa("identificados", "Se identificaram", 7),
	etapa("viram_oferta", "Viram oferta", 5),
	etapa("propostas", "Propostas", 2),
	etapa("fechados", "Fechados", 1),
];

const DE = new Date("2026-07-19T00:00:00.000Z");
const ATE = new Date("2026-08-18T23:59:59.000Z");

function hrefDe(label: string): string {
	const alvo = screen.getByText(label).closest("a");
	if (!alvo) throw new Error(`A etapa "${label}" não virou link`);
	return alvo.getAttribute("href") ?? "";
}

afterEach(cleanup);

describe("funil de mídia — cada etapa leva ao percurso", () => {
	it("liga cada etapa ao degrau equivalente do percurso", () => {
		render(<FunilMidiaChart etapas={ETAPAS} de={DE} ate={ATE} />);

		// O vocabulário das duas telas é um só: o mapa vive em
		// `PASSO_DA_ETAPA_DO_FUNIL` e é ele que este teste percorre de ponta a ponta.
		expect(hrefDe("Conversas")).toContain("passo=abriu_o_chat");
		expect(hrefDe("Engajaram")).toContain("passo=escreveu");
		expect(hrefDe("Se identificaram")).toContain("passo=se_identificou");
		expect(hrefDe("Viram oferta")).toContain("passo=viu_oferta");
		expect(hrefDe("Propostas")).toContain("passo=proposta");
		expect(hrefDe("Fechados")).toContain("passo=fechado");
	});

	it("carrega o período junto, para a lista responder pelo mesmo intervalo", () => {
		render(<FunilMidiaChart etapas={ETAPAS} de={DE} ate={ATE} />);
		const href = hrefDe("Engajaram");

		expect(href).toContain(`from=${encodeURIComponent(DE.toISOString())}`);
		expect(href).toContain(`to=${encodeURIComponent(ATE.toISOString())}`);
	});

	it("sem período escolhido, manda para a tela inteira em vez de inventar um", () => {
		render(<FunilMidiaChart etapas={ETAPAS} />);
		const href = hrefDe("Fechados");

		expect(href).toBe("/admin/percurso?passo=fechado&modo=alcancou");
	});

	it("abre a lista em ALCANÇOU, porque o número clicado é cumulativo", () => {
		// O defeito que este caso fixa, visto na tela em 24/08/2026: o funil dizia
		// "8 abriram conversa", o operador clicou, e recebeu uma lista VAZIA. Os
		// dois números estavam certos e falavam de coisas diferentes — o do funil é
		// cumulativo ("chegaram até aqui") e o padrão da tela de destino é terminal
		// ("pararam aqui"). Ninguém tinha parado em "Abriu o chat" porque todos os
		// que abriram escreveram e caíram em degraus mais fundos.
		//
		// O teste anterior passava com a ponte enganando: ele conferia o degrau e o
		// período, e nunca o modo.
		render(<FunilMidiaChart etapas={ETAPAS} de={DE} ate={ATE} />);

		for (const rotulo of ["Conversas", "Engajaram", "Se identificaram", "Viram oferta"]) {
			expect(hrefDe(rotulo), `${rotulo} tem que abrir em alcancou`).toContain("modo=alcancou");
			expect(hrefDe(rotulo)).not.toContain("modo=parou");
		}
	});

	it("não mostra a etapa de visitas — ela vive no card da porta", () => {
		render(<FunilMidiaChart etapas={ETAPAS} de={DE} ate={ATE} />);

		expect(screen.queryByText("Visitas")).toBeNull();
	});
});
