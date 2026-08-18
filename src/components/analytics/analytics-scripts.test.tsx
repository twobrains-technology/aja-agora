// @vitest-environment happy-dom

import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalyticsScripts } from "./analytics-scripts";

// `next/script` monta um <script> de verdade em teste; o stub deixa a asserção
// sobre o que ESTE componente decidiu renderizar, sem depender do Next.
vi.mock("next/script", () => ({
	default: ({ id, src }: { id?: string; src?: string }) => <div data-tag={id ?? src} />,
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
});
