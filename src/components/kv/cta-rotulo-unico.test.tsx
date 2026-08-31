// @vitest-environment happy-dom
/**
 * A5 — UM verbo de CTA no site inteiro.
 *
 * A auditoria de 28/08 contou "mais de 7 textos de botão" pela landing. Cada
 * rótulo novo é uma decisão nova para quem está lendo, e é a REPETIÇÃO do mesmo
 * verbo que constrói reconhecimento — o visitante que rolou até o rodapé
 * precisa reencontrar exatamente o botão que viu no topo, não um primo dele.
 *
 * O rótulo escolhido é **"Comparar agora"** e não o "Quero minha simulação" que
 * a planilha sugeriu (decisão do Kairo, 30/08/2026): "comparar" é a promessa da
 * marca — comparador independente —, enquanto "simulação" é o que a
 * concorrência toda diz. Ele já era o rótulo de 6 dos 10 pontos.
 *
 * **A única exceção, e o motivo dela:** o botão que ENVIA o card do hero. Ali
 * ele não abre uma escolha — ele fecha um formulário que a pessoa acabou de
 * preencher, e "Quero minha simulação" descreve o RESULTADO do envio. Trocá-lo
 * por "Comparar agora" faria um botão de submit anunciar a ação em vez do que
 * ela produz.
 *
 * Este teste varre os componentes de CTA e falha se aparecer qualquer rótulo
 * fora do conjunto aprovado — é o que impede o item de regredir no próximo
 * commit de copy, que foi exatamente como os 7 rótulos nasceram.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
	// biome-ignore lint/suspicious/noExplicitAny: mock simples de next/image pro teste
	default: ({ fill, priority, quality, ...rest }: any) => createElement("img", rest),
}));

import { KvDepoimentos } from "./kv-depoimentos";
import { KvHero } from "./kv-hero";
import { KvIndependente } from "./kv-independente";
import { KvJourney } from "./kv-journey";
import { KvMenu } from "./kv-menu";
import { KvNumbers } from "./kv-numbers";
import { KvTipos } from "./kv-tipos";

/** O verbo único da marca. */
const CTA_PADRAO = "Comparar agora";

/**
 * A exceção nomeada. Lista e não regex: exceção que se descreve por padrão
 * volta a virar uma família de rótulos, que é o problema original.
 */
const EXCECOES = ["Quero minha simulação"];

const APROVADOS = new Set([CTA_PADRAO, ...EXCECOES]);

beforeEach(() => {
	window.matchMedia = vi.fn().mockImplementation((query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: vi.fn(),
		removeListener: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
	})) as unknown as typeof window.matchMedia;
});

afterEach(cleanup);

const noop = () => {};

const SECOES: Array<[string, () => React.ReactElement]> = [
	["kv-menu", () => <KvMenu onOpenChat={noop} />],
	["kv-hero", () => <KvHero onOpenChat={noop} />],
	["kv-journey", () => <KvJourney onOpenChat={noop} />],
	["kv-tipos", () => <KvTipos onOpenChat={noop} />],
	["kv-numbers", () => <KvNumbers onOpenChat={noop} />],
	["kv-depoimentos", () => <KvDepoimentos onOpenChat={noop} />],
	["kv-independente", () => <KvIndependente onOpenChat={noop} />],
];

describe("A5 — rótulo único de CTA", () => {
	it.each(SECOES)("%s não usa nenhum rótulo de CTA fora do conjunto aprovado", (_nome, montar) => {
		render(montar());

		// `data-kv-cta` é a marca que o próprio átomo (`KvCtaButton`) carimba. Sem
		// ela a varredura teria que adivinhar quem é CTA pela classe do Tailwind, e
		// mudar o raio da pill quebraria o teste sem que nenhum rótulo mudasse.
		const ctas = Array.from(document.querySelectorAll("[data-kv-cta]"));
		expect(ctas.length).toBeGreaterThan(0);

		for (const cta of ctas) {
			expect(APROVADOS).toContain(cta.textContent?.trim());
		}
	});

	it('a exceção vive SÓ no envio do card do hero — e é o "Quero minha simulação"', () => {
		render(<KvHero onOpenChat={noop} />);

		const submit = screen.getByRole("button", { name: "Quero minha simulação" });
		expect(submit).toHaveProperty("type", "submit");

		// E o outro CTA do hero (o de mobile, depois da colagem) segue o padrão.
		expect(screen.getByRole("button", { name: CTA_PADRAO })).toBeTruthy();
	});

	it("nenhuma seção reintroduz os rótulos que saíram", () => {
		const APOSENTADOS = ["Fale com a AJA", "Comparar opções", "Encontre o consórcio certo"];

		for (const [, montar] of SECOES) {
			render(montar());
			for (const aposentado of APOSENTADOS) {
				expect(screen.queryByRole("button", { name: aposentado })).toBeNull();
			}
			cleanup();
		}
	});
});
