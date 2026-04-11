import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { getAdapter } from "@/lib/adapters";
import { rankGroups } from "@/lib/agent/recommendation";
import {
	searchGroupsInput,
	simulateQuotaInput,
	getRatesInput,
	getGroupDetailsInput,
} from "./schemas";

/**
 * Domain tools for the consórcio agent.
 * Defined using Claude Agent SDK's tool() helper with Zod schemas.
 * Wrapped in an in-process MCP server for use with query().
 */

const searchGroups = tool(
	"search_groups",
	"Busca grupos de consorcio disponiveis por categoria e faixa de credito. Use quando o usuario mencionar o que quer comprar (carro, casa, servico) ou quanto quer gastar.",
	{
		category: searchGroupsInput.shape.category,
		creditMin: searchGroupsInput.shape.creditMin,
		creditMax: searchGroupsInput.shape.creditMax,
	},
	async (args) => {
		const adapter = getAdapter();
		const groups = await adapter.searchGroups(args);
		return {
			content: [
				{
					type: "text" as const,
					text: JSON.stringify({ groups, total: groups.length }),
				},
			],
		};
	},
	{ annotations: { readOnlyHint: true } },
);

const simulateQuota = tool(
	"simulate_quota",
	"Simula parcela mensal, taxa de administracao, fundo de reserva e prazo para um grupo especifico com um valor de credito. Use apos o usuario escolher ou perguntar sobre um grupo.",
	{
		groupId: simulateQuotaInput.shape.groupId,
		creditValue: simulateQuotaInput.shape.creditValue,
	},
	async (args) => {
		const adapter = getAdapter();
		const result = await adapter.simulateQuota(args);
		return {
			content: [{ type: "text" as const, text: JSON.stringify(result) }],
		};
	},
	{ annotations: { readOnlyHint: true } },
);

const getRates = tool(
	"get_rates",
	"Retorna taxas de administracao vigentes por administradora e categoria. Use quando o usuario perguntar sobre taxas, custos ou quiser comparar administradoras.",
	{
		administradora: getRatesInput.shape.administradora,
		category: getRatesInput.shape.category,
	},
	async (args) => {
		const adapter = getAdapter();
		const rates = await adapter.getRates(args);
		return {
			content: [
				{
					type: "text" as const,
					text: JSON.stringify({ rates, total: rates.length }),
				},
			],
		};
	},
	{ annotations: { readOnlyHint: true } },
);

const getGroupDetails = tool(
	"get_group_details",
	"Retorna detalhes completos de um grupo incluindo historico de contemplacao e proximas assembleias. Use quando o usuario quiser saber mais sobre um grupo especifico.",
	{
		groupId: getGroupDetailsInput.shape.groupId,
	},
	async (args) => {
		const adapter = getAdapter();
		const details = await adapter.getGroupDetails(args);
		return {
			content: [{ type: "text" as const, text: JSON.stringify(details) }],
		};
	},
	{ annotations: { readOnlyHint: true } },
);

const recommendGroups = tool(
	"recommend_groups",
	"Analisa e ranqueia grupos por compatibilidade com o perfil do usuario. Use quando tiver informacoes suficientes sobre orcamento e prazo desejado para fazer uma recomendacao.",
	{
		category: z
			.enum(["imovel", "auto", "servicos"])
			.describe("Categoria do bem: imovel, automovel ou servicos"),
		creditMin: z
			.number()
			.min(0)
			.optional()
			.describe("Valor minimo de credito em reais"),
		creditMax: z
			.number()
			.positive()
			.optional()
			.describe("Valor maximo de credito em reais"),
		budget: z
			.number()
			.positive()
			.describe("Orcamento mensal do usuario em reais"),
		desiredTermMonths: z
			.number()
			.int()
			.min(0)
			.default(0)
			.describe("Prazo desejado em meses (0 = sem preferencia)"),
	},
	async (args) => {
		const adapter = getAdapter();
		const { budget, desiredTermMonths, ...searchParams } = args;
		const groups = await adapter.searchGroups(searchParams);
		const ranked = rankGroups(groups, {
			budget,
			desiredTermMonths: desiredTermMonths ?? 0,
		});
		const recommendations = ranked.map((r) => ({
			...r.group,
			score: r.score,
			scoreBreakdown: r.factors,
		}));
		return {
			content: [
				{
					type: "text" as const,
					text: JSON.stringify({
						recommendations,
						total: ranked.length,
					}),
				},
			],
		};
	},
	{ annotations: { readOnlyHint: true } },
);

/**
 * In-process MCP server with all domain tools.
 * Passed to query() via mcpServers option.
 */
export const consorcioServer = createSdkMcpServer({
	name: "consorcio",
	version: "1.0.0",
	tools: [searchGroups, simulateQuota, getRates, getGroupDetails, recommendGroups],
});
