// @vitest-environment happy-dom
// @vitest-environment-options { "url": "http://localhost/admin/conversations?origem=campanha:ig" }

// O filtro de campanha é MÚLTIPLO e o estado dele mora na URL.
//
// O defeito de família que este arquivo protege: recorte de filtro guardado só
// na memória do componente. Ele não cabe num link e some na navegação — foi
// assim que o filtro de período voltou sozinho para "hoje" (ver
// `date-range-filter.test.tsx`). Para campanha a cura é a URL: `?campanha=a,b,c`,
// um parâmetro só, que qualquer link carrega.
//
// Por isso o teste central não é "o clique mudou uma prop" — é "a URL passou a
// ter as duas campanhas" e "um carregamento novo com essa URL mostra o mesmo
// recorte". É o que "sobrevive à navegação" significa.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NuqsTestingAdapter, type UrlUpdateEvent } from "nuqs/adapters/testing";
import { afterEach, describe, expect, it } from "vitest";
import { CampanhaFilter, type OpcaoDeCampanha } from "./campanha-filter";

const OPCOES: OpcaoDeCampanha[] = [
	{ valor: "camp-1", rotulo: "Verão 2026" },
	{ valor: "camp-2", rotulo: "Inverno 2026" },
	{ valor: "camp-3", rotulo: "Remarketing" },
];

function montar({
	searchParams = "",
	onUrlUpdate,
}: {
	searchParams?: string;
	onUrlUpdate?: (evento: UrlUpdateEvent) => void;
} = {}) {
	return render(
		<NuqsTestingAdapter
			searchParams={searchParams}
			hasMemory
			resetUrlUpdateQueueOnMount={false}
			onUrlUpdate={onUrlUpdate}
		>
			<CampanhaFilter opcoes={OPCOES} />
		</NuqsTestingAdapter>,
	);
}

/** A última URL que o componente escreveu. */
function ultimaCampanha(atualizacoes: UrlUpdateEvent[]): string | null {
	return atualizacoes.at(-1)?.searchParams.get("campanha") ?? null;
}

afterEach(() => {
	cleanup();
});

describe("o filtro de campanha escreve a lista na URL", () => {
	it("escolher duas campanhas usa UM parâmetro separado por vírgula", async () => {
		const atualizacoes: UrlUpdateEvent[] = [];
		montar({ onUrlUpdate: (evento) => atualizacoes.push(evento) });

		fireEvent.click(screen.getByRole("button", { name: /Campanha/ }));
		fireEvent.click(await screen.findByRole("button", { name: "Verão 2026" }));
		fireEvent.click(await screen.findByRole("button", { name: "Inverno 2026" }));

		await waitFor(() => expect(ultimaCampanha(atualizacoes)).toBe("camp-1,camp-2"));
	});

	it("tirar uma campanha mantém as outras", async () => {
		const atualizacoes: UrlUpdateEvent[] = [];
		montar({
			searchParams: "?campanha=camp-1,camp-2",
			onUrlUpdate: (evento) => atualizacoes.push(evento),
		});

		fireEvent.click(screen.getByLabelText("Remover a campanha Verão 2026"));

		await waitFor(() => expect(ultimaCampanha(atualizacoes)).toBe("camp-2"));
	});

	it("tirar a última campanha REMOVE o parâmetro — não escreve `campanha=` vazio", async () => {
		const atualizacoes: UrlUpdateEvent[] = [];
		montar({
			searchParams: "?campanha=camp-1",
			onUrlUpdate: (evento) => atualizacoes.push(evento),
		});

		fireEvent.click(screen.getByLabelText("Remover a campanha Verão 2026"));

		await waitFor(() => expect(atualizacoes.at(-1)?.searchParams.has("campanha")).toBe(false));
	});
});

describe("o recorte de campanha vem da URL", () => {
	it("um carregamento novo com a mesma URL mostra o mesmo filtro (sobrevive à navegação)", () => {
		const primeiro = montar({ searchParams: "?campanha=camp-1,camp-3" });
		expect(screen.getByLabelText("Remover a campanha Verão 2026")).toBeTruthy();
		expect(screen.getByLabelText("Remover a campanha Remarketing")).toBeTruthy();
		// O gatilho anuncia quantas campanhas estão ativas.
		expect(screen.getByRole("button", { name: /Campanha\s*2/ })).toBeTruthy();
		primeiro.unmount();

		// "Navegar" é montar de novo com a URL que o link carrega — a memória do
		// componente não existe, e o recorte continua ali porque veio da URL.
		montar({ searchParams: "?campanha=camp-1,camp-3" });
		expect(screen.getByLabelText("Remover a campanha Verão 2026")).toBeTruthy();
		expect(screen.getByLabelText("Remover a campanha Remarketing")).toBeTruthy();
	});

	it("a URL vazia abre sem campanha escolhida", () => {
		montar();
		expect(screen.queryByLabelText(/Remover a campanha/)).toBeNull();
	});

	it("'Limpar campanhas' tira todas de uma vez", async () => {
		const atualizacoes: UrlUpdateEvent[] = [];
		montar({
			searchParams: "?campanha=camp-1,camp-2",
			onUrlUpdate: (evento) => atualizacoes.push(evento),
		});

		fireEvent.click(screen.getByRole("button", { name: /Campanha/ }));
		fireEvent.click(await screen.findByRole("button", { name: "Limpar campanhas" }));

		await waitFor(() => expect(atualizacoes.at(-1)?.searchParams.has("campanha")).toBe(false));
	});
});
