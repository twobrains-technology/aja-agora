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

export const presentLeadForm = tool(
	"present_lead_form",
	"Apresenta o formulario inline de captura de dados do lead (nome, telefone, email) no chat. Use quando o usuario demonstrar interesse em uma recomendacao de consorcio, por exemplo apos clicar 'Tenho interesse' no RecommendationCard.",
	{
		conversationId: z.string().optional().describe("ID da conversa atual (opcional — o frontend resolve automaticamente)"),
		recommendationId: z
			.string()
			.optional()
			.describe("ID da recomendacao que gerou o interesse"),
	},
	async (args) => {
		return {
			content: [
				{
					type: "text" as const,
					text: "[Formulario de captura de dados do lead apresentado ao usuario]",
				},
			],
			_artifact: { type: "lead_form", payload: args },
		};
	},
);

export const presentRecommendation = tool(
	"present_recommendation_card",
	"Apresenta a recomendacao final de consorcio com score de compatibilidade e botao de acao. Use apos chamar recommend_groups quando voce identificar o melhor grupo para o usuario. Inclua o score e breakdown dos fatores.",
	{
		id: z.string().describe("ID do grupo recomendado"),
		administradora: z.string().describe("Nome da administradora"),
		category: z
			.enum(["imovel", "auto", "servicos"])
			.describe("Categoria do bem"),
		creditValue: z.number().describe("Valor do credito em reais"),
		monthlyPayment: z.number().describe("Parcela mensal em reais"),
		adminFeePercent: z
			.number()
			.describe("Taxa de administracao em percentual"),
		termMonths: z.number().int().describe("Prazo em meses"),
		contemplationRate: z
			.number()
			.describe("Taxa media de contemplacao por assembleia"),
		score: z
			.number()
			.min(0)
			.max(1)
			.describe("Score de compatibilidade 0-1"),
		scoreBreakdown: z
			.object({
				monthlyFit: z
					.number()
					.describe("Score de adequacao ao orcamento 0-1"),
				contemplation: z
					.number()
					.describe("Score de taxa de contemplacao 0-1"),
				adminFee: z
					.number()
					.describe("Score de taxa de administracao 0-1"),
				termMatch: z
					.number()
					.describe("Score de adequacao ao prazo 0-1"),
			})
			.describe("Detalhamento do score por fator"),
	},
	async (args) => {
		return {
			content: [
				{
					type: "text" as const,
					text: `[Recomendacao apresentada: ${args.administradora} - ${args.category} - Score ${(args.score * 100).toFixed(0)}%]`,
				},
			],
			_artifact: { type: "recommendation_card", payload: args },
		};
	},
);

export const presentValuePicker = tool(
	"present_value_picker",
	"Apresenta um seletor interativo de valores com sliders para o usuario configurar orcamento, valor de credito, ou prazo. Use em vez de perguntar valores por texto — o usuario arrasta os sliders e clica em 'Buscar opcoes'. SEMPRE use isso quando precisar que o usuario informe valores numericos.",
	{
		category: z
			.enum(["imovel", "auto", "servicos"])
			.describe("Categoria do bem para personalizar o visual"),
		fields: z.array(
			z.object({
				id: z.string().describe("Identificador do campo (ex: creditValue, monthlyBudget, term)"),
				label: z.string().describe("Label visivel para o usuario (ex: Valor do credito)"),
				min: z.number().describe("Valor minimo do slider"),
				max: z.number().describe("Valor maximo do slider"),
				step: z.number().describe("Incremento do slider"),
				default: z.number().describe("Valor inicial padrao"),
				format: z
					.enum(["currency", "months"])
					.optional()
					.describe("Formato de exibicao do valor"),
			}),
		).describe("Campos/sliders a exibir no seletor"),
	},
	async (args) => {
		return {
			content: [
				{
					type: "text" as const,
					text: `[Seletor de valores apresentado para ${args.category}]`,
				},
			],
			_artifact: { type: "value_picker", payload: args },
		};
	},
);
