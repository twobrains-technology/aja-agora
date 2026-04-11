import { tool } from "ai";
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
 * Creates all domain tools connected to the current adapter.
 * Tool descriptions are in Portuguese to guide Claude's tool selection
 * for Brazilian users.
 */
export function createDomainTools() {
	const adapter = getAdapter();

	return {
		search_groups: tool({
			description:
				"Busca grupos de consorcio disponiveis por categoria e faixa de credito. Use quando o usuario mencionar o que quer comprar (carro, casa, servico) ou quanto quer gastar.",
			inputSchema: searchGroupsInput,
			execute: async (params) => {
				const groups = await adapter.searchGroups(params);
				return { groups, total: groups.length };
			},
		}),

		simulate_quota: tool({
			description:
				"Simula parcela mensal, taxa de administracao, fundo de reserva e prazo para um grupo especifico com um valor de credito. Use apos o usuario escolher ou perguntar sobre um grupo.",
			inputSchema: simulateQuotaInput,
			execute: async (params) => {
				return adapter.simulateQuota(params);
			},
		}),

		get_rates: tool({
			description:
				"Retorna taxas de administracao vigentes por administradora e categoria. Use quando o usuario perguntar sobre taxas, custos ou quiser comparar administradoras.",
			inputSchema: getRatesInput,
			execute: async (params) => {
				const rates = await adapter.getRates(params);
				return { rates, total: rates.length };
			},
		}),

		get_group_details: tool({
			description:
				"Retorna detalhes completos de um grupo incluindo historico de contemplacao e proximas assembleias. Use quando o usuario quiser saber mais sobre um grupo especifico.",
			inputSchema: getGroupDetailsInput,
			execute: async (params) => {
				return adapter.getGroupDetails(params);
			},
		}),

		recommend_groups: tool({
			description:
				"Analisa e ranqueia grupos por compatibilidade com o perfil do usuario. Use quando tiver informacoes suficientes sobre orcamento e prazo desejado para fazer uma recomendacao.",
			inputSchema: z.object({
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
					.optional()
					.default(0)
					.describe("Prazo desejado em meses (0 = sem preferencia)"),
			}),
			execute: async (params) => {
				const { budget, desiredTermMonths, ...searchParams } = params;
				const groups = await adapter.searchGroups(searchParams);
				const ranked = rankGroups(groups, {
					budget,
					desiredTermMonths: desiredTermMonths ?? 0,
				});
				return {
					recommendations: ranked.map((r) => ({
						...r.group,
						score: r.score,
						scoreBreakdown: r.factors,
					})),
					total: ranked.length,
				};
			},
		}),
	};
}
