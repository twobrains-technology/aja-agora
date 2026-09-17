// @vitest-environment happy-dom
// @vitest-environment-options { "url": "http://localhost/admin/performance" }

// O filtro é quem grava o período nos DOIS lados.
//
// O defeito que este arquivo protege: a escolha vivia só na URL, e o menu
// navega com `href` puro — então bastava clicar em outra tela para o período
// voltar para hoje. A URL serve ao link compartilhado e à rota; o cookie serve à
// navegação. Se um dos dois ficar de fora, a pessoa perde a escolha.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NuqsTestingAdapter, type UrlUpdateEvent } from "nuqs/adapters/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COOKIE_DO_PERIODO } from "@/lib/admin/periodo";
import { DateRangeFilter } from "./date-range-filter";
import { PeriodoProvider } from "./periodo-provider";

/** Os dias que o preset "30 dias" fecha em 19/08/2026. */
const TRINTA_DIAS_DE = "2026-07-21";
const HOJE = "2026-08-19";

function montar({
	searchParams = "",
	veioDoCookie = false,
	onUrlUpdate,
	resetFila = true,
}: {
	searchParams?: string;
	veioDoCookie?: boolean;
	onUrlUpdate?: (evento: UrlUpdateEvent) => void;
	resetFila?: boolean;
} = {}) {
	return render(
		<NuqsTestingAdapter
			searchParams={searchParams}
			hasMemory
			resetUrlUpdateQueueOnMount={resetFila}
			onUrlUpdate={onUrlUpdate}
		>
			<PeriodoProvider
				de={veioDoCookie ? "2026-08-01" : HOJE}
				ate={veioDoCookie ? "2026-08-10" : HOJE}
				veioDoCookie={veioDoCookie}
			>
				<DateRangeFilter />
			</PeriodoProvider>
		</NuqsTestingAdapter>,
	);
}

/** O valor do cookie do período agora — `null` se não existe. */
function cookieGravado(): string | null {
	const casado = new RegExp(`${COOKIE_DO_PERIODO}=([^;]*)`).exec(document.cookie);
	return casado ? decodeURIComponent(casado[1]) : null;
}

describe("o filtro de período grava cookie e URL", () => {
	beforeEach(() => {
		// `shouldAdvanceTime` deixa o relógio correr para o `waitFor` do
		// testing-library, que senão fica esperando um timer congelado.
		vi.useFakeTimers({ shouldAdvanceTime: true });
		vi.setSystemTime(new Date("2026-08-19T18:00:00Z"));
		// Limpa o cookie entre casos: o happy-dom o mantém no documento.
		// biome-ignore lint/suspicious/noDocumentCookie: limpeza do cookie de teste, não é o código de produção.
		document.cookie = `${COOKIE_DO_PERIODO}=; path=/admin; max-age=0`;
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
	});

	it("ao escolher 30 dias, grava o intervalo nos dois lugares", async () => {
		const atualizacoes: UrlUpdateEvent[] = [];
		montar({ onUrlUpdate: (evento) => atualizacoes.push(evento) });

		fireEvent.click(screen.getByRole("button", { name: "30 dias" }));

		await waitFor(() => expect(cookieGravado()).toBe(`${TRINTA_DIAS_DE}_${HOJE}`));
		expect(atualizacoes.at(-1)?.searchParams.get("from")).toBe(TRINTA_DIAS_DE);
		expect(atualizacoes.at(-1)?.searchParams.get("to")).toBe(HOJE);
	});

	it("'Hoje' grava hoje nos dois — se limpasse só a URL, o cookie ressuscitaria", async () => {
		// Começa em outro período, na URL E no cookie, como se a pessoa tivesse
		// acabado de navegar com aquele intervalo escolhido.
		const atualizacoes: UrlUpdateEvent[] = [];
		montar({
			searchParams: "?from=2026-08-01&to=2026-08-10",
			onUrlUpdate: (evento) => atualizacoes.push(evento),
		});

		fireEvent.click(screen.getByRole("button", { name: "Hoje" }));

		await waitFor(() => expect(cookieGravado()).toBe(`${HOJE}_${HOJE}`));
		expect(atualizacoes.at(-1)?.searchParams.get("from")).toBe(HOJE);
		expect(atualizacoes.at(-1)?.searchParams.get("to")).toBe(HOJE);
	});

	it("o preset ativo do intervalo aparece como pressionado", () => {
		montar({ searchParams: `?from=${TRINTA_DIAS_DE}&to=${HOJE}` });

		expect(screen.getByRole("button", { name: "30 dias" }).getAttribute("aria-pressed")).toBe(
			"true",
		);
		expect(screen.getByRole("button", { name: "Hoje" }).getAttribute("aria-pressed")).toBe("false");
	});

	it("sem cookie, a tela abre em hoje e NÃO polui a URL", () => {
		const atualizacoes: UrlUpdateEvent[] = [];
		montar({ onUrlUpdate: (evento) => atualizacoes.push(evento) });

		expect(atualizacoes).toHaveLength(0);
		expect(screen.getByRole("button", { name: "Hoje" }).getAttribute("aria-pressed")).toBe("true");
	});

	it("com cookie, a URL vazia recebe o período guardado ao montar", async () => {
		// Sem isto, as telas que leem `from`/`to` da querystring consultariam hoje
		// enquanto o servidor responderia pelo cookie — duas janelas na mesma tela.
		// A fila do adapter NÃO é resetada no mount justamente para o evento de
		// hidratação chegar a este teste.
		const atualizacoes: UrlUpdateEvent[] = [];
		montar({
			veioDoCookie: true,
			resetFila: false,
			onUrlUpdate: (evento) => atualizacoes.push(evento),
		});

		await waitFor(() => {
			const hidratacao = atualizacoes.find(
				(evento) => evento.searchParams.get("from") === "2026-08-01",
			);
			expect(hidratacao?.searchParams.get("to")).toBe("2026-08-10");
		});
	});

	it("a comparação começa DESLIGADA e só o gesto a liga", () => {
		montar();

		const botao = screen.getByRole("button", { name: /Comparar/ });
		expect(botao.getAttribute("aria-pressed")).toBe("false");

		fireEvent.click(botao);
		expect(botao.getAttribute("aria-pressed")).toBe("true");
	});
});
