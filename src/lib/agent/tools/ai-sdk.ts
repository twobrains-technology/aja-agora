/**
 * Domain tools in Vercel AI SDK v6 format.
 * Direct replacement for Agent SDK tools — same logic, ~10x faster
 * because streamText() uses the Messages API directly (no subprocess).
 *
 * AI SDK v6 uses `inputSchema` (not `parameters`) and Zod schemas
 * are accepted directly as FlexibleSchema.
 */
import { tool } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { getAdapter } from "@/lib/adapters";
import { createLeadFromConversation } from "@/lib/admin/lead-stage-tracker";
import { rankGroups, recommendWithFallback } from "@/lib/agent/recommendation";
import { computeScenarios } from "@/lib/agent/scenarios";
import { compareWithFinancing, DEFAULT_FINANCING_RATES } from "@/lib/finance/pmt";
import {
	getGroupDetailsInput,
	getRatesInput,
	searchGroupsInput,
	simulateQuotaInput,
} from "./schemas";

// ---- Presentation tool schemas (reused across definition + route) ----

const groupCardSchema = z.object({
	id: z.string().describe("ID do grupo (UUID)"),
	administradora: z.string().describe("Nome da administradora"),
	category: z.enum(["imovel", "auto", "moto", "servicos"]).describe("Categoria do bem"),
	creditValue: z.number().describe("Valor do credito em reais"),
	monthlyPayment: z.number().describe("Parcela mensal estimada em reais"),
	adminFeePercent: z.number().describe("Taxa de administracao em percentual"),
	termMonths: z.number().int().describe("Prazo em meses"),
	availableSlots: z.number().int().describe("Vagas disponiveis"),
	contemplationRate: z.number().describe("Taxa media de contemplacao por assembleia"),
});

const comparisonTableSchema = z.object({
	groups: z
		.array(
			groupCardSchema.omit({ availableSlots: true, contemplationRate: true }).extend({
				availableSlots: z.number(),
				contemplationRate: z.number(),
			}),
		)
		.describe("Array de grupos para comparar"),
	highlightBestIndex: z.number().int().optional().describe("Indice (0-based) do grupo recomendado"),
});

const simulationResultSchema = z.object({
	groupId: z.string().describe("ID do grupo simulado"),
	administradora: z.string().describe("Nome da administradora do grupo (vem do search_groups)"),
	category: z
		.enum(["imovel", "auto", "moto", "servicos"])
		.describe("Categoria do bem (define indice de correcao prevista: imovel=INCC, auto=IPCA)"),
	creditValue: z.number().describe("Valor do credito em reais"),
	monthlyPayment: z.number().describe("Parcela mensal em reais"),
	adminFee: z.number().describe("Taxa de administracao total em reais"),
	reserveFund: z.number().describe("Fundo de reserva total em reais"),
	insurance: z.number().describe("Seguro total em reais"),
	totalCost: z.number().describe("Custo total em reais"),
	termMonths: z.number().int().describe("Prazo em meses"),
	effectiveRate: z.number().describe("Taxa efetiva total em percentual"),
	lanceScenario: z
		.object({
			lancePercent: z.number().describe("Percentual do credito ofertado como lance"),
			expectedTermMonths: z
				.number()
				.int()
				.describe("Prazo esperado ate contemplacao com esse lance"),
		})
		.optional()
		.describe("Cenario projetado com lance (bug #10)"),
	expectedAdjustment: z
		.object({
			index: z.enum(["INCC", "IPCA"]).describe("Indice de correcao previsto"),
			annualPercent: z.number().describe("Percentual anual estimado"),
		})
		.optional()
		.describe("Correcao prevista da carta — INCC pra imovel, IPCA pra auto (bug #10)"),
	actions: z
		.array(
			z.object({
				label: z.string().describe("Texto visivel do botao (ex: 'Ajustar valor')"),
				intent: z
					.string()
					.describe(
						"Intent enviado ao agente ao clicar (ex: 'adjust_value', 'new_simulation', 'compare_other')",
					),
			}),
		)
		.optional()
		.describe("CTAs explicitas pro fechamento (bug #12)"),
});

const recommendationSchema = z.object({
	id: z.string().describe("ID do grupo recomendado"),
	administradora: z.string().describe("Nome da administradora"),
	category: z.enum(["imovel", "auto", "moto", "servicos"]).describe("Categoria do bem"),
	creditValue: z.number().describe("Valor do credito em reais"),
	monthlyPayment: z.number().describe("Parcela mensal em reais"),
	adminFeePercent: z.number().describe("Taxa de administracao em percentual"),
	termMonths: z.number().int().describe("Prazo em meses"),
	contemplationRate: z.number().describe("Taxa media de contemplacao por assembleia"),
	score: z.number().min(0).max(1).describe("Score de compatibilidade 0-1"),
	scoreBreakdown: z
		.object({
			monthlyFit: z.number().describe("Score de adequacao ao orcamento 0-1"),
			contemplation: z.number().describe("Score de taxa de contemplacao 0-1"),
			adminFee: z.number().describe("Score de taxa de administracao 0-1"),
			termMatch: z.number().describe("Score de adequacao ao prazo 0-1"),
		})
		.describe("Detalhamento do score por fator"),
});

const leadFormSchema = z.object({
	conversationId: z
		.string()
		.optional()
		.describe("ID da conversa atual (opcional — o frontend resolve automaticamente)"),
	recommendationId: z.string().optional().describe("ID da recomendacao que gerou o interesse"),
});

const valuePickerSchema = z.object({
	category: z
		.enum(["imovel", "auto", "moto", "servicos"])
		.describe("Categoria do bem para personalizar o visual"),
	fields: z
		.array(
			z.object({
				id: z.string().describe("Identificador do campo (ex: creditValue, monthlyBudget, term)"),
				label: z.string().describe("Label visivel para o usuario (ex: Valor do credito)"),
				min: z.number().describe("Valor minimo do slider"),
				max: z.number().describe("Valor maximo do slider"),
				step: z.number().describe("Incremento do slider"),
				default: z.number().describe("Valor inicial padrao"),
				format: z.enum(["currency", "months"]).optional().describe("Formato de exibicao do valor"),
			}),
		)
		.describe("Campos/sliders a exibir no seletor"),
});

const captureLeadSchema = z.object({
	conversationId: z.string().describe("ID da conversa atual"),
	name: z.string().min(2).describe("Nome completo do lead"),
	phone: z.string().describe("Telefone do lead (DDD + numero)"),
	email: z.string().email().describe("Email do lead"),
});

const scenariosSchema = z.object({
	creditValue: z.number().positive().describe("Valor do credito em reais"),
	termMonths: z.number().int().positive().describe("Prazo nominal do consorcio em meses"),
});

const topicPickerSchema = z.object({
	prompt: z
		.string()
		.optional()
		.describe("Frase curta antes dos chips (ex: 'Sobre o que voce gostaria de saber?')"),
	topics: z.array(z.string().min(1)).min(2).max(5).describe("Lista de topicos clicaveis (2-5)"),
	includeBackButton: z
		.boolean()
		.default(true)
		.describe("Se true, mostra botao 'Voltar' que retorna ao estado anterior (#06)"),
});

const compareWithFinancingSchema = z.object({
	category: z
		.enum(["imovel", "auto", "moto", "servicos"])
		.describe("Categoria do bem (define taxa CET padrao)"),
	creditValue: z.number().positive().describe("Valor do credito em reais"),
	termMonths: z.number().int().positive().describe("Prazo do consorcio em meses"),
	consorcioMonthlyPayment: z
		.number()
		.describe("Parcela mensal do consorcio (vem de simulate_quota)"),
	consorcioTotalCost: z.number().describe("Custo total do consorcio (vem de simulate_quota)"),
	annualRateOverride: z
		.number()
		.optional()
		.describe(
			"Override da taxa CET anual do financiamento. Default: imovel 10%, auto 22%, moto 28%, servicos 25%.",
		),
});

const recommendGroupsSchema = z.object({
	category: z
		.enum(["imovel", "auto", "moto", "servicos"])
		.describe("Categoria do bem: imovel, automovel ou servicos"),
	creditMin: z.number().min(0).optional().describe("Valor minimo de credito em reais"),
	creditMax: z.number().positive().optional().describe("Valor maximo de credito em reais"),
	budget: z.number().positive().describe("Orcamento mensal do usuario em reais"),
	desiredTermMonths: z
		.number()
		.int()
		.min(0)
		.default(0)
		.describe("Prazo desejado em meses (0 = sem preferencia)"),
});

// ---- Domain tools (data fetching) ----

export const consorcioTools = {
	search_groups: tool({
		description:
			"Busca grupos de consorcio disponiveis por categoria e faixa de credito. Use quando o usuario mencionar o que quer comprar (carro, casa, servico) ou quanto quer gastar.",
		inputSchema: searchGroupsInput,
		execute: async (args: z.infer<typeof searchGroupsInput>) => {
			const adapter = getAdapter();
			const groups = await adapter.searchGroups(args);
			return { groups, total: groups.length };
		},
	}),

	simulate_quota: tool({
		description:
			'Simula parcela mensal, taxa de administracao, fundo de reserva e prazo para um grupo especifico com um valor de credito. Use apos o usuario escolher ou perguntar sobre um grupo. **REGRA Bv2-08**: por default use o creditValue NOMINAL do grupo (o que apareceu no comparativo/search_groups). Use creditValue diferente APENAS se o usuario pediu what-if explicito (ex: "e se fosse 200k?"). Quando creditValue divergir >1% do nominal, o sistema retorna creditAdjustmentNotice — voce DEVE relatar o ajuste pro user na sua resposta.',
		inputSchema: simulateQuotaInput,
		execute: async (args: z.infer<typeof simulateQuotaInput>) => {
			const adapter = getAdapter();
			const [details, simulation] = await Promise.all([
				adapter.getGroupDetails({ groupId: args.groupId }),
				adapter.simulateQuota(args),
			]);
			const delta = Math.abs(args.creditValue - details.creditValue);
			const relativeDelta = delta / details.creditValue;
			if (delta > 1 && relativeDelta > 0.01) {
				const fmt = (n: number) =>
					n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
				return {
					...simulation,
					creditAdjustmentNotice: {
						requestedCreditValue: args.creditValue,
						groupNominalCreditValue: details.creditValue,
						message: `Simulacao ajustada de ${fmt(details.creditValue)} (nominal do grupo) para ${fmt(args.creditValue)} (valor solicitado). Informe esse ajuste ao usuario antes de apresentar o resultado.`,
					},
				};
			}
			return simulation;
		},
	}),

	get_rates: tool({
		description:
			"Retorna taxas de administracao vigentes por administradora e categoria. Use quando o usuario perguntar sobre taxas, custos ou quiser comparar administradoras.",
		inputSchema: getRatesInput,
		execute: async (args: z.infer<typeof getRatesInput>) => {
			const adapter = getAdapter();
			const rates = await adapter.getRates(args);
			return { rates, total: rates.length };
		},
	}),

	get_group_details: tool({
		description:
			"Retorna detalhes completos de um grupo incluindo historico de contemplacao e proximas assembleias. Use quando o usuario quiser saber mais sobre um grupo especifico.",
		inputSchema: getGroupDetailsInput,
		execute: async (args: z.infer<typeof getGroupDetailsInput>) => {
			const adapter = getAdapter();
			return await adapter.getGroupDetails(args);
		},
	}),

	compare_with_financing: tool({
		description:
			"Compara parcela e custo total de um consorcio com um financiamento bancario equivalente (Tabela Price, CET estimado por categoria). Use quando o usuario perguntar comparativo, hesitar entre consorcio e financiamento, ou quiser entender a diferenca em numeros. Sempre retornar com disclaimer de estimativa.",
		inputSchema: compareWithFinancingSchema,
		execute: async (args: z.infer<typeof compareWithFinancingSchema>) => {
			return compareWithFinancing(args);
		},
	}),

	compute_scenarios: tool({
		description:
			"Calcula 3 cenarios de contemplacao (Conservador sem lance, Provavel com 20% de lance, Acelerado com 30% lance + recursos proprios) para um grupo. Use SEMPRE antes de chamar present_scenarios. Estimativa, nao garantia.",
		inputSchema: scenariosSchema,
		execute: async (args: z.infer<typeof scenariosSchema>) => {
			return computeScenarios(args);
		},
	}),

	recommend_groups: tool({
		description:
			"Analisa e ranqueia grupos por compatibilidade com o perfil do usuario. Use quando tiver informacoes suficientes sobre orcamento e prazo desejado para fazer uma recomendacao. Garante sempre >=3 opcoes (expande faixa de credito ate +-50% se necessario, marcando alternativas com flag).",
		inputSchema: recommendGroupsSchema,
		execute: async (args: z.infer<typeof recommendGroupsSchema>) => {
			const adapter = getAdapter();
			const { budget, desiredTermMonths, ...searchParams } = args;
			const fallbackResult = await recommendWithFallback(adapter, searchParams);
			const ranked = rankGroups(fallbackResult.groups, {
				budget,
				desiredTermMonths: desiredTermMonths ?? 0,
			});
			// Re-anota alternativa flag no resultado ranqueado (rankGroups preserva grupos).
			const altById = new Map(fallbackResult.groups.map((g) => [g.id, g.alternativa]));
			return {
				recommendations: ranked.map((r) => ({
					...r.group,
					score: r.score,
					scoreBreakdown: r.factors,
					alternativa: altById.get(r.group.id) ?? false,
				})),
				total: ranked.length,
				expansionUsed: fallbackResult.expansionUsed,
				insufficientOptions: fallbackResult.insufficientOptions,
			};
		},
	}),

	// ---- Presentation tools ----
	// Produce artifacts intercepted by the route via tool-call events.
	// The execute() return is feedback text that Claude sees.

	present_group_card: tool({
		description:
			"Apresenta um grupo de consorcio como card visual interativo para o usuario. Use SEMPRE apos buscar grupos com search_groups para mostrar cada grupo como um card clicavel. Passe os dados exatos retornados pela busca.",
		inputSchema: groupCardSchema,
		execute: async (args: z.infer<typeof groupCardSchema>) => {
			return `[Card do grupo ${args.administradora} - ${args.category} - R$ ${args.creditValue.toLocaleString("pt-BR")} apresentado ao usuario]`;
		},
	}),

	present_comparison_table: tool({
		description:
			"Apresenta uma tabela comparativa entre multiplos grupos de consorcio. Use quando o usuario pedir para comparar opcoes ou quando voce quiser mostrar lado a lado as melhores opcoes encontradas.",
		inputSchema: comparisonTableSchema,
		execute: async (args: z.infer<typeof comparisonTableSchema>) => {
			return `[Tabela comparativa com ${args.groups.length} grupos apresentada ao usuario]`;
		},
	}),

	present_simulation_result: tool({
		description:
			"Apresenta o resultado de uma simulacao de cota como card visual com breakdown de custos. Use SEMPRE apos chamar simulate_quota para mostrar os numeros de forma clara ao usuario.",
		inputSchema: simulationResultSchema,
		execute: async (args: z.infer<typeof simulationResultSchema>) => {
			return `[Simulacao apresentada: parcela R$ ${args.monthlyPayment.toFixed(2)}/mes por ${args.termMonths} meses]`;
		},
	}),

	present_recommendation_card: tool({
		description:
			"Apresenta a recomendacao final de consorcio com score de compatibilidade e botao de acao. Use apos chamar recommend_groups quando voce identificar o melhor grupo para o usuario.",
		inputSchema: recommendationSchema,
		execute: async (args: z.infer<typeof recommendationSchema>) => {
			return `[Recomendacao apresentada: ${args.administradora} - ${args.category} - Score ${(args.score * 100).toFixed(0)}%]`;
		},
	}),

	present_lead_form: tool({
		description:
			"Apresenta o formulario inline de captura de dados do lead (nome, telefone, email) no chat. Use quando o usuario demonstrar interesse em uma recomendacao de consorcio.",
		inputSchema: leadFormSchema,
		execute: async () => {
			return "[Formulario de captura de dados do lead apresentado ao usuario]";
		},
	}),

	present_value_picker: tool({
		description:
			"Apresenta um seletor interativo de valores. No web chat aparece como sliders, no WhatsApp aparece como lista de botoes com faixas pre-definidas. Use em vez de perguntar valores por texto. NUNCA escreva 'arrasta o slider' nem mencione UI especifica em volta da chamada — diga apenas 'escolhe uma faixa abaixo' ou 'me diz qual faz mais sentido'. SEMPRE use isso quando precisar que o usuario informe valores numericos.",
		inputSchema: valuePickerSchema,
		execute: async (args: z.infer<typeof valuePickerSchema>) => {
			return `[Seletor de valores apresentado para ${args.category}]`;
		},
	}),

	present_scenarios: tool({
		description:
			"Apresenta 3 cenarios de contemplacao lado a lado (Conservador sem lance, Provavel com 20% lance, Acelerado 30% lance + recursos proprios). Use apos calcular com compute_scenarios. Bug #16 Bruna v1 review.",
		inputSchema: z.object({
			groupId: z.string().describe("ID do grupo simulado"),
			administradora: z.string().describe("Nome da administradora"),
			creditValue: z.number().describe("Valor do credito em reais"),
			termMonths: z.number().int().describe("Prazo nominal do consorcio em meses"),
			scenarios: z
				.object({
					conservador: z.object({
						lancePercent: z.number(),
						expectedTermMonths: z.number().int(),
						strategy: z.string(),
						disclaimer: z.string(),
					}),
					provavel: z.object({
						lancePercent: z.number(),
						expectedTermMonths: z.number().int(),
						strategy: z.string(),
						disclaimer: z.string(),
					}),
					acelerado: z.object({
						lancePercent: z.number(),
						expectedTermMonths: z.number().int(),
						strategy: z.string(),
						disclaimer: z.string(),
					}),
				})
				.describe("Output de compute_scenarios"),
		}),
		execute: async (args) => {
			return `[3 cenarios apresentados: ${args.administradora} R$ ${args.creditValue.toLocaleString("pt-BR")} — Conservador ${args.scenarios.conservador.expectedTermMonths}m / Provavel ${args.scenarios.provavel.expectedTermMonths}m / Acelerado ${args.scenarios.acelerado.expectedTermMonths}m]`;
		},
	}),

	present_topic_picker: tool({
		description:
			"Apresenta lista de topicos clicaveis (chips) + botao 'Voltar' opcional. Use quando o usuario clicar 'Entender mais antes' ou pedir pra esclarecer duvidas — em vez de campo aberto, oferece atalhos pra topicos comuns. Bug #05 Bruna v1 review.",
		inputSchema: topicPickerSchema,
		execute: async (args: z.infer<typeof topicPickerSchema>) => {
			return `[Topic picker apresentado: ${args.topics.length} topicos${args.includeBackButton ? " + botao Voltar" : ""}]`;
		},
	}),

	present_financing_comparison: tool({
		description:
			"Apresenta como artifact visual a comparacao consorcio × financiamento (output de compare_with_financing). Use SEMPRE depois de chamar compare_with_financing — o output da tool de dados vai pro input desta. Bug #17.",
		inputSchema: z.object({
			category: z.enum(["imovel", "auto", "moto", "servicos"]),
			creditValue: z.number().positive(),
			termMonths: z.number().int().positive(),
			consorcio: z.object({
				monthlyPayment: z.number(),
				totalCost: z.number(),
			}),
			financing: z.object({
				monthlyPayment: z.number(),
				totalCost: z.number(),
				annualRate: z.number(),
			}),
			diff: z.object({
				monthlyDelta: z.number(),
				totalDelta: z.number(),
			}),
			disclaimer: z.string(),
		}),
		execute: async (args) => {
			return `[Comparativo apresentado: consorcio ${args.consorcio.monthlyPayment}/mes vs financ. ${args.financing.monthlyPayment}/mes]`;
		},
	}),

	// ---- Control signals (intercepted by orchestrator) ----

	suggest_handoff: tool({
		description:
			"Sinaliza ao sistema que UMA das condicoes da seção 'Quando sugerir consultor humano' do seu prompt foi satisfeita pela mensagem atual do usuario. Chame APENAS uma vez por turno e SOMENTE quando uma condicao for claramente atendida. Nao escreva texto pedindo o handoff — apenas chame esta tool. O sistema cuida da pergunta de confirmacao com botoes (Sim/Nao). Apos chamar, NAO chame outras tools no mesmo turno (search_groups, simulate_quota etc.) e NAO escreva resposta adicional.",
		inputSchema: z.object({
			triggerId: z
				.string()
				.optional()
				.describe(
					"ID do trigger que casou (opcional, se voce souber o ID exato dos triggers configurados).",
				),
			reason: z
				.string()
				.describe(
					"Frase curta e factual descrevendo qual condicao foi satisfeita pela mensagem do usuario. Ex: 'Cliente mencionou valor R$ 1.500.000 (acima do teto)'. Sera usado em logs.",
				),
		}),
		execute: async (args) => {
			return {
				acknowledged: true,
				reason: args.reason,
			};
		},
	}),

	// ---- Capture tool ----

	capture_lead: tool({
		description:
			"Salva os dados de contato do lead no banco de dados. Use apos o usuario preencher e enviar o formulario de lead.",
		inputSchema: captureLeadSchema,
		execute: async (args: z.infer<typeof captureLeadSchema>) => {
			const existing = await db.query.leads.findFirst({
				where: eq(leads.conversationId, args.conversationId),
			});

			if (existing) {
				await db
					.update(leads)
					.set({
						name: args.name,
						phone: args.phone,
						email: args.email,
						updatedAt: new Date(),
					})
					.where(eq(leads.id, existing.id));
				return `Lead atualizado com sucesso. Nome: ${args.name}`;
			}

			const { leadId } = await createLeadFromConversation({
				conversationId: args.conversationId,
				name: args.name,
				phone: args.phone,
				email: args.email,
			});

			return `Lead capturado com sucesso. Nome: ${args.name} (ID: ${leadId})`;
		},
	}),
};

/** Tool names that produce visual artifacts (intercepted by route) */
export const PRESENTATION_TOOLS = new Set([
	"present_group_card",
	"present_comparison_table",
	"present_simulation_result",
	"present_recommendation_card",
	"present_lead_form",
	"present_value_picker",
	"present_scenarios",
	"present_topic_picker",
	"present_financing_comparison",
]);
