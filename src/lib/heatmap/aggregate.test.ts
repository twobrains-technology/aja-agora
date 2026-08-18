import { describe, expect, it } from "vitest";
import { montarAlvos, montarFunilDeSecoes } from "./aggregate";

/** O funil sempre devolve as 11 seções, então o teste procura pela seção, não por índice. */
function degrau(funil: ReturnType<typeof montarFunilDeSecoes>, section: string) {
	const achado = funil.find((f) => f.section === section);
	if (!achado) throw new Error(`seção ausente do funil: ${section}`);
	return achado;
}

describe("montarFunilDeSecoes", () => {
	it("usa a PRIMEIRA seção com audiência como base — 100% é quem olhou, não quem carregou", () => {
		// Carregar a página e ver o topo não é a mesma coisa: aba aberta em segundo
		// plano nunca dispara `section_view`. Ancorar em quem viu a primeira seção é
		// o único denominador que fala de gente que olhou.
		const funil = montarFunilDeSecoes(
			[
				{ section: "kv-hero", visitantes: 200 },
				{ section: "kv-journey", visitantes: 150 },
				{ section: "kv-faq", visitantes: 50 },
			],
			"/",
		);

		expect(degrau(funil, "kv-hero")).toMatchObject({ visitantes: 200, pct: 100 });
		expect(degrau(funil, "kv-journey").pct).toBe(75);
		expect(degrau(funil, "kv-faq").pct).toBe(25);
	});

	it("respeita a ordem da landing, não a ordem que o banco devolveu", () => {
		const funil = montarFunilDeSecoes(
			[
				{ section: "kv-footer", visitantes: 10 },
				{ section: "kv-hero", visitantes: 100 },
				{ section: "kv-tipos", visitantes: 60 },
			],
			"/",
		);

		const comAudiencia = funil.filter((f) => f.visitantes > 0).map((f) => f.section);

		expect(comAudiencia).toEqual(["kv-hero", "kv-tipos", "kv-footer"]);
	});

	it("mostra a queda entre uma seção e a anterior — é onde a página perde a pessoa", () => {
		const funil = montarFunilDeSecoes(
			[
				{ section: "kv-hero", visitantes: 100 },
				{ section: "kv-journey", visitantes: 90 },
				{ section: "kv-tipos", visitantes: 30 },
			],
			"/",
		);

		expect(degrau(funil, "kv-journey").quedaPct).toBe(10);
		// A queda brusca é a informação: 67% da audiência some entre journey e tipos.
		expect(degrau(funil, "kv-tipos").quedaPct).toBeCloseTo(66.7, 1);
	});

	it("não inventa queda na primeira seção com audiência", () => {
		// `kv-menu` é barra fixa e costuma vir zerada no funil de scroll. A seção
		// seguinte não pode reportar queda de 100% por causa disso.
		const funil = montarFunilDeSecoes(
			[
				{ section: "kv-hero", visitantes: 100 },
				{ section: "kv-journey", visitantes: 80 },
			],
			"/",
		);

		expect(degrau(funil, "kv-hero").quedaPct).toBe(0);
		expect(degrau(funil, "kv-journey").quedaPct).toBe(20);
	});

	it("acusa a queda UMA vez, e não em cada seção zerada da cauda", () => {
		// Visto no banco real em 17/08/2026: com a audiência morrendo em
		// `kv-depoimentos`, as quatro seções seguintes reportavam −100% cada uma. A
		// página perdeu a pessoa num lugar só; quatro alarmes em vermelho fariam o
		// operador procurar quatro defeitos onde existe um.
		const funil = montarFunilDeSecoes(
			[
				{ section: "kv-hero", visitantes: 10 },
				{ section: "kv-numbers", visitantes: 10 },
			],
			"/",
		);

		expect(degrau(funil, "kv-depoimentos").quedaPct).toBe(100);
		expect(degrau(funil, "kv-confianca").quedaPct).toBe(0);
		expect(degrau(funil, "kv-comparacao").quedaPct).toBe(0);
		expect(degrau(funil, "kv-footer").quedaPct).toBe(0);
	});

	it("preenche com zero a seção que ninguém alcançou, em vez de omiti-la", () => {
		// Seção ausente da lista significa "ninguém chegou lá" — e essa é a
		// informação mais importante do funil. Sumir com a linha esconderia isso.
		const funil = montarFunilDeSecoes([{ section: "kv-hero", visitantes: 100 }], "/");

		expect(funil).toHaveLength(11);
		expect(funil.at(-1)).toMatchObject({ section: "kv-footer", visitantes: 0, pct: 0 });
	});

	it("não divide por zero quando o período não teve visitante nenhum", () => {
		const funil = montarFunilDeSecoes([], "/");

		expect(funil).toHaveLength(11);
		expect(funil.every((f) => f.pct === 0 && f.quedaPct === 0)).toBe(true);
	});

	it("ignora seção desconhecida vinda do banco", () => {
		const funil = montarFunilDeSecoes(
			[
				{ section: "kv-hero", visitantes: 100 },
				{ section: "secao-que-nao-existe-mais", visitantes: 999 },
			],
			"/",
		);

		expect(funil.some((f) => f.section === "secao-que-nao-existe-mais")).toBe(false);
	});

	it("monta o funil da vertical com as seções DELA, não com as da home", () => {
		// `/motos` não tem `kv-journey` nem `bloco-upgrade`. Se o funil fosse único,
		// a tela mostraria degraus zerados que aquela página nunca teve — e degrau
		// zerado é exatamente o que o operador lê como "aqui perdemos todo mundo".
		const funil = montarFunilDeSecoes(
			[
				{ section: "hero-vertical", visitantes: 80 },
				{ section: "kv-faq", visitantes: 20 },
			],
			"/motos",
		);

		expect(funil.map((f) => f.section)).toEqual([
			"kv-menu",
			"hero-vertical",
			"faixa-numeros",
			"bloco-passos",
			"kv-faq",
			"kv-footer",
		]);
		expect(degrau(funil, "hero-vertical").pct).toBe(100);
		expect(degrau(funil, "kv-faq").pct).toBe(25);
	});

	it("devolve vazio para página que não tem mapa, em vez de inventar funil", () => {
		expect(montarFunilDeSecoes([{ section: "kv-hero", visitantes: 10 }], "/termos-de-uso")).toEqual(
			[],
		);
	});
});

describe("montarAlvos", () => {
	it("ordena por clique e calcula a fatia de cada alvo", () => {
		const alvos = montarAlvos([
			{ selector: "b", label: "Ver ofertas", section: "kv-tipos", cliques: 30, rageCliques: 0 },
			{ selector: "a", label: "Simular agora", section: "kv-hero", cliques: 70, rageCliques: 0 },
		]);

		expect(alvos[0]).toMatchObject({ label: "Simular agora", cliques: 70, sharePct: 70 });
		expect(alvos[1]).toMatchObject({ label: "Ver ofertas", sharePct: 30 });
	});

	it("marca como suspeito o alvo onde a raiva passa de um terço dos cliques", () => {
		// É o sinal que aponta DEFEITO, não preferência: algo parece clicável e não
		// responde. Vale mais que a nuvem de calor inteira.
		const alvos = montarAlvos([
			{ selector: "a", label: "Simular agora", section: "kv-hero", cliques: 100, rageCliques: 2 },
			{ selector: "c", label: "Card do plano", section: "kv-tipos", cliques: 10, rageCliques: 7 },
		]);

		expect(alvos.find((a) => a.label === "Simular agora")?.suspeito).toBe(false);
		expect(alvos.find((a) => a.label === "Card do plano")?.suspeito).toBe(true);
	});

	it("dá nome ao alvo sem rótulo em vez de mostrar linha vazia no painel", () => {
		const alvos = montarAlvos([
			{ selector: "main>div[2]>img[0]", label: "", section: "kv-hero", cliques: 5, rageCliques: 0 },
		]);

		expect(alvos[0].label).toBe("main>div[2]>img[0]");
	});

	it("devolve lista vazia sem quebrar quando não houve clique", () => {
		expect(montarAlvos([])).toEqual([]);
	});
});
