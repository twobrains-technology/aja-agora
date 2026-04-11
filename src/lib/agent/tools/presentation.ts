import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

/**
 * Presentation tools — these don't fetch data, they instruct the frontend
 * to render structured artifacts inline in the chat.
 *
 * Convention: tool name starts with "present_" so the route can detect them.
 * The _artifact field in the return value is intercepted by the route to emit
 * artifact SSE events.
 */

export const presentGroupCard = tool(
	"present_group_card",
	"Apresenta um grupo de consorcio como card visual interativo para o usuario. Use SEMPRE apos buscar grupos com search_groups para mostrar cada grupo como um card clicavel. Passe os dados exatos retornados pela busca.",
	{
		id: z.string().describe("ID do grupo (UUID)"),
		administradora: z.string().describe("Nome da administradora"),
		category: z
			.enum(["imovel", "auto", "servicos"])
			.describe("Categoria do bem"),
		creditValue: z.number().describe("Valor do credito em reais"),
		monthlyPayment: z.number().describe("Parcela mensal estimada em reais"),
		adminFeePercent: z
			.number()
			.describe("Taxa de administracao em percentual"),
		termMonths: z.number().int().describe("Prazo em meses"),
		availableSlots: z.number().int().describe("Vagas disponiveis"),
		contemplationRate: z
			.number()
			.describe("Taxa media de contemplacao por assembleia"),
	},
	async (args) => {
		return {
			content: [
				{
					type: "text" as const,
					text: `[Card do grupo ${args.administradora} - ${args.category} - R$ ${args.creditValue.toLocaleString("pt-BR")} apresentado ao usuario]`,
				},
			],
			_artifact: { type: "group_card", payload: args },
		};
	},
);

export const presentComparisonTable = tool(
	"present_comparison_table",
	"Apresenta uma tabela comparativa entre multiplos grupos de consorcio. Use quando o usuario pedir para comparar opcoes ou quando voce quiser mostrar lado a lado as melhores opcoes encontradas. Passe um array de grupos e opcionalmente o indice do melhor.",
	{
		groups: z
			.array(
				z.object({
					id: z.string(),
					administradora: z.string(),
					category: z.enum(["imovel", "auto", "servicos"]),
					creditValue: z.number(),
					monthlyPayment: z.number(),
					adminFeePercent: z.number(),
					termMonths: z.number(),
					availableSlots: z.number(),
					contemplationRate: z.number(),
				}),
			)
			.describe("Array de grupos para comparar"),
		highlightBestIndex: z
			.number()
			.int()
			.optional()
			.describe("Indice (0-based) do grupo recomendado na tabela"),
	},
	async (args) => {
		return {
			content: [
				{
					type: "text" as const,
					text: `[Tabela comparativa com ${args.groups.length} grupos apresentada ao usuario]`,
				},
			],
			_artifact: { type: "comparison_table", payload: args },
		};
	},
);

export const presentSimulationResult = tool(
	"present_simulation_result",
	"Apresenta o resultado de uma simulacao de cota como card visual com breakdown de custos. Use SEMPRE apos chamar simulate_quota para mostrar os numeros de forma clara ao usuario.",
	{
		groupId: z.string().describe("ID do grupo simulado"),
		creditValue: z.number().describe("Valor do credito em reais"),
		monthlyPayment: z.number().describe("Parcela mensal em reais"),
		adminFee: z.number().describe("Taxa de administracao total em reais"),
		reserveFund: z.number().describe("Fundo de reserva total em reais"),
		insurance: z.number().describe("Seguro total em reais"),
		totalCost: z.number().describe("Custo total em reais"),
		termMonths: z.number().int().describe("Prazo em meses"),
		effectiveRate: z
			.number()
			.describe("Taxa efetiva total em percentual"),
	},
	async (args) => {
		return {
			content: [
				{
					type: "text" as const,
					text: `[Simulacao apresentada: parcela R$ ${args.monthlyPayment.toFixed(2)}/mes por ${args.termMonths} meses]`,
				},
			],
			_artifact: { type: "simulation_result", payload: args },
		};
	},
);
