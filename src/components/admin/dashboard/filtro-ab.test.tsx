// @vitest-environment happy-dom
// @vitest-environment-options { "url": "http://localhost/admin/performance" }

// O filtro de recorte A/B grava o recorte nos DOIS lados — URL e cookie.
//
// O defeito de família que este arquivo protege é o mesmo que derrubou o período
// do painel: recorte de filtro guardado só na memória do componente. Ele não
// cabe num link (não sobrevive a "manda o link pro Bruno") e some na navegação
// (o menu monta `href` puro, sem querystring). Por isso o teste central não é
// "o clique mudou uma prop" — é "a URL passou a ter o par e o cookie também", e
// "um carregamento novo com essa URL mostra o mesmo recorte".
//
// O segundo contrato é o GENÉRICO (D4): o componente não conhece o teste do
// telefone. Um registro com dois experimentos injetado pela prop `registro`
// precisa produzir dois seletores sem nenhuma mudança de código — é o que prova
// que um teste novo entra só como entrada no registro.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NuqsTestingAdapter, type UrlUpdateEvent } from "nuqs/adapters/testing";
import { afterEach, describe, expect, it } from "vitest";
import {
	EXPERIMENTOS,
	type Experimento,
	PARAMETRO_DO_RECORTE_AB,
} from "@/lib/experimentos/registro";
import { FiltroAB } from "./filtro-ab";

/** O rótulo do seletor do experimento real. */
const SELETOR_REAL = "Recorte do Teste do telefone";

/** O id do experimento real — lido do REGISTRO, nunca redigitado (D4/C5). */
const ID_DO_EXPERIMENTO = EXPERIMENTOS[0].id;

/** Um segundo experimento, só para o teste — nenhum código o conhece. */
const EXPERIMENTO_FICTICIO: Experimento = {
	id: "precoNaVitrine",
	rotulo: "Teste do preço",
	bracos: ["controle", "variante"],
	rotulosDosBracos: {
		controle: "controle — preço cheio",
		variante: "variante — preço com desconto",
	},
	etapaAncora: "identificados",
};

function montar({
	searchParams = "",
	registro,
	onUrlUpdate,
}: {
	searchParams?: string;
	registro?: readonly Experimento[];
	onUrlUpdate?: (evento: UrlUpdateEvent) => void;
} = {}) {
	return render(
		<NuqsTestingAdapter
			searchParams={searchParams}
			hasMemory
			resetUrlUpdateQueueOnMount={false}
			onUrlUpdate={onUrlUpdate}
		>
			<FiltroAB registro={registro} />
		</NuqsTestingAdapter>,
	);
}

/** O último valor do parâmetro `ab` que o componente escreveu na URL. */
function ultimoRecorteNaUrl(atualizacoes: UrlUpdateEvent[]): string | null {
	return atualizacoes.at(-1)?.searchParams.get(PARAMETRO_DO_RECORTE_AB) ?? null;
}

/** Abre a lista do seletor de um experimento. */
async function abrir(nome: string | RegExp) {
	const gatilho = screen.getByLabelText(nome);
	fireEvent.click(gatilho);
	if (screen.queryAllByRole("option").length === 0) {
		// O Select do projeto é base-ui: além do clique, ele observa eventos de
		// ponteiro. Sem isto a lista não monta no `happy-dom`.
		fireEvent.pointerDown(gatilho, { pointerType: "mouse", button: 0 });
		fireEvent.pointerUp(gatilho, { pointerType: "mouse", button: 0 });
	}
	return await screen.findAllByRole("option");
}

/** Escolhe uma opção pelo texto acessível, abrindo a lista antes. */
async function escolher(seletor: string, opcao: string) {
	await abrir(seletor);
	const item = await screen.findByRole("option", { name: opcao });
	// O item do base-ui só comita a escolha quando está `highlighted`, e quem
	// destaca é o `mousemove` (o `focusItemOnHover` da lista). Sem o `mouseMove`
	// antes, o clique é ignorado em silêncio.
	fireEvent.mouseMove(item);
	fireEvent.click(item);
}

afterEach(() => {
	cleanup();
	// O cookie é estado GLOBAL do documento: sem limpar, um teste herda o recorte
	// do anterior e a falha aparece longe da causa.
	// biome-ignore lint/suspicious/noDocumentCookie: limpeza do estado do próprio teste.
	document.cookie = "aja_ab=; path=/; max-age=0";
});

describe("o seletor do registro real", () => {
	it("mostra Todas, os dois braços do teste e Sem variante — com os rótulos exatos", async () => {
		montar();

		await abrir(SELETOR_REAL);

		const opcoes = await screen.findAllByRole("option");
		expect(opcoes.map((opcao) => opcao.textContent)).toEqual([
			"Todas",
			"A — telefone antes das ofertas",
			"B — ofertas embaçadas",
			"Sem variante",
		]);
	});

	it("sem recorte não escreve rótulo na tela", () => {
		montar();
		expect(screen.queryByText(/^Recorte:/)).toBeNull();
	});
});

describe("a escolha grava a URL E o cookie de sessão", () => {
	it(`escolher A grava \`?ab=${ID_DO_EXPERIMENTO}:A\` e o cookie \`aja_ab\` sem \`max-age\``, async () => {
		const atualizacoes: UrlUpdateEvent[] = [];
		montar({ onUrlUpdate: (evento) => atualizacoes.push(evento) });

		await escolher(SELETOR_REAL, "A — telefone antes das ofertas");

		await waitFor(() => expect(ultimoRecorteNaUrl(atualizacoes)).toBe(`${ID_DO_EXPERIMENTO}:A`));
		const doCookie = document.cookie;
		expect(doCookie).toContain(`aja_ab=${encodeURIComponent(ID_DO_EXPERIMENTO)}%3AA`);
		expect(doCookie).not.toContain("max-age");
	});

	it("escolher Sem variante grava o balde no par", async () => {
		const atualizacoes: UrlUpdateEvent[] = [];
		montar({ onUrlUpdate: (evento) => atualizacoes.push(evento) });

		await escolher(SELETOR_REAL, "Sem variante");

		await waitFor(() =>
			expect(ultimoRecorteNaUrl(atualizacoes)).toBe(`${ID_DO_EXPERIMENTO}:sem-variante`),
		);
	});

	it("voltar para Todas REMOVE o parâmetro da URL e apaga o cookie", async () => {
		const atualizacoes: UrlUpdateEvent[] = [];
		montar({
			searchParams: `?ab=${ID_DO_EXPERIMENTO}:A`,
			onUrlUpdate: (evento) => atualizacoes.push(evento),
		});

		await escolher(SELETOR_REAL, "Todas");

		await waitFor(() =>
			expect(atualizacoes.at(-1)?.searchParams.has(PARAMETRO_DO_RECORTE_AB)).toBe(false),
		);
		expect(document.cookie).not.toContain(`aja_ab=${encodeURIComponent(ID_DO_EXPERIMENTO)}`);
	});
});

describe("o recorte vem da URL", () => {
	it("um carregamento novo com a mesma URL mostra o mesmo recorte (sobrevive à navegação)", () => {
		const primeiro = montar({ searchParams: `?ab=${ID_DO_EXPERIMENTO}:B` });
		expect(screen.getByText("Recorte: Teste do telefone · braço B")).toBeTruthy();
		primeiro.unmount();

		montar({ searchParams: `?ab=${ID_DO_EXPERIMENTO}:B` });
		expect(screen.getByText("Recorte: Teste do telefone · braço B")).toBeTruthy();
	});

	it("um par inválido na URL mostra Todas — não um recorte silencioso", () => {
		montar({ searchParams: `?ab=${ID_DO_EXPERIMENTO}:C` });
		expect(screen.queryByText(/^Recorte:/)).toBeNull();
		expect(screen.getByText("Todas")).toBeTruthy();
	});

	it("um experimento desconhecido na URL mostra Todas", () => {
		montar({ searchParams: "?ab=precoNaVitrine:controle" });
		expect(screen.queryByText(/^Recorte:/)).toBeNull();
	});

	it("o recorte ativo escreve o rótulo na tela", () => {
		montar({ searchParams: `?ab=${ID_DO_EXPERIMENTO}:sem-variante` });
		expect(screen.getByText("Recorte: Teste do telefone · sem variante")).toBeTruthy();
	});
});

describe("o recorte vem do cookie quando a URL não traz", () => {
	it("o cookie `aja_ab` da navegação anterior é adotado", async () => {
		// biome-ignore lint/suspicious/noDocumentCookie: o teste escreve o cookie que a navegação anterior deixou.
		document.cookie = `aja_ab=${encodeURIComponent(ID_DO_EXPERIMENTO)}%3AA; path=/`;

		montar();

		await waitFor(() =>
			expect(screen.getByText("Recorte: Teste do telefone · braço A")).toBeTruthy(),
		);
	});
});

describe("genérico por registro (D4)", () => {
	it("um registro com dois experimentos produz DOIS seletores, sem mudar o componente", () => {
		montar({ registro: [{ ...EXPERIMENTO_FICTICIO }, ...([] as Experimento[])] });

		expect(screen.getByLabelText("Recorte do Teste do preço")).toBeTruthy();
		expect(screen.queryByLabelText(SELETOR_REAL)).toBeNull();
	});

	it("com o registro real MAIS um fictício, os dois seletores convivem", async () => {
		montar({ registro: [...EXPERIMENTOS, EXPERIMENTO_FICTICIO] });

		expect(screen.getByLabelText(SELETOR_REAL)).toBeTruthy();
		expect(screen.getByLabelText("Recorte do Teste do preço")).toBeTruthy();
	});

	it("escolher num experimento preserva o recorte do outro", async () => {
		const atualizacoes: UrlUpdateEvent[] = [];
		montar({
			searchParams: `?ab=${ID_DO_EXPERIMENTO}:A`,
			registro: [...EXPERIMENTOS, EXPERIMENTO_FICTICIO],
			onUrlUpdate: (evento) => atualizacoes.push(evento),
		});

		await escolher("Recorte do Teste do preço", "variante — preço com desconto");

		await waitFor(() =>
			expect(ultimoRecorteNaUrl(atualizacoes)?.split(",").sort()).toEqual([
				"precoNaVitrine:variante",
				`${ID_DO_EXPERIMENTO}:A`,
			]),
		);
	});
});
