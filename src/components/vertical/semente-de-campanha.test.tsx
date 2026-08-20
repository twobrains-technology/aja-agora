// @vitest-environment happy-dom
/**
 * O clique no card do catálogo da Meta (`/autos?bem=50000`) tem que chegar no
 * chat já sabendo o valor anunciado. Sem isto o anúncio promete uma carta de
 * R$ 50.000 e a conversa começa perguntando o que a pessoa quer — do zero.
 */

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TheaterProvider, useTheater } from "@/components/chat/theater/theater-context";

import { SementeDeCampanha } from "./semente-de-campanha";

afterEach(() => {
	cleanup();
	window.history.replaceState({}, "", "/autos");
});

/** Expõe o estado do teatro para o teste — o overlay real não entra aqui. */
function Espiao() {
	const { isOpen, seed, seedOrigin } = useTheater();
	return <div data-testid="teatro">{isOpen ? `${seedOrigin}|${seed}` : "fechado"}</div>;
}

function montar(url: string) {
	window.history.replaceState({}, "", url);
	render(
		<TheaterProvider>
			<SementeDeCampanha semente={(valor) => `Quero um carro de ${valor}.`} />
			<Espiao />
		</TheaterProvider>,
	);
	return screen.getByTestId("teatro");
}

describe("SementeDeCampanha", () => {
	it("abre a conversa com o valor que o anúncio prometeu", () => {
		expect(montar("/autos?bem=50000")).toHaveTextContent("digitada|Quero um carro de R$ 50.000.");
	});

	it("continua funcionando com as UTMs do feed no link", () => {
		const url = "/autos?bem=120000&utm_source=meta&utm_medium=catalogo&fbclid=abc";
		expect(montar(url)).toHaveTextContent("Quero um carro de R$ 120.000.");
	});

	it("não abre nada quando a pessoa chega pela navegação normal", () => {
		expect(montar("/autos")).toHaveTextContent("fechado");
	});

	it("não abre com valor que o funil barraria", () => {
		expect(montar("/autos?bem=900")).toHaveTextContent("fechado");
	});
});
