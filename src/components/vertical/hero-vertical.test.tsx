// @vitest-environment happy-dom
/**
 * Hero das landings de vertical: o card de simulação é o principal ponto de
 * entrada da página, então o que importa cobrir é o wiring com o Modo Teatro —
 * sem parcela escolhida manda a frase de ENTRADA (origem "chip"), com parcela
 * manda a fala real do cliente (origem "digitada"), como em kv-hero.
 *
 * O card tem UM campo: a faixa de parcela, já marcada na primeira opção, como o
 * comp desenha. Então todo clique no CTA manda uma fala com parcela — o que os
 * dois testes cobrem é que a fala carrega a parcela CERTA, a que está na tela.
 *
 * A tabela roda o MESMO componente com o conteúdo de cada vertical. É o que
 * sustenta a tese da família de landings: se o hero deixar de ser genérico, a
 * segunda linha quebra.
 */

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
	// biome-ignore lint/suspicious/noExplicitAny: mock simples de next/image pro teste
	default: ({ fill, priority, ...rest }: any) => createElement("img", rest),
}));

import { HERO_AUTO } from "@/app/consorcio/auto/conteudo";
import { HERO_IMOVEL } from "@/app/consorcio/imovel/conteudo";
import { HERO_MOTO } from "@/app/consorcio/moto/conteudo";
import { HeroVertical } from "./hero-vertical";

afterEach(() => {
	cleanup();
});

const VERTICAIS = [
	{
		nome: "imóvel",
		conteudo: HERO_IMOVEL,
		manchete: "Cada parcela vira patrimônio dos seus sonhos",
		falaEsperada: "Quero um imóvel. Consigo pagar R$ 800/mês.",
	},
	{
		nome: "auto",
		conteudo: HERO_AUTO,
		manchete: "Quase 1 em cada 3 carros novos no Brasil passou por consórcio",
		falaEsperada: "Quero um carro. Consigo pagar R$ 680/mês.",
	},
	{
		nome: "moto",
		conteudo: HERO_MOTO,
		manchete: "O consórcio lidera a compra de motos novas no Brasil",
		falaEsperada: "Quero uma moto. Consigo pagar R$ 320/mês.",
	},
];

describe.each(VERTICAIS)(
	"HeroVertical ($nome) — card de simulação abre o Modo Teatro",
	({ conteudo, manchete, falaEsperada }) => {
		it("sem tocar no campo, envia a fala com a parcela que já vem marcada", () => {
			const onOpenChat = vi.fn();
			render(<HeroVertical conteudo={conteudo} onOpenChat={onOpenChat} />);

			expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(manchete);

			fireEvent.click(screen.getByRole("button", { name: conteudo.card.cta }));

			expect(onOpenChat).toHaveBeenCalledTimes(1);
			expect(onOpenChat).toHaveBeenCalledWith(falaEsperada, expect.anything(), "digitada");
		});

		it("trocando a parcela, é a nova que vai na fala", () => {
			const onOpenChat = vi.fn();
			render(<HeroVertical conteudo={conteudo} onOpenChat={onOpenChat} />);

			const outra = conteudo.card.parcelas[1];
			fireEvent.change(screen.getByLabelText(conteudo.card.parcelaRotulo), {
				target: { value: outra },
			});
			fireEvent.click(screen.getByRole("button", { name: conteudo.card.cta }));

			expect(onOpenChat).toHaveBeenCalledWith(
				conteudo.semente(outra),
				expect.anything(),
				"digitada",
			);
		});
	},
);
