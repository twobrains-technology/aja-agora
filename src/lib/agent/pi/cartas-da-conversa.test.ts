import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { GroupSummary } from "@/lib/adapters/types";
import type { CartaLivre } from "@/lib/agent/pi/tools-livres";
import { restaurarCartasDaConversa } from "./cartas-da-conversa";
import { buildToolsLivres, type ContextoDasTools } from "./tools-livres";

/** A tool do Pi chama `execute(input)`; o tipo do pacote `ai` declara dois parâmetros.
 * O cast é só para o teste chamar do jeito que o harness chama. */
type ExecutarTool = (input: { tipo: string; payload?: Record<string, unknown> }) => Promise<string>;

/** O que o turno 2 deixou no banco: a tabela que o cliente viu, com os números REAIS. */
const ARTEFATO_DO_TURNO_2 = {
	type: "comparison_table",
	payload: {
		groups: [
			{
				id: "6abfaeca-0000-0000-0000-0000000074cc",
				groupId: "6abfaeca-0000-0000-0000-0000000074cc",
				administradora: "Canopus",
				category: "auto",
				creditValue: 60000,
				monthlyPayment: 910,
				termMonths: 48,
				adminFeePercent: 0.22,
				availableSlots: 15,
			},
			{
				id: "outra-carta",
				administradora: "Bresser",
				category: "auto",
				creditValue: 45000,
				monthlyPayment: 700,
				termMonths: 48,
			},
			// Linha fabricada pelo modelo (sem número real): não restaura nada — é o
			// mesmo contrato de `isUsableGroup`.
			{ id: "linha-fabricada", administradora: "Canopus", category: "auto" },
		],
	},
};

const CANOPUS = "6abfaeca-0000-0000-0000-0000000074cc";

function ctxComCartas(cartas: { grupos: Map<string, GroupSummary>; cartas: CartaLivre[] }) {
	return {
		conversationId: "conv-teste",
		channel: "web",
		userText: "quero a da canopus",
		nomeDoCliente: null,
		cards: [],
		falasDoFecho: [],
		cartasNaTela: cartas.cartas,
		gruposRevelados: cartas.grupos,
		pediuHumano: false,
		estadoDepoisDaBusca: null,
	} as unknown as ContextoDasTools;
}

describe("cartas da conversa — o que o cliente já viu continua na tela no turno seguinte", () => {
	it("restaura a carta com o número que foi mostrado, e ignora linha sem número", () => {
		const { grupos, cartas } = restaurarCartasDaConversa([ARTEFATO_DO_TURNO_2]);
		expect([...grupos.keys()]).toEqual([CANOPUS, "outra-carta"]);
		expect(grupos.get(CANOPUS)).toMatchObject({
			administradora: "Canopus",
			creditValue: 60000,
			monthlyPayment: 910,
			termMonths: 48,
		});
		expect(cartas.map((c) => c.groupId)).toEqual([CANOPUS, "outra-carta"]);
	});

	it("mostrar_card de group_card no turno 4, SEM busca nova, mostra a carta da Canopus", async () => {
		let buscas = 0;
		const restaurado = restaurarCartasDaConversa([ARTEFATO_DO_TURNO_2]);
		const ctx = ctxComCartas(restaurado);
		const tools = buildToolsLivres(ctx, {
			buscarGrupos: async () => {
				buscas += 1;
				return [];
			},
			carregarLogos: async () => new Map(),
		});

		const r = await (tools.mostrar_card.execute as ExecutarTool)({
			tipo: "group_card",
			payload: { groupId: CANOPUS },
		});

		expect(String(r)).toContain("na tela");
		expect(ctx.cards[0]?.type).toBe("group_card");
		expect(ctx.cards[0]?.payload).toMatchObject({ creditValue: 60000, monthlyPayment: 910 });
		expect(buscas).toBe(0);
	});

	it("sem o que a conversa viu, a recusa continua — ela não some por bonzinho", async () => {
		const ctx = ctxComCartas({ grupos: new Map(), cartas: [] });
		const tools = buildToolsLivres(ctx, { carregarLogos: async () => new Map() });
		const r = await (tools.mostrar_card.execute as ExecutarTool)({
			tipo: "group_card",
			payload: { groupId: CANOPUS },
		});
		expect(String(r)).toContain("Card NÃO mostrado");
	});

	// A função pura não vale de nada se o turno não a chama: o índice é preenchido no
	// COMEÇO do turno, a partir do que a conversa mostrou. Esta guarda fica vermelha se
	// alguém voltar a deixar o índice vazio fora do turno da busca.
	it("o turno restaura o índice antes de o modelo falar", () => {
		const fonte = readFileSync(new URL("./turno-livre.ts", import.meta.url).pathname, "utf8");
		expect(fonte).toMatch(/restaurarCartasDaConversa\(await lerCartas\(conversationId\)\)/);
		expect(fonte).toMatch(/gruposRevelados: cartasRestauradas\.grupos/);
		expect(fonte).not.toMatch(/gruposRevelados: new Map\(\)/);
	});
});
