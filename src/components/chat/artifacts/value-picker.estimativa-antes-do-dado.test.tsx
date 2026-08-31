// @vitest-environment happy-dom
/**
 * C1 — a faixa estimada aparece ANTES de qualquer dado ser pedido.
 *
 * A planilha do Gustavo trata este item como a alavanca principal da auditoria:
 * o bot pedia o dado mais sensível do Brasil antes de entregar qualquer valor
 * concreto, invertendo a reciprocidade do funil. O motor da estimativa já
 * existia (`plan-estimate.ts`, em "modo estimativa de mercado"), mas o card que
 * o usava foi aposentado no FIX-115 e **nunca era emitido** — medido no banco
 * de produção em 30/08/2026: zero artefatos de estimativa em toda a base.
 *
 * A estimativa passa a viver aqui, na agulha do valor, e não num card à parte.
 * É melhor por dois motivos: (a) é o card que o cliente JÁ vê no ponto em que
 * informa o valor, então não custa um turno a mais no trecho mais caro do
 * funil; (b) o número se move com a agulha, o que responde a pergunta real que
 * a pessoa tem na cabeça — "e se eu pegar um mais barato?".
 *
 * **O selo não é enfeite.** O invariante do projeto é que número de
 * administradora sai de tool, nunca da cabeça do modelo nem da nossa. Esta
 * conta é premissa de mercado documentada, e a tela tem que dizer isso na cara
 * — senão a estimativa vira promessa, e a oferta real que chegar depois vira
 * decepção.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({ sendUserMessage: vi.fn(), status: "ready" }),
}));

// `motion` é um Proxy que devolve um componente para qualquer tag acessada
// (`motion.div`, `motion.section`…). Mock mínimo: repassa filhos e props,
// porque o que este arquivo testa é o CONTEÚDO do card, não a animação dele.
vi.mock("motion/react", () => ({
	motion: new Proxy(
		{},
		{
			get:
				() =>
				({ children, ...rest }: { children?: React.ReactNode }) => <div {...rest}>{children}</div>,
		},
	),
}));

import { parcelaEstimadaDeMercado } from "@/lib/consorcio/plan-estimate";
import { ValuePicker } from "./value-picker";

afterEach(cleanup);

const payloadDe = (category: "auto" | "imovel" | "moto", padrao: number) => ({
	category,
	fields: [
		{
			id: "credit",
			label: "Valor do bem",
			min: 30_000,
			max: 500_000,
			step: 10_000,
			default: padrao,
			format: "currency" as const,
		},
	],
});

describe("C1 — a parcela estimada na agulha do valor", () => {
	it("mostra a parcela estimada para o valor inicial", () => {
		render(<ValuePicker payload={payloadDe("auto", 80_000)} />);

		const esperado = parcelaEstimadaDeMercado("auto", 80_000);
		expect(esperado).not.toBeNull();

		const linha = screen.getByTestId("parcela-estimada");
		// O número exibido é o do motor, não um recálculo do teste — o teste que
		// refaz a conta prova só a si mesmo.
		expect(linha.textContent).toContain(
			Math.round(esperado?.parcela as number).toLocaleString("pt-BR"),
		);
		expect(linha.textContent).toContain(`${esperado?.prazoMeses}x`);
	});

	it("o número acompanha a agulha", () => {
		render(<ValuePicker payload={payloadDe("auto", 80_000)} />);
		const antes = screen.getByTestId("parcela-estimada").textContent;

		fireEvent.change(screen.getByTestId("value-input-credit"), { target: { value: "200.000" } });
		fireEvent.blur(screen.getByTestId("value-input-credit"));

		const depois = screen.getByTestId("parcela-estimada").textContent;
		expect(depois).not.toBe(antes);
		expect(depois).toContain(
			Math.round(parcelaEstimadaDeMercado("auto", 200_000)?.parcela as number).toLocaleString(
				"pt-BR",
			),
		);
	});

	it("cada categoria tem a própria premissa de prazo", () => {
		// Imóvel roda em grupo muito mais longo que carro — mostrar o prazo de
		// carro num consórcio de imóvel seria estimativa errada com cara de certa.
		render(<ValuePicker payload={payloadDe("imovel", 300_000)} />);
		expect(screen.getByTestId("parcela-estimada").textContent).toContain(
			`${parcelaEstimadaDeMercado("imovel", 300_000)?.prazoMeses}x`,
		);
	});

	it("diz, na tela, que é ESTIMATIVA — e que o número real vem da busca", () => {
		render(<ValuePicker payload={payloadDe("auto", 80_000)} />);
		const selo = screen.getByTestId("parcela-estimada-selo");
		expect(selo.textContent?.toLowerCase()).toContain("estimativa");
		expect(selo.textContent?.toLowerCase()).toMatch(/busca|administradora/);
	});

	it("não promete parcela quando não há valor", () => {
		// "R$ 0/mês" é pior do que silêncio.
		render(
			<ValuePicker
				payload={{
					...payloadDe("auto", 0),
					fields: [{ ...payloadDe("auto", 0).fields[0], min: 0, default: 0 }],
				}}
			/>,
		);
		expect(screen.queryByTestId("parcela-estimada")).toBeNull();
	});

	it("a agulha continua fazendo o que fazia", () => {
		render(<ValuePicker payload={payloadDe("auto", 80_000)} />);
		expect(screen.getByTestId("value-input-credit")).toBeTruthy();
		expect(screen.getByRole("button", { name: /Buscar opções/i })).toBeTruthy();
	});
});

describe("parcelaEstimadaDeMercado", () => {
	it("é a conta documentada: (bem + taxa típica) diluído no prazo típico", () => {
		const r = parcelaEstimadaDeMercado("auto", 80_000);
		// auto: 15% de taxa, 80 meses de prazo típico → 92.000 / 80 = 1.150
		expect(r?.parcela).toBeCloseTo(1150, 2);
		expect(r?.prazoMeses).toBe(80);
	});

	it("devolve null para valor não positivo", () => {
		expect(parcelaEstimadaDeMercado("auto", 0)).toBeNull();
		expect(parcelaEstimadaDeMercado("auto", -1)).toBeNull();
		expect(parcelaEstimadaDeMercado("auto", Number.NaN)).toBeNull();
	});
});
