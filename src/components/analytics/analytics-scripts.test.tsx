// @vitest-environment happy-dom

import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalyticsScripts } from "./analytics-scripts";

// `next/script` monta um <script> de verdade em teste; o stub deixa a asserção
// sobre o que ESTE componente decidiu renderizar, sem depender do Next.
vi.mock("next/script", () => ({
	default: ({ id, src, strategy }: { id?: string; src?: string; strategy?: string }) => (
		<div data-tag={id ?? src} data-strategy={strategy} />
	),
}));

function comTopo(top: unknown) {
	Object.defineProperty(window, "top", { value: top, configurable: true, writable: true });
}

afterEach(() => comTopo(window));

describe("AnalyticsScripts", () => {
	it("injeta as tags na navegação normal", () => {
		comTopo(window); // janela de topo: self === top

		const { container } = render(<AnalyticsScripts />);

		expect(container.querySelectorAll("[data-tag]").length).toBeGreaterThan(0);
	});

	it("NÃO injeta nada dentro de um iframe", () => {
		// É o caso do preview da landing dentro do /admin/mapa-de-calor. Medido em
		// 18/08/2026: sem esta trava, abrir o mapa carregava 2 scripts do GTM
		// DENTRO do iframe, populava o dataLayer e deixava `gtag` como função —
		// ou seja, contava um pageview da landing a cada vez que alguém abria o
		// painel. Em produção o Meta Pixel iria junto, mandando sinal falso para
		// o algoritmo de anúncio.
		comTopo({});

		const { container } = render(<AnalyticsScripts />);

		expect(container.querySelectorAll("[data-tag]")).toHaveLength(0);
	});

	// ── A ORDEM DE CARREGAMENTO É DECISÃO DE NEGÓCIO (30/08/2026) ────────────
	//
	// Lighthouse mobile contra produção: score 29, LCP 7,7 s, FCP 7,7 s. FCP e
	// LCP iguais dizem que nada pinta até lá — não é a imagem do hero, é o
	// JavaScript. Destas quatro tags saem 510 dos 1.094 KB de script da home e
	// 1.878 ms de execução na main thread.
	//
	// A divisão entre elas não é técnica:
	//
	//   • o Meta Pixel alimenta a MÍDIA PAGA. É dele que saem `PageView` e
	//     `ChatIniciado`, é ele que a Conversions API deduplica, e é a partir
	//     dele que a verba é decidida. Atrasá-lo trocaria performance por sinal
	//     de otimização;
	//   • GTM e GA4 são analytics de leitura. Chegar depois custa, no pior caso,
	//     o pageview de quem sai antes do `load` — as mesmas pessoas que hoje já
	//     são perdidas inteiras nos oito segundos de espera.
	//
	// Estes dois casos existem para que a distinção não se perca no próximo
	// commit que mexer no arquivo.
	it("GTM e GA4 saem do caminho crítico", () => {
		comTopo(window);
		const { container } = render(<AnalyticsScripts />);

		for (const tag of ["gtm", "ga4"]) {
			expect(
				container.querySelector(`[data-tag="${tag}"]`)?.getAttribute("data-strategy"),
				tag,
			).toBe("lazyOnload");
		}
		expect(
			container
				.querySelector('[data-tag*="googletagmanager.com/gtag"]')
				?.getAttribute("data-strategy"),
		).toBe("lazyOnload");
	});

	it("o Meta Pixel NÃO é adiado — é ele que decide a verba", () => {
		comTopo(window);
		const { container } = render(<AnalyticsScripts />);

		const pixel = container.querySelector('[data-tag="meta-pixel"]');
		// Só existe com `NEXT_PUBLIC_META_PIXEL_ID` assado no build; quando existe,
		// a estratégia não pode ter mudado junto com as outras.
		if (pixel) expect(pixel.getAttribute("data-strategy")).toBe("afterInteractive");
	});
});
