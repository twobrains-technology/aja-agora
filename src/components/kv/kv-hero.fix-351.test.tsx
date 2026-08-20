// @vitest-environment happy-dom
/**
 * FIX-351 (topo de funil /kv) — os CTAs do Hero e o composer do search-card
 * (chips + envio) eram inertes: réplica visual do Figma que nunca recebeu a
 * integração com o Modo Teatro (onOpenChat/TheaterOpener), no mesmo padrão
 * de src/components/landing/hero.tsx (FIX-75: texto digitado vence o chip).
 *
 * O topo foi redesenhado em 2026-08-20 e os rótulos mudaram ("Fale com a AJA"
 * saiu de lá, o aviãozinho virou "Quero minha simulação"), mas o que estes
 * casos medem é o mesmo de sempre: nenhum controle daqui pode ser enfeite.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
	// biome-ignore lint/suspicious/noExplicitAny: mock simples de next/image pro teste
	default: ({ fill, ...rest }: any) => createElement("img", rest),
}));

import { KvHero } from "./kv-hero";

// O hero consulta `matchMedia` (useReducedMotion, para o placeholder que se
// digita sozinho). happy-dom nem sempre traz o método; sem o stub o componente
// quebra na montagem e TODO caso aqui falha por um motivo que nada tem a ver
// com o que eles medem. `matches: false` = sem `prefers-reduced-motion`.
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

afterEach(() => {
	cleanup();
});

describe("FIX-351 — KvHero chama onOpenChat", () => {
	it("NENHUM CTA solto abaixo do card — os dois saíram do hero", () => {
		// 2026-08-20, em duas etapas do mesmo dia: de manhã o "Fale com a AJA"
		// virou o título do card; à tarde o "Encontre o consórcio certo" também
		// saiu (decisão do Kairo). Três caminhos para a mesma conversa, empilhados,
		// era o que o cliente marcou nos prints.
		//
		// Os dois continuam existindo no fecho da página (kv-footer.tsx), que é
		// outro momento do funil — este caso trava só o hero.
		render(<KvHero onOpenChat={vi.fn()} />);

		expect(screen.queryByRole("button", { name: "Fale com a AJA" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Encontre o consórcio certo" })).toBeNull();
	});

	it("o que fecha a ação no hero é o CTA de dentro do card", () => {
		// O controle positivo da remoção acima: sem ele, apagar o botão do card
		// junto deixaria os dois casos verdes com o hero sem saída nenhuma.
		const onOpenChat = vi.fn();
		render(<KvHero onOpenChat={onOpenChat} />);

		fireEvent.click(screen.getByRole("button", { name: "Quero minha simulação" }));

		expect(onOpenChat).toHaveBeenCalledTimes(1);
		expect(onOpenChat.mock.calls[0][0]).toBe("");
	});

	it("chip 'Carro' do search-card com input vazio → envia o canned do chip", () => {
		const onOpenChat = vi.fn();
		render(<KvHero onOpenChat={onOpenChat} />);

		fireEvent.click(screen.getByRole("button", { name: "Carro" }));

		expect(onOpenChat.mock.calls[0][0]).toBe("Quero comprar um carro.");
	});

	it("chip do search-card com input preenchido → envia o TEXTO DIGITADO, não o canned", () => {
		const onOpenChat = vi.fn();
		render(<KvHero onOpenChat={onOpenChat} />);

		const input = screen.getByRole("textbox");
		fireEvent.change(input, { target: { value: "Quero um carro até R$ 60 mil." } });
		fireEvent.click(screen.getByRole("button", { name: "Carro" }));

		expect(onOpenChat.mock.calls[0][0]).toBe("Quero um carro até R$ 60 mil.");
	});

	it("o CTA do search-card submete o texto digitado", () => {
		// Era o botão de aviãozinho (aria-label "Enviar"); virou "Quero minha
		// simulação" em 2026-08-20 — um ícone não dizia o que ia acontecer, e 37px
		// é alvo pequeno pra dedo. O contrato aqui não mudou: o que foi digitado é
		// o que chega ao teatro.
		const onOpenChat = vi.fn();
		render(<KvHero onOpenChat={onOpenChat} />);

		const input = screen.getByRole("textbox");
		fireEvent.change(input, { target: { value: "Quero um apê de R$ 300 mil." } });
		fireEvent.click(screen.getByRole("button", { name: "Quero minha simulação" }));

		expect(onOpenChat.mock.calls[0][0]).toBe("Quero um apê de R$ 300 mil.");
	});
});
