import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DESTINO_DOS_CARDS } from "@/lib/agent/pi/cards-livres";
import { NOMES_DAS_TOOLS_LIVRES } from "@/lib/agent/pi/tools-livres";
import {
	buildCompareFinancingDirective,
	buildDetailDirective,
	buildGroupSelectedDirective,
	buildSimulateDirective,
	buildSimulatorDialDirective,
	buildTopicPickerAnswerDirective,
	buildTopicPickerBackDirective,
	buildViewScenariosDirective,
} from "./directives";

/** Uma carta real, do tamanho das que a busca devolve. */
const GROUP_ID = "6abfaeca-0000-0000-0000-0000000074cc";

/** Os cliques dos cards de cálculo (L16/P275, P140, P148, P170, P176): o que
 * cada botão antigo pede agora. `tipo` é o card de FATO que leva o número à tela
 * — o modelo só aponta a carta, o payload sai do servidor. */
const CLIQUES: Array<{
	diretiva: string;
	texto: () => string;
	tipo: string;
	groupId: string | null;
}> = [
	{
		diretiva: "buildSimulateDirective",
		texto: () => buildSimulateDirective("Canopus", GROUP_ID, 60000),
		tipo: "simulation_result",
		groupId: GROUP_ID,
	},
	{
		diretiva: "buildGroupSelectedDirective",
		texto: () => buildGroupSelectedDirective("Canopus", GROUP_ID, 60000, 48),
		tipo: "simulation_result",
		groupId: GROUP_ID,
	},
	{
		diretiva: "buildViewScenariosDirective",
		texto: () => buildViewScenariosDirective({ administradora: "Canopus", groupId: GROUP_ID }),
		tipo: "contemplation_dial",
		groupId: GROUP_ID,
	},
	{
		diretiva: "buildSimulatorDialDirective",
		texto: () => buildSimulatorDialDirective({ administradora: "Canopus", groupId: GROUP_ID }),
		tipo: "contemplation_dial",
		groupId: GROUP_ID,
	},
	{
		diretiva: "buildCompareFinancingDirective",
		texto: () =>
			buildCompareFinancingDirective({ administradora: "Canopus", currentCreditValue: 60000 }),
		tipo: "financing_comparison",
		groupId: null,
	},
	{
		diretiva: "buildDetailDirective",
		texto: () => buildDetailDirective(GROUP_ID),
		tipo: "group_card",
		groupId: GROUP_ID,
	},
];

describe("cliques dos cards de cálculo pedem a tool do vendedor livre (L16)", () => {
	it("mostrar_card é a tool que o vendedor livre recebe", () => {
		expect(NOMES_DAS_TOOLS_LIVRES).toContain("mostrar_card");
	});

	for (const clique of CLIQUES) {
		it(`${clique.diretiva}: pede mostrar_card "${clique.tipo}"`, () => {
			const texto = clique.texto();
			expect(texto).toContain("mostrar_card");
			expect(texto).toContain(`"${clique.tipo}"`);
			if (clique.groupId) expect(texto).toContain(clique.groupId);
		});

		it(`${clique.diretiva}: "${clique.tipo}" é card de FATO emitível — senão a instrução não tem como ser cumprida`, () => {
			const destino = DESTINO_DOS_CARDS[clique.tipo as keyof typeof DESTINO_DOS_CARDS];
			expect(destino).toEqual({ classe: "emitivel", origem: "fato" });
		});
	}

	it("o clique de cenários não promete o card `scenarios` (sem produtor): usa o simulador de contemplação", () => {
		const texto = buildViewScenariosDirective({ administradora: "Canopus", groupId: GROUP_ID });
		expect(texto).toContain("contemplation_dial");
		expect(texto).not.toContain(`"scenarios"`);
	});

	it("sem groupId o dial continua pedindo o id da carta — não inventa um grupo", () => {
		const texto = buildSimulatorDialDirective({ administradora: "Canopus" });
		expect(texto).toContain("contemplation_dial");
		expect(texto).toContain("o groupId da carta que ele escolheu");
		expect(texto).not.toMatch(/payload \{"groupId"/);
	});

	it("comparar com financiamento não manda calcular no texto: o número vem do card", () => {
		const texto = buildCompareFinancingDirective({
			administradora: "Canopus",
			currentCreditValue: 60000,
		});
		expect(texto).toContain("financing_comparison");
		expect(texto).toContain("taxa estimada");
	});
});

describe("L18 — a diretiva de tópico não espera mais o próximo gate", () => {
	const resposta = buildTopicPickerAnswerDirective("o que é lance?");
	const voltar = buildTopicPickerBackDirective();

	it("não promete passo automático: sem funil, ninguém encaminha a conversa", () => {
		expect(resposta).not.toMatch(/encaminha o pr[óo]ximo passo/i);
		expect(resposta).not.toMatch(/automaticamente/i);
		expect(voltar).not.toMatch(/encaminha o pr[óo]ximo passo/i);
	});

	it("devolve a condução ao vendedor livre — ele segue a venda na mesma mensagem", () => {
		expect(resposta).toContain("condução é sua");
		expect(voltar).toContain("retome você mesmo a conversa");
	});

	it("não proíbe mais tool nem a pergunta seguinte: era essa a espera do gate", () => {
		expect(resposta).not.toMatch(/N[ÃA]O chame nenhuma tool/i);
		expect(resposta).not.toMatch(/N[ÃA]O fa[çc]a nenhuma pergunta/i);
	});

	it("mantém o que era bom: responde só a dúvida, sem repetir a explicação geral", () => {
		expect(resposta).toContain("o que é lance?");
		expect(resposta).toContain("NÃO repita a explicação geral de consórcio");
		expect(resposta).toContain("NÃO reabra o menu de tópicos");
	});
});

describe("nenhuma diretiva cita tool que saiu do toolset", () => {
	// O texto das diretivas é obedecido ao pé da letra: citar `simulate_quota`
	// (ou qualquer nome apagado) vira `Tool not found`, e o modelo traduz isso ao
	// cliente como "tive um problema". Comentários ficam de fora — eles existem
	// justamente para registrar o que saiu e por quê.
	const fonte = readFileSync(new URL("./directives.ts", import.meta.url), "utf8")
		.split("\n")
		.filter((linha) => {
			const t = linha.trim();
			return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
		})
		.join("\n");

	const TOOLS_QUE_SAIRAM = [
		"simulate_quota",
		"simulate_contemplation",
		"compute_scenarios",
		"compare_with_financing",
		"get_group_details",
		"search_groups",
		"recommend_groups",
		"present_card",
	];

	for (const tool of TOOLS_QUE_SAIRAM) {
		it(`"${tool}" não aparece no texto de nenhuma diretiva`, () => {
			expect(fonte).not.toContain(tool);
		});
	}

	it("todo nome em snake_case no texto é tool viva ou tipo de card", () => {
		const vivos = new Set<string>([...NOMES_DAS_TOOLS_LIVRES, ...Object.keys(DESTINO_DOS_CARDS)]);
		const citados = new Set(
			[...fonte.matchAll(/\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/g)].map((m) => m[1] as string),
		);
		expect([...citados].filter((nome) => !vivos.has(nome))).toEqual([]);
	});
});
