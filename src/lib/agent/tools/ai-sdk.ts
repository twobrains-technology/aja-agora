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
import { type AdministradoraAdapter, getDiscoveryAdapter } from "@/lib/adapters";
import { isTransientDiscoveryError } from "@/lib/adapters/bevi/bevi-errors";
import { GroupNotInDiscoveryError } from "@/lib/adapters/bevi/bevi-self-contract-adapter";
import { toModelGroupSummary } from "@/lib/adapters/bevi/offer-mapper";
import type { GroupSummary, SearchGroupsParams } from "@/lib/adapters/types";
import { createLeadFromConversation } from "@/lib/admin/lead-stage-tracker";
import { evaluateActionPrecondition } from "@/lib/agent/orchestrator/action-policy";
import type { ChosenOffer } from "@/lib/agent/orchestrator/choose-offer";
import { listShownOffersForConversation } from "@/lib/agent/orchestrator/choose-offer";
import { CANONICAL_TOPIC_IDS } from "@/lib/agent/orchestrator/topic-catalog";
import { rankGroups, recommendWithFallback } from "@/lib/agent/recommendation";
import { computeScenarios } from "@/lib/agent/scenarios";
import { computeContemplationDial } from "@/lib/consorcio/contemplation-dial";
import { recommendationFitLabel } from "@/lib/consorcio/score-label";
import { compareWithFinancing } from "@/lib/finance/pmt";
import { simulatorNow } from "@/lib/utils/simulator-clock";
import {
	getGroupDetailsInput,
	getRatesInput,
	searchGroupsInput,
	simulateQuotaInput,
} from "./schemas";
import { emptyShownGroups, extractShownFromPayload, loadShownGroups } from "./shown-groups";

// ---- Presentation tool schemas (reused across definition + route) ----

export const groupCardSchema = z.object({
	// FIX-71: o id e um hash OPACO da descoberta (Bevi quotaId). O agent precisa
	// copia-lo LITERAL pra simular o grupo escolhido depois — se derivar um slug
	// (banco-categoria-valor-prazo) o simulate_quota recusa. A descricao trava isso.
	id: z
		.string()
		.describe(
			"ID LITERAL e opaco do grupo, copiado EXATAMENTE como veio de search_groups/recommend_groups (um hash, ex.: 6a0ca9ca1b2c3d4e5f607182). NUNCA derive nem fabrique de banco/categoria/valor/prazo (ex.: 'bb-auto-200k-72m').",
		),
	administradora: z.string().describe("Nome da administradora"),
	category: z.enum(["imovel", "auto", "moto", "servicos"]).describe("Categoria do bem"),
	creditValue: z.number().describe("Valor do credito em reais"),
	monthlyPayment: z.number().describe("Parcela mensal estimada em reais"),
	adminFeePercent: z.number().describe("Taxa de administracao em percentual"),
	termMonths: z.number().int().describe("Prazo em meses"),
	availableSlots: z.number().int().describe("Vagas disponiveis"),
	contemplationRate: z.number().describe("Taxa media de contemplacao por assembleia"),
	// FIX-223: lance medio (R$) — copie LITERAL de search_groups/recommend_groups
	// quando presente; omita o campo se a fonte nao trouxer (NUNCA invente).
	avgBidValue: z.number().optional().describe("Lance medio do grupo em reais, quando a fonte traz"),
});

export const comparisonTableSchema = z.object({
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

export const simulationResultSchema = z.object({
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
	embeddedBid: z
		.object({
			percent: z.number().describe("Percentual da carta usado como lance embutido (30 ou 50)"),
			embeddedBidValue: z.number().describe("Valor da carta destinado ao lance embutido (R$)"),
			receivedCredit: z.number().describe("Credito liquido recebido (carta - lance embutido)"),
			necessaryBidToContemplate: z
				.number()
				.nullable()
				.optional()
				.describe(
					"Estimativa de lance pra contemplar (R$) — NAO garantia. Copie LITERAL de simulate_quota (pode ser null — NUNCA invente valor).",
				),
		})
		.optional()
		.describe(
			"Cenario de lance embutido (jornada do doc). Passe SEMPRE o que veio de simulate_quota pra mostrar a variacao com/sem lance embutido.",
		),
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

export const recommendationSchema = z.object({
	// FIX-71: id LITERAL opaco da descoberta — o agent copia, nunca deriva slug.
	id: z
		.string()
		.describe(
			"ID LITERAL e opaco do grupo recomendado, copiado EXATAMENTE como veio de search_groups/recommend_groups. NUNCA derive nem fabrique de banco/categoria/valor/prazo (ex.: 'bb-auto-200k-72m').",
		),
	administradora: z.string().describe("Nome da administradora"),
	category: z.enum(["imovel", "auto", "moto", "servicos"]).describe("Categoria do bem"),
	creditValue: z.number().describe("Valor do credito em reais"),
	monthlyPayment: z.number().describe("Parcela mensal em reais"),
	adminFeePercent: z.number().describe("Taxa de administracao em percentual"),
	termMonths: z.number().int().describe("Prazo em meses"),
	contemplationRate: z.number().describe("Taxa media de contemplacao por assembleia"),
	// FIX-191: `contempladosMes` DEIXOU de ser input da LLM (era a origem do "36/mês"
	// fabricado — spec §2). Agora o runner coage o hero contra o grupo REAL do turno
	// (coerceRecommendationPayload) e re-adiciona contempladosMes SÓ do availableSlots
	// real (>0). A LLM não digita mais número de contemplação — Lei 3/4.
	// FIX-334: `score`/`scoreBreakdown` ficaram OPCIONAIS — o modelo não recebe mais
	// o número cru no tool-result de recommend_groups (só `scoreLabel`, qualitativo),
	// então não tem de onde copiar um valor real aqui. Nunca foram lidos deste input
	// de qualquer forma: `coerceRecommendationPayload` sempre RECALCULA score/
	// scoreBreakdown a partir do grupo real (scoreGroup), nunca do que a LLM digita.
	score: z
		.number()
		.min(0)
		.max(1)
		.optional()
		.describe("Score de compatibilidade 0-1 (nao usado — ignorado pelo servidor)"),
	scoreBreakdown: z
		.object({
			monthlyFit: z.number().describe("Score de adequacao ao orcamento 0-1"),
			contemplation: z.number().describe("Score de taxa de contemplacao 0-1"),
			adminFee: z.number().describe("Score de taxa de administracao 0-1"),
			termMatch: z.number().describe("Score de adequacao ao prazo 0-1"),
		})
		.optional()
		.describe("Detalhamento do score por fator (nao usado — ignorado pelo servidor)"),
});

// FIX-228 (docs/02-cards-novos.md CARD 1) — input mínimo: a LLM só escolhe o
// grupo (id LITERAL, mesmo padrão anti-fabricação de groupCardSchema); os
// números (embeddedBidValue/netCredit) são coagidos server-side no runner a
// partir da oferta REAL ancorada no turno (coerceEmbeddedBidPayload).
export const embeddedBidSchema = z.object({
	groupId: z
		.string()
		.describe(
			"ID LITERAL e opaco do grupo, copiado EXATAMENTE como veio de search_groups/recommend_groups/present_recommendation_card. NUNCA derive nem fabrique.",
		),
});

// FIX-229 (docs/02-cards-novos.md CARD 3) — bifurcação A/B pra quem não vai
// dar lance (gate `lance`, 3ª saída "só a parcela"). Input mínimo: a LLM só
// escolhe o grupo; monthlyPayment/administradora são coagidos server-side.
export const twoPathsSchema = z.object({
	groupId: z
		.string()
		.describe(
			"ID LITERAL e opaco do grupo escolhido, copiado EXATAMENTE como veio de search_groups/recommend_groups/present_recommendation_card.",
		),
});

// FIX-230 (docs/02-cards-novos.md CARD 2) — escassez comercial ("grupo quase
// cheio"). Input mínimo: a LLM só escolhe o grupo; o número placebo 1-6 é
// derivado no servidor via hash determinístico do groupId (nunca a LLM).
export const scarcitySchema = z.object({
	groupId: z
		.string()
		.describe(
			"ID LITERAL e opaco do grupo, copiado EXATAMENTE como veio de search_groups/recommend_groups/present_recommendation_card.",
		),
});

/**
 * Schema do `present_lead_form` no REGISTRY ESTÁTICO (compat com PRESENTATION_TOOLS
 * + testes legados). Versão exposta ao MODELO pelo builder vem da factory
 * `buildConsorcioTools(ctx)` e NÃO declara `conversationId` no schema —
 * conversationId é contexto da request, injetado via closure.
 *
 * Background (BUG-CONVERSATION-ID-HALLUCINATION): quando o conversationId
 * aparecia no schema, o modelo alucinava valores ("conv_001") em vez do
 * UUID real, fazendo o UPDATE no DB falhar silenciosamente.
 */
const leadFormSchema = z.object({
	conversationId: z
		.string()
		.optional()
		.describe("ID da conversa atual (opcional — o frontend resolve automaticamente)"),
	recommendationId: z.string().optional().describe("ID da recomendacao que gerou o interesse"),
});

const leadFormSchemaNoCtx = z.object({
	recommendationId: z.string().optional().describe("ID da recomendacao que gerou o interesse"),
});

const valuePickerSchema = z.object({
	category: z
		.enum(["imovel", "auto", "moto", "servicos"])
		.describe("Categoria do bem para personalizar o visual"),
	fields: z
		.array(
			z.object({
				// FIX-16: ids canonicos ativam a interligacao inteligente dos sliders
				// (parcela/prazo arrastados -> valor do bem recalcula ao vivo pela
				// matematica de consorcio). Prefira sempre os 3 campos juntos.
				id: z
					.string()
					.describe(
						"Identificador do campo. Use EXATAMENTE: creditValue (valor do bem), monthlyBudget (parcela mensal), term (prazo em meses) — esses ids interligam os sliders ao vivo",
					),
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

// FIX-300: `topics` deixou de ser string livre — o Zod só aceita um id do
// catálogo canônico (topic-catalog.ts). O COPY do chip vem SEMPRE do
// catálogo (resolveTopicPickerPayload, runner.ts), nunca do texto que o
// modelo mandou — mata o vetor do card alucinado (chips "a"/"b").
export const topicPickerSchema = z.object({
	prompt: z
		.string()
		.optional()
		.describe("Frase curta antes dos chips (ex: 'Sobre o que voce gostaria de saber?')"),
	topics: z
		.array(z.enum(CANONICAL_TOPIC_IDS))
		.min(2)
		.max(5)
		.describe(
			`Ids das duvidas clicaveis (2-5), EXATAMENTE do catalogo canonico: ${CANONICAL_TOPIC_IDS.join(", ")}. NUNCA invente um id novo — o copy do chip vem do catalogo, nao do texto que voce escrever aqui.`,
		),
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

// FIX-257 (P1, veredito Fable r4 §P1 #1): creditMin/creditMax/budget/
// desiredTermMonths vem de texto livre do usuario — mesma coercao string→
// number de schemas.ts (searchGroupsInput/simulateQuotaInput). Ver o
// comentario la pra raiz completa (espiral de negacao).
export const recommendGroupsSchema = z.object({
	category: z
		.enum(["imovel", "auto", "moto", "servicos"])
		.describe("Categoria do bem: imovel, automovel ou servicos"),
	creditMin: z.coerce.number().min(0).optional().describe("Valor minimo de credito em reais"),
	creditMax: z.coerce.number().positive().optional().describe("Valor maximo de credito em reais"),
	// FIX-322: o usuario quase nunca declara orcamento mensal (so o valor do
	// bem) — recommendation.ts:10-17 (FIX-276) ja documenta que esse campo e
	// "INVENTADO pelo LLM" quando falta o dado real, e monthlyFitScore ja trata
	// budget<=0 graciosamente (contribui 0 no score, nao quebra). Exigir
	// positive() forcava a LLM a chutar um numero OU falhar a chamada inteira
	// (achado ao vivo: turno inteiro caia no fallback degradado). 0 = "sem
	// dado" (mesmo padrao de desiredTermMonths abaixo) — NAO invente um valor.
	budget: z.coerce
		.number()
		.min(0)
		.default(0)
		.describe(
			"Orcamento mensal do usuario em reais. 0 = usuario nao informou (PADRAO — nao invente um valor).",
		),
	// FIX-103: o prazo NAO e mais coletado na entrada (gate timeframe removido).
	// O usuario nao declara prazo desejado, entao este campo fica em 0 (sem
	// preferencia) por padrao — o fator termMatch do score vira NEUTRO (0.5 igual
	// pra todos), e o ranking passa a priorizar parcela/contemplacao/taxa. NAO
	// invente um prazo desejado; deixe 0 a menos que o usuario peca um prazo
	// explicito num what-if pos-reveal.
	desiredTermMonths: z.coerce
		.number()
		.int()
		.min(0)
		.default(0)
		.describe(
			"Prazo desejado em meses. 0 = sem preferencia (PADRAO — o prazo nao e coletado na entrada, FIX-103). So passe > 0 se o usuario pedir um prazo explicito num what-if.",
		),
});

// ---- Domain tools (data fetching) ----
//
// MOCK-RUNTIME-MORTO (diretiva 2026-06-04): a descoberta usa o adapter REAL
// por conversa (getDiscoveryAdapter — Trilho B Bevi, exige identidade D1).
// Os executes vivem em funções com adapter parametrizado; o registry estático
// (sem conversationId) responde erro informativo — paths de produção montam as
// tools via `buildConsorcioTools({ conversationId })`, que injeta o adapter.

const DISCOVERY_NO_CONTEXT = {
	error:
		"[Descoberta indisponivel neste contexto: sem conversationId nao ha sessao Bevi. " +
		"Caminhos de produto usam buildConsorcioTools({ conversationId }).]",
} as const;

const STATUS_NO_CONTEXT = {
	error:
		"[Status indisponivel neste contexto: sem conversationId nao ha proposta pra consultar. " +
		"Caminhos de produto usam buildConsorcioTools({ conversationId }).]",
} as const;

/** Sem oferta ancorada não existe cenário: os números do simulador saem do
 * grupo REAL (carta, prazo, parcela, lance médio). Nunca fabricar um cenário
 * "de exemplo" — ele seria narrado ao cliente como se fosse a cota dele. */
const SIMULACAO_SEM_OFERTA = {
	error:
		"[Sem oferta ancorada nesta conversa: não há grupo real de onde tirar carta, prazo e lance " +
		"médio. Apresente uma opção real antes de simular cenário de contemplação.]",
} as const;

// FIX-332 (P0.1, veredito rodada 1 do loop desamarra-agente) — pós-reveal SEM
// troca de faixa, search_groups/recommend_groups NÃO re-buscam a Bevi: devolvem
// os grupos JÁ EXIBIDOS nesta conversa (mesma fonte de dado do
// listShownOffersForConversation usado pelo fallback de tool-error,
// choose-offer.ts). Isso dá ao modelo um resultado ACIONÁVEL (o groupId LITERAL
// pra usar em simulate_quota/get_group_details) em vez de deixar a tool fora do
// toolset — o que hoje vira NoSuchToolError e descarta a fala inteira do turno.
function shownGroupsSearchResult(offers: ChosenOffer[]): {
	groups: Array<{
		id: string;
		administradora?: string;
		creditValue?: number;
		termMonths?: number;
		monthlyPayment?: number;
	}>;
	total: number;
	note: string;
} {
	return {
		groups: offers.map((o) => ({
			id: o.groupId,
			administradora: o.administradora,
			creditValue: o.creditValue,
			termMonths: o.termMonths,
			monthlyPayment: o.monthlyPayment,
		})),
		total: offers.length,
		note:
			"Estes são os grupos JÁ EXIBIDOS nesta conversa — não é uma busca nova, a Bevi não foi " +
			"consultada de novo. Use o id LITERAL direto em simulate_quota/get_group_details pra " +
			"responder o pedido do usuário. NÃO chame present_comparison_table/present_recommendation_card " +
			"de novo — a tela já mostra essas opções.",
	};
}

// FIX-186 (Kairo 2026-07-01) — marcador do tool-result quando a descoberta na
// Bevi falha (após retry silencioso, ou erro duro). O `runDiscovery` retorna
// ISTO em vez de re-lançar (que viraria tool-error narrado pelo modelo). O
// runner detecta via `isDiscoveryFailedResult`, suprime a narração e conduz o
// fallback humano determinístico (Lei 1: código dispõe). O campo `error` é a
// diretiva pro modelo caso ele processe o step — mas a garantia está no código.
export function isDiscoveryFailedResult(output: unknown): boolean {
	return (
		typeof output === "object" &&
		output !== null &&
		(output as Record<string, unknown>).__discoveryFailed === true
	);
}

function discoveryFailedResult(toolName: string): { __discoveryFailed: true; error: string } {
	return {
		__discoveryFailed: true,
		error:
			`A descoberta na Bevi falhou neste turno (tool ${toolName}) apos retry. ` +
			"NAO narre erro tecnico, NAO invente numeros, NAO proponha/recomende/simule nada. " +
			"O sistema ja conduz a mensagem ao usuario de forma deterministica — encerre o turno.",
	};
}

// FIX-186: backoff curto do retry silencioso (alinhado ao "< 3s" do CLAUDE.md).
// Test seam zera o delay pra não esperar de verdade nos testes.
let discoveryRetryDelayMs = 300;
export function __setDiscoveryRetryDelayForTests(ms: number | null): void {
	discoveryRetryDelayMs = ms ?? 300;
}

// FIX-291 (a) — teto AGREGADO de tempo pra descoberta de UM turno, cruzando
// client+adapter+tool. Root cause: cada camada tinha SEU orçamento isolado
// (self-contract-client SIM_RETRY=4×SIM_TIMEOUT_MS=30s ~120s; adapter
// offersForValue faz 2 chamadas sequenciais ~240s; e o retry silencioso daqui
// reexecutava a função INTEIRA, dobrando pra ~480s teórico) — nenhuma camada
// sabia do orçamento das outras. 45s fica folgado abaixo de qualquer timeout
// de cliente real (browser/WhatsApp, tipicamente ~90s) — o usuário SEMPRE
// recebe a degradação honesta antes do cliente dele desistir sozinho.
let discoveryBudgetMs = 45_000;
export function __setDiscoveryBudgetForTests(ms: number | null): void {
	discoveryBudgetMs = ms ?? 45_000;
}

class DiscoveryBudgetExceededError extends Error {
	constructor() {
		super("Orcamento agregado de descoberta (client+adapter+tool) excedido neste turno.");
		this.name = "DiscoveryBudgetExceededError";
	}
}

/** Corre `p` contra o restante do orçamento agregado (`deadline`). Estourou
 * ANTES de tentar → rejeita direto (nem chama `fn`, que já teria custo). O
 * timer é `unref`'d — não impede o processo de encerrar se `p` ficar presa
 * pra sempre (adapter que nunca resolve/rejeita, pior caso deste fix). */
function withDiscoveryBudget<T>(p: Promise<T>, deadline: number): Promise<T> {
	const remaining = deadline - Date.now();
	if (remaining <= 0) return Promise.reject(new DiscoveryBudgetExceededError());
	return Promise.race([
		p,
		new Promise<T>((_resolve, reject) => {
			const timer = setTimeout(() => reject(new DiscoveryBudgetExceededError()), remaining);
			if (typeof timer.unref === "function") timer.unref();
		}),
	]);
}

// FIX-70: search_groups model-facing ganha o opt-in `sweep` (varredura
// multi-faixa). Schema estendido LOCAL (não toca schemas.ts) — `sweep` é só
// faixa de valor (sem objetivo×lance). O adapter Bevi varre o alvo + vizinhas e
// devolve a UNIÃO; adapters sem suporte ignoram o campo.
const searchGroupsSweepInput = searchGroupsInput.extend({
	sweep: z
		.boolean()
		.optional()
		.describe(
			"Quando true, varre 3-5 faixas de valor ao redor do alvo e devolve um espectro real de grupos pra comparar (acumula alternativas no indice). Use ao montar uma comparacao ou quando o usuario quiser ver OUTRAS opcoes/faixas de preco. Omita (default) pra busca rapida de 1 faixa — a primeira impressao sai mais rapida.",
		),
});

async function executeSearchGroups(
	adapter: AdministradoraAdapter,
	args: z.infer<typeof searchGroupsSweepInput>,
) {
	// `args` (incl. sweep) flui direto pro adapter — SearchGroupsParams.sweep.
	const groups = await adapter.searchGroups(args);
	// FIX-23: tool-result pro modelo em dieta — corta `totalParticipants` morto.
	// FIX-289: `raw` (grupos completos, com tipoOferta/grupo/embeddedVariant)
	// fica só pro cache por-turno do closure (buildConsorcioTools) reaproveitar
	// em recommend_groups — NUNCA vaza pro tool-result do modelo.
	return { result: { groups: groups.map(toModelGroupSummary), total: groups.length }, raw: groups };
}

/**
 * FIX-72/FIX-71/FIX-68 — fast-path que reconhece um groupId FABRICADO pela LLM.
 * Os ids reais da descoberta (Bevi quotaId) sao hashes opacos (Mongo ObjectId,
 * 24 hex) — e hex NUNCA contem a letra `k`. O id alucinado segue o padrao slug
 * `[banco-]categoria-valorK[-prazoM|-nome]` e SEMPRE carrega um valor em milhares
 * (`-180k`, `-200k`, `-130k`). Detectamos esse marcador: pega `auto-180k`,
 * `auto-180k-kairo` (FIX-72, com o NOME do usuario no id), `bb-auto-200k-72m`
 * (FIX-71), `auto-130k-60m` (FIX-68) — e NUNCA o hash (sem `k`).
 *
 * O regex antigo (`/-\d+k-\d+m$/`) so pegava o sufixo `-NNNk-NNm`, deixando passar
 * `auto-180k` e `auto-180k-kairo` (a raiz do FIX-72). E so um ATALHO de latencia
 * (<3s): a rede de seguranca real e o `GroupNotInDiscoveryError` capturado abaixo,
 * que cobre QUALQUER id fora do conjunto real — inclusive slug sem valor-k.
 */
export function looksLikeFabricatedGroupId(groupId: string): boolean {
	return /(?:^|-)\d+k(?:-|$)/i.test((groupId ?? "").trim());
}

/**
 * FIX-72 — diretiva ACIONAVEL (mesmo shape de erro de tool) que devolve o controle
 * pro modelo se auto-corrigir com o id LITERAL ou re-buscar, em vez de propagar
 * erro cru (que o AI SDK converte em "instabilidade" e trava o usuario). Reusada
 * pelos dois caminhos (fast-path de slug + rede do GroupNotInDiscoveryError) e
 * pelas duas tools (simulate_quota / get_group_details). Degradacao graciosa
 * preservada — guidance pra retomar, nunca loop.
 */
function rebuscaDirective(
	groupId: string,
	allowedToolNames?: readonly string[],
): { error: string } {
	// Mesma armadilha do `naoExibidoDirective`: mandar "refaça search_groups"
	// numa fase em que a policy escondeu a tool faz o modelo tomar
	// NoSuchToolError, o runner abortar a geração e o cliente receber o fallback
	// enlatado. Em `closing`, por exemplo, `search_groups` NÃO está no toolset.
	// Só citamos a tool quando ela realmente existe agora.
	const podeRebuscar = (allowedToolNames ?? ["search_groups"]).includes("search_groups");
	const saida = podeRebuscar
		? "Se nao tiver o id a mao, refaca search_groups na faixa e use o id real retornado."
		: "Voce NAO tem a busca disponivel agora — entao pergunte ao usuario, com as suas palavras, qual das opcoes ja mostradas em tela ele quer, e siga pela escolha dele.";
	return {
		error:
			`O groupId "${groupId}" nao existe na descoberta atual (nao e um id real retornado por search_groups/recommend_groups). ` +
			"Use o id LITERAL e opaco do grupo escolhido — exatamente o que veio em search_groups / present_comparison_table / present_recommendation_card. " +
			`${saida} NUNCA derive nem componha o id de banco/categoria/valor/prazo/nome.`,
	};
}

// FIX-179 (Mirella, 2026-07-01) — "quero ver todos" pulou pra simulate_quota/
// get_group_details/present_decision_prompt sobre "Embracon", grupo REAL da Bevi
// (existia no discovery cache) mas NUNCA renderizado em tela. FIX-180 generalizou
// essa precondição de DADO (antes um `if` ad-hoc aqui) para a tabela declarativa
// `action-policy.ts` (`evaluateActionPrecondition`) — as diretivas
// `naoExibidoDirective`/`administradoraNaoExibidaDirective` moraram pra lá (fonte
// única). Diferença pro rebuscaDirective (FIX-72, abaixo): aquele cobre "id não
// existe na Bevi" (fabricado); a precondição de dado cobre "id EXISTE mas nunca
// foi mostrado pro usuário" — a LLM não age sobre o que só ELA viu no tool-result.
// Ordem: action-policy (foi exibido?) roda ANTES do adapter (existe na Bevi?).

export async function executeSimulateQuota(
	adapter: AdministradoraAdapter,
	args: z.infer<typeof simulateQuotaInput>,
	/** Tools expostas na fase — a diretiva de re-busca só pode citar `search_groups`
	 * quando ela existe agora (senão vira NoSuchToolError → fallback enlatado). */
	allowedToolNames?: readonly string[],
) {
	// FIX-72 (fast-path): id com cara de slug fabricado (marcador de valor-em-k)
	// NUNCA existe na descoberta — nem chama a Bevi, devolve guidance acionavel.
	if (looksLikeFabricatedGroupId(args.groupId)) {
		return rebuscaDirective(args.groupId, allowedToolNames);
	}
	try {
		const [details, simulation] = await Promise.all([
			adapter.getGroupDetails({ groupId: args.groupId }),
			adapter.simulateQuota(args),
		]);
		const delta = Math.abs(args.creditValue - details.creditValue);
		const relativeDelta = delta / details.creditValue;
		if (delta > 1 && relativeDelta > 0.01) {
			const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
			// FIX-255 (rodada 4, veredito Fable FINAL §N-E): a mensagem antiga dizia
			// "ajustada de NOMINAL para SOLICITADO" — mas `simulation` (spreadado
			// abaixo) é SEMPRE o nominal do grupo: o self-contract (bevi-self-
			// contract-adapter.ts, simulateQuota) resolve a oferta pelo groupId e
			// devolve os números fixos dela, `params.creditValue` nunca é usado pra
			// resimular. A narração então apresentava o nominal como "o valor
			// correto/pedido" quando na verdade o pedido foi IGNORADO — inversão
			// semântica (CDC art. 30, oferta tem que ser clara sobre o que
			// realmente foi simulado).
			return {
				...simulation,
				creditAdjustmentNotice: {
					requestedCreditValue: args.creditValue,
					groupNominalCreditValue: details.creditValue,
					message: `Voce pediu simular ${fmt(args.creditValue)}, mas esse grupo nao permite ajuste livre de credito — a simulacao abaixo e do valor NOMINAL do grupo (${fmt(details.creditValue)}), nao do valor pedido. Informe isso ao usuario antes de apresentar o resultado.`,
				},
			};
		}
		return simulation;
	} catch (err) {
		// FIX-72 (rede de seguranca): id fora do conjunto real (qualquer formato —
		// hex inventado, oferta expirada) → diretiva de re-busca, nunca erro cru.
		if (err instanceof GroupNotInDiscoveryError)
			return rebuscaDirective(args.groupId, allowedToolNames);
		throw err;
	}
}

async function executeGetRates(
	adapter: AdministradoraAdapter,
	args: z.infer<typeof getRatesInput>,
) {
	const rates = await adapter.getRates(args);
	return { rates, total: rates.length };
}

export async function executeGetGroupDetails(
	adapter: AdministradoraAdapter,
	args: z.infer<typeof getGroupDetailsInput>,
	/** Ver `executeSimulateQuota`. */
	allowedToolNames?: readonly string[],
) {
	// FIX-72: mesma resolucao robusta de simulate_quota — o get_group_details
	// recebia id fabricado (`auto-180k-kairo` no log) e devolvia erro cru. Fast-path
	// pro slug + rede do GroupNotInDiscoveryError → diretiva de re-busca acionavel.
	if (looksLikeFabricatedGroupId(args.groupId)) {
		return rebuscaDirective(args.groupId, allowedToolNames);
	}
	try {
		return await adapter.getGroupDetails(args);
	} catch (err) {
		if (err instanceof GroupNotInDiscoveryError)
			return rebuscaDirective(args.groupId, allowedToolNames);
		throw err;
	}
}

async function executeRecommendGroups(
	adapter: AdministradoraAdapter,
	args: z.infer<typeof recommendGroupsSchema>,
	opts: { hasLance?: boolean; seedGroups?: GroupSummary[] } = {},
) {
	const { budget, desiredTermMonths, ...searchParams } = args;
	// FIX-289: `seedGroups` (grupos que search_groups já buscou NESTE turno com
	// parâmetros equivalentes) pula a rebusca estrita — só bate a Bevi de novo
	// se a expansão de faixa for necessária (recommendWithFallback).
	const fallbackResult = await recommendWithFallback(adapter, searchParams, opts.seedGroups);
	const ranked = rankGroups(fallbackResult.groups, {
		budget,
		desiredTermMonths: desiredTermMonths ?? 0,
		// FIX-276: âncora real da recomendação — o valor do bem PEDIDO, nunca o
		// budget mensal (inventado pelo LLM, ver comentário em recommendation.ts).
		creditMax: searchParams.creditMax,
		// FIX-193: afinidade de lance no desempate (tipoOferta) — critério interno,
		// vem do perfil (meta.qualifyAnswers.hasLance), NUNCA input da LLM.
		hasLance: opts.hasLance,
	});
	// Re-anota alternativa flag no resultado ranqueado (rankGroups preserva grupos).
	const altById = new Map(fallbackResult.groups.map((g) => [g.id, g.alternativa]));
	return {
		recommendations: ranked.map((r, i) => ({
			// FIX-23: dieta — `totalParticipants` morto fora do tool-result.
			...toModelGroupSummary(r.group),
			// FIX-334 (rodada 2, veredito Sonnet — "score de 73%" na fala): o score
			// CRU (0-1) e o breakdown por fator NÃO saem mais pro modelo — só o
			// rótulo qualitativo (mesma `recommendationFitLabel` do card, FIX-7). O
			// card em si não perde nada: `coerceRecommendationPayload` RECALCULA
			// score/scoreBreakdown a partir do grupo real (`scoreGroup`), nunca do
			// que o modelo ecoou de volta. `rank` (posição ordinal, 0=melhor)
			// substitui o score cru como sinal de "é o top-1" pro código server-side
			// (pickBestRankedGroup) — seguro de expor, não é um número de "score".
			rank: i,
			scoreLabel: recommendationFitLabel(r.score, r.factors.monthlyFit),
			alternativa: altById.get(r.group.id) ?? false,
		})),
		total: ranked.length,
		expansionUsed: fallbackResult.expansionUsed,
		insufficientOptions: fallbackResult.insufficientOptions,
	};
}

export const consorcioTools = {
	search_groups: tool({
		description:
			"Busca grupos de consorcio disponiveis por categoria e faixa de credito. Use quando o usuario mencionar o que quer comprar (carro, casa, servico) ou quanto quer gastar. " +
			"A busca ja cobre automaticamente os cenarios com e sem lance embutido (FIX-219) — nao precisa perguntar sobre lance antes de buscar.",
		inputSchema: searchGroupsInput,
		execute: async (_args: z.infer<typeof searchGroupsInput>) => DISCOVERY_NO_CONTEXT,
	}),

	simulate_quota: tool({
		description:
			'Simula parcela mensal, taxa de administracao, fundo de reserva e prazo para um grupo especifico com um valor de credito. Use apos o usuario escolher ou perguntar sobre um grupo. **REGRA Bv2-08**: por default use o creditValue NOMINAL do grupo (o que apareceu no comparativo/search_groups). Use creditValue diferente APENAS se o usuario pediu what-if explicito (ex: "e se fosse 200k?"). Quando creditValue divergir >1% do nominal, o sistema retorna creditAdjustmentNotice — voce DEVE relatar o ajuste pro user na sua resposta.',
		inputSchema: simulateQuotaInput,
		execute: async (_args: z.infer<typeof simulateQuotaInput>) => DISCOVERY_NO_CONTEXT,
	}),

	get_rates: tool({
		description:
			"Retorna taxas de administracao vigentes por administradora e categoria. Use quando o usuario perguntar sobre taxas, custos ou quiser comparar administradoras.",
		inputSchema: getRatesInput,
		execute: async (_args: z.infer<typeof getRatesInput>) => DISCOVERY_NO_CONTEXT,
	}),

	get_group_details: tool({
		description:
			"Retorna detalhes completos de um grupo incluindo historico de contemplacao e proximas assembleias. Use quando o usuario quiser saber mais sobre um grupo especifico.",
		inputSchema: getGroupDetailsInput,
		execute: async (_args: z.infer<typeof getGroupDetailsInput>) => DISCOVERY_NO_CONTEXT,
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
		execute: async (_args: z.infer<typeof recommendGroupsSchema>) => DISCOVERY_NO_CONTEXT,
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
			// FIX-334: score deixou de ser input real (a LLM nao recebe mais o numero
			// cru) — a confirmacao textual so cita quando presente, nunca fabrica NaN%.
			const scoreSuffix =
				typeof args.score === "number" ? ` - Score ${(args.score * 100).toFixed(0)}%` : "";
			return `[Recomendacao apresentada: ${args.administradora} - ${args.category}${scoreSuffix}]`;
		},
	}),

	present_embedded_bid: tool({
		description:
			"Apresenta o card de lance embutido: explica que o usuário pode usar parte da própria carta como lance, sem desembolsar, mas o crédito recebido diminui. Use no passo 4 (reveal), antes da agulha, quando o usuário sinalizar pressa ou pouca reserva. Passe o groupId do plano recomendado — os valores (embeddedBidValue/netCredit) são calculados pelo sistema a partir da oferta real, você não precisa calcular nem inventar números.",
		inputSchema: embeddedBidSchema,
		execute: async (args: z.infer<typeof embeddedBidSchema>) => {
			return `[Card de lance embutido apresentado para o grupo ${args.groupId}]`;
		},
	}),

	present_two_paths: tool({
		description:
			"Apresenta os DOIS caminhos pra quem não vai dar lance: (A) esperar o sorteio pagando só a parcela, (B) um lance pequeno opcional lá na frente. Use no gate lance, quando o usuário disser que não quer comprometer nada além da parcela. NÃO recomende nenhum dos dois — depois do card, devolva a decisão ao usuário ('não tem certo ou errado, depende de você ter pressa ou não'). PROIBIDO mencionar qualquer % de chance de contemplação. Passe o groupId do plano escolhido — a parcela é calculada pelo sistema.",
		inputSchema: twoPathsSchema,
		execute: async (args: z.infer<typeof twoPathsSchema>) => {
			return `[Card de dois caminhos apresentado para o grupo ${args.groupId}]`;
		},
	}),

	present_scarcity: tool({
		description:
			"Apresenta o card de escassez comercial ('Grupo quase cheio · restam apenas N') pro grupo escolhido. Use no fechamento, depois da estratégia, antes da proposta final. O número exibido é gerado pelo sistema a partir do grupo — NÃO invente, NÃO calcule, NÃO mencione o total de cotas do grupo (não é um dado que existe).",
		inputSchema: scarcitySchema,
		execute: async (args: z.infer<typeof scarcitySchema>) => {
			return `[Card de escassez apresentado para o grupo ${args.groupId}]`;
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
			"[LEGADO/WEB — FIX-104] Seletor interativo de valores (sliders). NAO use na ENTRADA da jornada: o valor do bem agora e coletado por CONVERSA (o usuario FALA o valor; o analyzer extrai). Esta tool segue disponivel apenas como apoio de UI da WEB (slider simples) renderizado pelo sistema — o agente NUNCA a dispara na entrada pra pedir o valor do bem. Se chamar, NUNCA escreva 'arrasta o slider' nem mencione UI especifica.",
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

	present_decision_prompt: tool({
		description:
			"Apresenta o card de decisão 'Esse plano faz sentido?' com 3 opções (reservar agora / ver outras opções / falar com especialista). Use UMA vez, DEPOIS de o usuário ter visto a recomendação + simulação completa e estar perto de decidir — fecha a etapa de avaliação. NÃO use durante a coleta nem antes da simulação. As 3 opções são fixas; passe apenas a administradora do plano recomendado pra contexto.",
		inputSchema: z.object({
			administradora: z
				.string()
				.optional()
				.describe("Administradora do plano recomendado (contexto do card)"),
		}),
		execute: async (args: { administradora?: string }) => {
			return `[Card de decisão apresentado${args.administradora ? ` para o plano ${args.administradora}` : ""}]`;
		},
	}),

	present_contract_form: tool({
		description:
			"Apresenta o formulário de CONTRATAÇÃO (CPF + celular + aceite LGPD) que cria a proposta REAL na administradora. Use SÓ depois que o usuário escolheu 'Sim, quero reservar agora' no card de decisão (passo 5 'Contratar' da jornada). NUNCA peça CPF por texto — sempre via este card. Passe só a administradora do plano escolhido pra contexto. Não escreva 'preencha o formulário', diga algo natural tipo 'pra confirmar sua reserva, só preciso de uns dados rápidos'.",
		inputSchema: z.object({
			administradora: z
				.string()
				.optional()
				.describe("Administradora do plano escolhido (contexto)"),
		}),
		execute: async (args: { administradora?: string }) => {
			return `[Formulário de contratação (CPF/celular/LGPD) apresentado${args.administradora ? ` — ${args.administradora}` : ""}]`;
		},
	}),

	present_contemplation_dial: tool({
		description:
			"Apresenta o simulador-agulha de contemplação: o usuário arrasta a agulha pro mês em que quer ser contemplado e vê ao vivo a RECEITA pra chegar lá (lance embutido até 30% + lance próprio, crédito líquido, parcela). Use no passo 4, depois da recomendação/simulação, quando o usuário quer entender QUANDO e COMO antecipar a contemplação. Passe os dados do plano recomendado. Não mencione 'arraste o slider' — diga algo como 'escolhe quando você quer ser contemplado'.",
		inputSchema: z.object({
			administradora: z.string().optional().describe("Administradora do plano (contexto)"),
			category: z.enum(["imovel", "auto", "moto", "servicos"]).describe("Categoria do bem"),
			creditValue: z.number().positive().describe("Valor da carta (crédito) em reais"),
			termMonths: z.number().int().positive().describe("Prazo nominal do grupo em meses"),
			monthlyPayment: z.number().positive().describe("Parcela base em reais"),
			historicalWinningBidPct: z
				.number()
				.optional()
				.describe("Lance vencedor típico do grupo (% da carta), se conhecido"),
			maxEmbutidoPct: z.number().optional().describe("Teto do lance embutido (default 30)"),
			initialTargetMonth: z.number().int().positive().describe("Mês-alvo inicial da agulha"),
		}),
		execute: async (args: {
			administradora?: string;
			creditValue: number;
			initialTargetMonth: number;
		}) => {
			return `[Simulador-agulha apresentado: ${args.administradora ?? ""} carta R$ ${args.creditValue.toLocaleString("pt-BR")} — agulha em ${args.initialTargetMonth}m]`;
		},
	}),

	// FIX-106 — simulador de contemplação CONVERSACIONAL (loop). Versão de CÁLCULO
	// (paralela a compute_scenarios): RECALCULA o cenário pra um mês-alvo e DEVOLVE
	// os números pro agente NARRAR (WhatsApp + what-if de mês em qualquer canal).
	// A WEB mantém a agulha arrastável (present_contemplation_dial). Reusa o MESMO
	// motor puro (computeContemplationDial) — dial e conversa batem número a número.
	simulate_contemplation: tool({
		description:
			"[FIX-106] Recalcula o cenário de contemplação para um MÊS-ALVO — a versão CONVERSACIONAL do simulador (passo 4). Use no LOOP: quando o usuário escolhe/pergunta um mês ('e em 6 meses?', 'e se eu quiser em 1 ano?', 'dá pra antecipar?'), chame com os dados do plano recomendado (creditValue, termMonths, monthlyPayment — os MESMOS que ele já viu) + targetMonth. Retorna lance necessário (R$ e %), lance embutido × dinheiro, crédito líquido, parcela até contemplar e parcela após — NARRE esses números (R$ X.XXX,XX) com UMA ressalva de estimativa. Reusa o motor do simulador-agulha (mesmos números da web). NUNCA invente valores; tudo vem do cálculo. A WEB mantém a agulha (present_contemplation_dial); esta tool é o caminho por conversa.",
		inputSchema: z.object({
			creditValue: z
				.number()
				.positive()
				.describe("Valor da carta (crédito) em reais — do plano recomendado"),
			termMonths: z
				.number()
				.int()
				.positive()
				.describe("Prazo nominal do grupo em meses — do plano recomendado"),
			targetMonth: z
				.number()
				.int()
				.positive()
				.describe("Mês-alvo de contemplação que o usuário quer simular (a 'agulha')"),
			monthlyPayment: z
				.number()
				.positive()
				.describe("Parcela base do grupo em reais — do plano recomendado"),
			historicalWinningBidPct: z
				.number()
				.optional()
				.describe("Lance vencedor típico do grupo (% da carta), da oferta real, se conhecido"),
			referenceMonth: z
				.number()
				.int()
				.optional()
				.describe("Mês em que o lance de referência vence (da oferta real), se conhecido"),
			maxEmbutidoPct: z
				.number()
				.optional()
				.describe("Teto do lance embutido aceito pelo grupo (default 30)"),
		}),
		execute: async (args: {
			creditValue: number;
			termMonths: number;
			targetMonth: number;
			monthlyPayment: number;
			historicalWinningBidPct?: number;
			referenceMonth?: number;
			maxEmbutidoPct?: number;
		}) => {
			// Reuso obrigatório do motor puro (regra 6 do bloco) — dial e conversa
			// usam exatamente o mesmo cálculo, então os números nunca divergem.
			return computeContemplationDial(args);
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
						updatedAt: simulatorNow(),
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

	// ---- Conversational contact capture (texto livre + card UI) ----

	save_contact_name: tool({
		description:
			"Salva o nome do usuario capturado conversacionalmente. Chame IMEDIATAMENTE apos o usuario responder a pergunta 'como posso te chamar?'. Extraia SO o primeiro nome (ex: de 'sou o Alan Carlos da Silva' -> 'Alan'). Idempotente — chamar 2x com mesmo nome e seguro. NAO chame sem ter um nome real do usuario.",
		inputSchema: z.object({
			conversationId: z.string().describe("ID da conversa atual"),
			name: z
				.string()
				.min(2)
				.max(30)
				.describe("Primeiro nome do usuario, sem titulos ou sobrenomes"),
		}),
		execute: async (args) => {
			const { saveContactName } = await import("@/lib/leads/contact-capture");
			const result = await saveContactName(args.conversationId, args.name);
			if (!result.ok) {
				return `[Nome invalido: ${result.error}. Peca o nome novamente de forma natural.]`;
			}
			return `[Nome '${args.name}' salvo. Use-o nas proximas respostas.]`;
		},
	}),

	save_contact_whatsapp: tool({
		description:
			"Salva o WhatsApp do usuario no banco. Use APENAS quando o usuario enviar o phone via card present_whatsapp_optin (sistema chama esta tool internamente). NAO chame ao receber telefone por texto livre — peca pelo card.",
		inputSchema: z.object({
			conversationId: z.string().describe("ID da conversa atual"),
			phone: z.string().describe("Telefone com ou sem formatacao (a funcao normaliza)"),
		}),
		execute: async (args) => {
			const { saveContactWhatsapp } = await import("@/lib/leads/contact-capture");
			const result = await saveContactWhatsapp(args.conversationId, args.phone);
			if (!result.ok) {
				return `[Telefone invalido: ${result.error}]`;
			}
			return `[WhatsApp salvo. Lead promovido a 'engajado'.]`;
		},
	}),

	present_whatsapp_optin: tool({
		description:
			"Apresenta um card pedindo o WhatsApp do usuario com input mascarado + botoes 'Quero receber' / 'Agora nao'. Use UMA UNICA VEZ por conversa, APOS apresentar present_simulation_result ou present_recommendation_card pela primeira vez. NAO peca WhatsApp por texto — sempre via este card. Sistema impede chamadas duplicadas; se ja mostrado, esta tool retorna no-op visual.",
		inputSchema: z.object({}).optional(),
		execute: async () => {
			return "[Card WhatsApp opt-in apresentado ao usuario]";
		},
	}),

	// ---- Status REAL da proposta (FIX-14) ----
	// Schema VAZIO de proposito (anti-hallucination): o proposalId resolve
	// server-side via getLatestBeviProposal(conversationId) — closure na factory.
	// Esta versao estatica responde sentinel; o override com contexto vive em
	// buildConsorcioTools.

	check_proposal_status: tool({
		description:
			"Consulta o status REAL da proposta de consorcio do usuario na administradora, AO VIVO. Chame SEMPRE que o usuario perguntar status/andamento da proposta ja criada ('qual o status?', 'como ta minha proposta?', 'ja foi aprovada?'). Use a userMessage retornada como base da sua resposta — nunca invente estado. NAO use pra buscar/recomendar grupos.",
		inputSchema: z.object({}),
		execute: async () => STATUS_NO_CONTEXT,
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
	"present_whatsapp_optin",
	"present_decision_prompt",
	"present_contract_form",
	"present_contemplation_dial",
	"present_embedded_bid",
	"present_two_paths",
	"present_scarcity",
]);

// ============================================================================
// Factory per-request — tools com conversationId injetado via closure
// ----------------------------------------------------------------------------
// BUG-CONVERSATION-ID-HALLUCINATION (eval Camada 3 cirúrgico, commit 9080db4):
// modelo Claude inventava `conversationId: "conv_001"` ao chamar
// `save_contact_name`. UPDATE no DB falhava silenciosamente (0 rows),
// contact_name continuava NULL, form final aparecia vazio.
//
// Causa raiz: conversationId aparecia no `inputSchema` da tool, então o modelo
// tentava "preencher" como se fosse input do usuário — e alucinava.
//
// Fix arquitetural: conversationId é CONTEXTO da request, NÃO input do usuário.
// Tools sensíveis (`save_contact_name`, `save_contact_whatsapp`,
// `present_lead_form`) ganham versão refactorada via factory abaixo, com
// schema reduzido e conversationId injetado via closure.
//
// Builder de agent (`src/lib/agent/agents/builder.ts`) recebe `conversationId`
// em `opts` e usa esta factory pra montar as tools sensíveis. Tools que NÃO
// precisam de conversationId (search_groups, simulate_quota, etc.) seguem
// expostas via registry estático `consorcioTools`.
// ============================================================================

export type ConsorcioToolsContext = {
	/** UUID da conversation atual. Pode ser undefined em paths admin/preview que não persistem. */
	conversationId?: string;
	channel?: "web" | "whatsapp";
	/** FIX-193: perfil de lance do usuário (meta.qualifyAnswers.hasLance==="yes").
	 * Alimenta o desempate de tipoOferta no ranking (recommend_groups) — critério
	 * INTERNO, injetado via contexto da request (nunca input da LLM). */
	hasLance?: boolean;
	/** FIX-332: pós-reveal SEM troca de faixa (meta.revealCompleted===true e
	 * !revealValueTargetChanged(meta)) — search_groups/recommend_groups NÃO
	 * re-buscam a Bevi, devolvem os grupos JÁ EXIBIDOS nos artifacts. Calculado
	 * pelo chamador (builder.ts) a partir do meta; false/undefined preserva o
	 * comportamento de busca real (pré-reveal ou troca legítima de faixa). */
	reuseShownGroupsOnly?: boolean;
	/** Tools que a policy REALMENTE expôs nesta fase. As diretivas de recuperação
	 * (naoExibidoDirective) só podem nomear tool desta lista — nomear uma que a
	 * policy escondeu faz o modelo tomar NoSuchToolError e o turno inteiro cair no
	 * fallback enlatado. Ausente → comportamento antigo. */
	allowedToolNames?: readonly string[];
};

/**
 * Constrói o registry completo de tools com `conversationId` injetado via
 * closure nas tools sensíveis. Use ESTE no builder de agent — NÃO use
 * `consorcioTools` direto pras tools sensíveis (vaza conversationId no
 * schema e induz hallucination).
 */
export function buildConsorcioTools(ctx: ConsorcioToolsContext) {
	const { conversationId, hasLance, reuseShownGroupsOnly, allowedToolNames } = ctx;

	// FIX-179: o que já foi REALMENTE exibido em tela pro usuário nesta
	// conversa — seed via DB (turnos anteriores), atualizado ao vivo conforme
	// os present_* rodam NESTE turno. Lazy: só bate no banco se alguma das
	// tools guardadas (get_group_details/simulate_quota/present_decision_prompt)
	// for chamada.
	// FIX-186: a descoberta deste turno falhou (após retry ou erro duro)? Flag de
	// closure — fresco por turno (specialist+conversationId bypassa o cache de
	// agents, cada turno reconstrói buildConsorcioTools). Setado por runDiscovery;
	// lido pelas tools de descoberta (curto-circuito) e de apresentação (FIX-187,
	// não propor sobre dado que não carregou).
	let discoveryFailed = false;

	// FIX-289: grupos REAIS que search_groups já buscou NESTE turno — closure
	// fresca por turno (mesmo padrão de discoveryFailed/hasLance). recommend_groups
	// reaproveita quando os parâmetros (category/creditMin/creditMax) batem, em
	// vez de rebuscar do zero na Bevi (round-trip redundante). Parâmetros
	// divergentes (ex.: faixa de expansão) continuam disparando busca real —
	// isto NÃO paraleliza chamadas à Bevi, só elimina uma rebusca desnecessária.
	let lastSearchGroups: { params: SearchGroupsParams; groups: GroupSummary[] } | null = null;
	const sameSearchParams = (a: SearchGroupsParams, b: SearchGroupsParams): boolean =>
		a.category === b.category && a.creditMin === b.creditMin && a.creditMax === b.creditMax;

	let shownGroupsPromise: ReturnType<typeof loadShownGroups> | null = null;
	const getShownGroups = () => {
		if (!conversationId) return Promise.resolve(emptyShownGroups());
		if (!shownGroupsPromise) shownGroupsPromise = loadShownGroups(conversationId);
		return shownGroupsPromise;
	};
	const markShown = async (type: string, payload: unknown) => {
		const shown = await getShownGroups();
		const extracted = extractShownFromPayload(type, payload);
		for (const id of extracted.ids) shown.ids.add(id);
		for (const admin of extracted.administradoras) shown.administradoras.add(admin);
	};

	const save_contact_name = tool({
		description:
			"Salva o nome do usuario capturado conversacionalmente. Chame IMEDIATAMENTE apos o usuario responder a pergunta 'como posso te chamar?'. Extraia SO o primeiro nome (ex: de 'sou o Alan Carlos da Silva' -> 'Alan'). Idempotente — chamar 2x com mesmo nome e seguro. NAO chame sem ter um nome real do usuario.",
		inputSchema: z.object({
			name: z
				.string()
				.min(2)
				.max(30)
				.describe("Primeiro nome do usuario, sem titulos ou sobrenomes"),
		}),
		execute: async ({ name }: { name: string }) => {
			if (!conversationId) {
				return "[Erro: conversationId nao disponivel no contexto deste turno — tool nao pode persistir.]";
			}
			const { saveContactName } = await import("@/lib/leads/contact-capture");
			const result = await saveContactName(conversationId, name);
			if (!result.ok) {
				return `[Nome invalido: ${result.error}. Peca o nome novamente de forma natural.]`;
			}
			return `[Nome '${name}' salvo. Use-o nas proximas respostas.]`;
		},
	});

	const save_contact_whatsapp = tool({
		description:
			"Salva o WhatsApp do usuario no banco. Use APENAS quando o usuario enviar o phone via card present_whatsapp_optin (sistema chama esta tool internamente). NAO chame ao receber telefone por texto livre — peca pelo card.",
		inputSchema: z.object({
			phone: z.string().describe("Telefone com ou sem formatacao (a funcao normaliza)"),
		}),
		execute: async ({ phone }: { phone: string }) => {
			if (!conversationId) {
				return "[Erro: conversationId nao disponivel no contexto deste turno — tool nao pode persistir.]";
			}
			const { saveContactWhatsapp } = await import("@/lib/leads/contact-capture");
			const result = await saveContactWhatsapp(conversationId, phone);
			if (!result.ok) {
				return `[Telefone invalido: ${result.error}]`;
			}
			return `[WhatsApp salvo. Lead promovido a 'engajado'.]`;
		},
	});

	const present_lead_form = tool({
		description:
			"Apresenta o formulario inline de captura de dados do lead (nome, telefone, email) no chat. Use quando o usuario demonstrar interesse em uma recomendacao de consorcio.",
		inputSchema: leadFormSchemaNoCtx,
		execute: async () => {
			return "[Formulario de captura de dados do lead apresentado ao usuario]";
		},
	});

	// FIX-179 — overrides das tools de apresentação de grupo: mesma descrição/
	// schema/texto do registry estático, só adicionando o registro de "exibido"
	// (markShown) ANTES de devolver o feedback pro modelo. É o que alimenta a
	// trava de get_group_details/simulate_quota/present_decision_prompt abaixo.
	const present_group_card = tool({
		description: consorcioTools.present_group_card.description,
		inputSchema: groupCardSchema,
		execute: async (args: z.infer<typeof groupCardSchema>) => {
			await markShown("group_card", args);
			return `[Card do grupo ${args.administradora} - ${args.category} - R$ ${args.creditValue.toLocaleString("pt-BR")} apresentado ao usuario]`;
		},
	});

	const present_comparison_table = tool({
		description: consorcioTools.present_comparison_table.description,
		inputSchema: comparisonTableSchema,
		execute: async (args: z.infer<typeof comparisonTableSchema>) => {
			await markShown("comparison_table", args);
			return `[Tabela comparativa com ${args.groups.length} grupos apresentada ao usuario]`;
		},
	});

	const present_recommendation_card = tool({
		description: consorcioTools.present_recommendation_card.description,
		inputSchema: recommendationSchema,
		execute: async (args: z.infer<typeof recommendationSchema>) => {
			// FIX-187: proposta só sobre descoberta bem-sucedida no turno (action-policy
			// requireFreshDiscovery). Não usa shown-groups — o recommendation_card É a
			// exibição. Bloqueado → diretiva; o artifact-guard (2ª linha) dropa o card.
			const verdict = evaluateActionPrecondition("present_recommendation_card", {
				shown: emptyShownGroups(),
				args: args as Record<string, unknown>,
				discoveryFailedThisTurn: discoveryFailed,
			});
			if (!verdict.allow) return verdict.directive;
			await markShown("recommendation_card", args);
			// FIX-334: score deixou de ser input real (a LLM nao recebe mais o numero
			// cru) — a confirmacao textual so cita quando presente, nunca fabrica NaN%.
			const scoreSuffix =
				typeof args.score === "number" ? ` - Score ${(args.score * 100).toFixed(0)}%` : "";
			return `[Recomendacao apresentada: ${args.administradora} - ${args.category}${scoreSuffix}]`;
		},
	});

	const present_simulation_result = tool({
		description: consorcioTools.present_simulation_result.description,
		inputSchema: simulationResultSchema,
		execute: async (args: z.infer<typeof simulationResultSchema>) => {
			// FIX-187: os números da simulação só de descoberta bem-sucedida no turno.
			const verdict = evaluateActionPrecondition("present_simulation_result", {
				shown: emptyShownGroups(),
				args: args as Record<string, unknown>,
				discoveryFailedThisTurn: discoveryFailed,
			});
			if (!verdict.allow) return verdict.directive;
			return `[Simulacao apresentada: parcela R$ ${args.monthlyPayment.toFixed(2)}/mes por ${args.termMonths} meses]`;
		},
	});

	const present_decision_prompt = tool({
		description: consorcioTools.present_decision_prompt.description,
		inputSchema: z.object({
			administradora: z
				.string()
				.optional()
				.describe("Administradora do plano recomendado (contexto do card)"),
		}),
		execute: async (args: { administradora?: string }) => {
			// FIX-180 (administradora exibida) + FIX-187 (descoberta fresca) via
			// tabela declarativa (action-policy). Agora avalia SEMPRE — mesmo sem
			// administradora, o gate de descoberta falhada (FIX-187) precisa rodar.
			// Lazy: só bate no DB (getShownGroups) quando há administradora a validar.
			const shown = args.administradora ? await getShownGroups() : emptyShownGroups();
			const verdict = evaluateActionPrecondition("present_decision_prompt", {
				shown,
				args: args as Record<string, unknown>,
				discoveryFailedThisTurn: discoveryFailed,
			});
			if (!verdict.allow) return verdict.directive;
			return `[Card de decisão apresentado${args.administradora ? ` para o plano ${args.administradora}` : ""}]`;
		},
	});

	// ── Descoberta REAL por conversa (MOCK-RUNTIME-MORTO, 2026-06-04) ──
	// O adapter Bevi (Trilho B) é resolvido via closure do conversationId; o
	// registry estático responde erro informativo. Sem identidade (gate identify,
	// D1) o adapter lança IdentityNotCollectedError — o orquestrador garante a
	// ordem do funil; o erro é tripwire, nunca fallback fictício.
	const discovery = () => {
		if (!conversationId) return null;
		return getDiscoveryAdapter(conversationId);
	};

	// BUG-BEVI-EMPTY-ENV (2026-06-04): o AI SDK converte o throw da tool em
	// tool-error pro MODELO ("instabilidade") sem deixar rastro no servidor — um
	// Invalid URL de config levou horas pra diagnosticar. Todo erro de descoberta
	// é logado estruturado.
	//
	// FIX-186 (Kairo 2026-07-01): runDiscovery NÃO re-lança mais. Um throw numa
	// tool do AI SDK vira tool-error que o modelo NARRA ("dificuldade técnica
	// pontual" + preâmbulos "vou buscar" empilhados). Em vez disso: 1 retry
	// silencioso DETERMINÍSTICO em erro transitório (rede/timeout/5xx — não o
	// modelo "tentando de novo" em texto) e, na falha (ou erro duro), retorna o
	// marcador `discoveryFailedResult`. O runner materializa o fallback humano
	// (Lei 1). Seta `discoveryFailed` pro turno curto-circuitar as próximas tools.
	const logDiscoveryError = (toolName: string, phase: "first" | "retry", err: unknown) => {
		console.error(
			JSON.stringify({
				level: "error",
				source: "discovery",
				tool: toolName,
				phase,
				conversation_id: conversationId,
				error_name: err instanceof Error ? err.name : "unknown",
				error_message: err instanceof Error ? err.message : String(err),
			}),
		);
	};
	const runDiscovery = async <T>(
		toolName: string,
		fn: () => Promise<T>,
	): Promise<T | { __discoveryFailed: true; error: string }> => {
		// Curto-circuito: a descoberta já falhou neste turno → não martela a Bevi.
		if (discoveryFailed) return discoveryFailedResult(toolName);
		// FIX-291 (a): deadline ÚNICO pra esta invocação — 1ª tentativa + retry
		// compartilham o MESMO teto agregado (nunca somam orçamentos independentes).
		const deadline = Date.now() + discoveryBudgetMs;
		try {
			return await withDiscoveryBudget(fn(), deadline);
		} catch (err) {
			logDiscoveryError(toolName, "first", err);
			const remaining = deadline - Date.now();
			// Erro transitório E ainda sobra orçamento → 1 retry silencioso
			// (determinístico, não o modelo). Sem orçamento restante, retentar não
			// ganha nada — só atrasa mais a degradação honesta (root cause: o
			// retry daqui reexecutava a função inteira, dobrando o pior caso).
			if (isTransientDiscoveryError(err) && remaining > 0) {
				if (discoveryRetryDelayMs > 0) {
					await new Promise((resolve) =>
						setTimeout(resolve, Math.min(discoveryRetryDelayMs, remaining)),
					);
				}
				try {
					return await withDiscoveryBudget(fn(), deadline);
				} catch (retryErr) {
					logDiscoveryError(toolName, "retry", retryErr);
					discoveryFailed = true;
					return discoveryFailedResult(toolName);
				}
			}
			// Erro duro (config/4xx) ou orçamento esgotado: nunca cura no retry →
			// fallback direto.
			discoveryFailed = true;
			return discoveryFailedResult(toolName);
		}
	};

	const search_groups = tool({
		// FIX-70: opt-in `sweep` (varredura multi-faixa) só na tool por-request — a
		// versão estática (registry) segue como sentinel sem contexto.
		// FIX-332: pós-reveal sem troca de faixa, a tool não busca de novo — ver
		// nota no corpo do execute.
		description: `${consorcioTools.search_groups.description} Passe sweep=true pra varrer varias faixas de valor de uma vez e montar um comparativo com alternativas reais. Pós-reveal, sem troca de faixa, devolve os grupos já exibidos nesta conversa em vez de buscar de novo.`,
		inputSchema: searchGroupsSweepInput,
		execute: async (args: z.infer<typeof searchGroupsSweepInput>) => {
			// FIX-332: pós-reveal com o MESMO valor-alvo, NÃO re-busca a Bevi (custo +
			// write conflict, PROIBIDO pelo invariante) — devolve os grupos JÁ
			// EXIBIDOS. Sem isso, search_groups ficava fora do toolset da fase reveal
			// e o modelo tomava NoSuchToolError ao tentar detalhar/simular uma oferta
			// já mostrada, descartando a fala inteira do turno pro fallback enlatado.
			if (reuseShownGroupsOnly) {
				if (!conversationId) return DISCOVERY_NO_CONTEXT;
				return shownGroupsSearchResult(await listShownOffersForConversation(conversationId));
			}
			const adapter = discovery();
			if (!adapter) return DISCOVERY_NO_CONTEXT;
			return runDiscovery("search_groups", async () => {
				const { result, raw } = await executeSearchGroups(adapter, args);
				// FIX-289: cacheia os grupos crus pro recommend_groups reaproveitar
				// se chamado no mesmo turno com parâmetros equivalentes.
				lastSearchGroups = { params: args, groups: raw };
				return result;
			});
		},
	});

	const simulate_quota = tool({
		description: consorcioTools.simulate_quota.description,
		inputSchema: simulateQuotaInput,
		execute: async (args: z.infer<typeof simulateQuotaInput>) => {
			const adapter = discovery();
			if (!adapter) return DISCOVERY_NO_CONTEXT;
			// FIX-180: precondição de dado via tabela declarativa (action-policy) —
			// grupo real na Bevi mas nunca exibido em tela → bloqueia ANTES de tocar o
			// adapter (camada "foi exibido", roda antes do rebuscaDirective/FIX-72
			// "existe na Bevi"). Generaliza o FIX-179 (antes um if inline aqui).
			const shown = await getShownGroups();
			const verdict = evaluateActionPrecondition("simulate_quota", {
				shown,
				args: args as Record<string, unknown>,
				allowedTools: allowedToolNames,
			});
			if (!verdict.allow) return { error: verdict.directive };
			return runDiscovery("simulate_quota", () =>
				executeSimulateQuota(adapter, args, allowedToolNames),
			);
		},
	});

	const get_rates = tool({
		description: consorcioTools.get_rates.description,
		inputSchema: getRatesInput,
		execute: async (args: z.infer<typeof getRatesInput>) => {
			const adapter = discovery();
			if (!adapter) return DISCOVERY_NO_CONTEXT;
			return runDiscovery("get_rates", () => executeGetRates(adapter, args));
		},
	});

	const get_group_details = tool({
		description: consorcioTools.get_group_details.description,
		inputSchema: getGroupDetailsInput,
		execute: async (args: z.infer<typeof getGroupDetailsInput>) => {
			const adapter = discovery();
			if (!adapter) return DISCOVERY_NO_CONTEXT;
			// FIX-180: mesma precondição de dado (action-policy) do simulate_quota.
			const shown = await getShownGroups();
			const verdict = evaluateActionPrecondition("get_group_details", {
				shown,
				args: args as Record<string, unknown>,
				allowedTools: allowedToolNames,
			});
			if (!verdict.allow) return { error: verdict.directive };
			return runDiscovery("get_group_details", () =>
				executeGetGroupDetails(adapter, args, allowedToolNames),
			);
		},
	});

	const recommend_groups = tool({
		description: `${consorcioTools.recommend_groups.description} Pós-reveal, sem troca de faixa, devolve os grupos já exibidos nesta conversa em vez de buscar de novo.`,
		inputSchema: recommendGroupsSchema,
		execute: async (args: z.infer<typeof recommendGroupsSchema>) => {
			// FIX-332: mesma interceptação de search_groups — pós-reveal com o
			// MESMO valor-alvo, não re-busca a Bevi.
			if (reuseShownGroupsOnly) {
				if (!conversationId) return DISCOVERY_NO_CONTEXT;
				return shownGroupsSearchResult(await listShownOffersForConversation(conversationId));
			}
			const adapter = discovery();
			if (!adapter) return DISCOVERY_NO_CONTEXT;
			// FIX-289: reaproveita search_groups do MESMO turno se os parâmetros
			// de busca baterem — evita rebuscar do zero na Bevi.
			const { budget: _budget, desiredTermMonths: _desiredTermMonths, ...searchParams } = args;
			const seedGroups =
				lastSearchGroups && sameSearchParams(lastSearchGroups.params, searchParams)
					? lastSearchGroups.groups
					: undefined;
			// FIX-193: hasLance vem do contexto da request (perfil), não da LLM.
			return runDiscovery("recommend_groups", () =>
				executeRecommendGroups(adapter, args, { hasLance, seedGroups }),
			);
		},
	});

	// ── Status REAL da proposta (FIX-14) ──
	// proposalId NUNCA vem do modelo: resolve via getLatestBeviProposal
	// (conversationId via closure). checkProposalStatus nunca lança — erros viram
	// { ok:false, userMessage } honesto com log estruturado proprio.
	// A CURVA DO CÁLCULO NÃO É DO MODELO.
	//
	// O schema conversacional aceitava `creditValue`, `termMonths`,
	// `historicalWinningBidPct`, `referenceMonth` e `maxEmbutidoPct` vindos da
	// LLM e despejava tudo cru no motor. Resultado: o MESMO mês-alvo respondia
	// números diferentes conforme o turno — "pra contemplar no mês 17 o lance é
	// 37%" e, dois turnos depois, "46%" pra exatamente a mesma carta. O lance
	// necessário é propriedade do GRUPO e do mês, não da origem do dinheiro;
	// tirar o embutido muda só a REPARTIÇÃO (quem paga), nunca o total.
	//
	// A web nunca teve esse problema porque `coerceDialPayload` descarta o que o
	// modelo manda e reancora na oferta real. Aqui é a mesma regra: o modelo
	// escolhe O QUE perguntar (o mês, e se entra embutido); os números vêm da
	// oferta ancorada. Sem oferta, não se fabrica cenário.
	const simulate_contemplation = tool({
		description: consorcioTools.simulate_contemplation.description,
		inputSchema: z.object({
			targetMonth: z
				.number()
				.int()
				.positive()
				.describe("Mês-alvo de contemplação que o usuário quer simular"),
			usarLanceEmbutido: z
				.boolean()
				.optional()
				.describe(
					"false quando o cliente RECUSOU lance embutido (quer usar só dinheiro próprio). Muda apenas a repartição do lance, nunca o total necessário.",
				),
		}),
		execute: async (args: { targetMonth: number; usarLanceEmbutido?: boolean }) => {
			if (!conversationId) return SIMULACAO_SEM_OFERTA;
			const { reloadMeta } = await import("@/lib/conversation/meta");
			const meta = await reloadMeta(conversationId).catch(() => null);
			const offer = meta?.recommendedOffer;
			if (!offer?.creditValue || !offer.termMonths || !offer.monthlyPayment) {
				return SIMULACAO_SEM_OFERTA;
			}
			return computeContemplationDial({
				creditValue: offer.creditValue,
				termMonths: offer.termMonths,
				monthlyPayment: offer.monthlyPayment,
				targetMonth: args.targetMonth,
				// Fonte preferencial do motor (contemplation-dial.ts) — não era nem
				// exposta no schema conversacional, então nunca chegava.
				...(offer.avgBidValue != null ? { averageBid: offer.avgBidValue } : {}),
				...(args.usarLanceEmbutido === false ? { maxEmbutidoPct: 0 } : {}),
				// O que ele declarou ter guardado entra antes de comer a carta.
				...(meta?.qualifyAnswers?.lanceValue != null
					? { ownCashAvailable: meta.qualifyAnswers.lanceValue }
					: {}),
			});
		},
	});

	// "ESSA PARCELA NÃO CABE PRA MIM" PRECISA TER RESPOSTA.
	//
	// Faltava o caminho inteiro: uma cliente disse que R$ 4.384 pesava no
	// orçamento, pediu algo perto de R$ 2.500, o agente reconheceu certo — e
	// então não existia nada pra fazer. Cinco tentativas de recalcular, cinco
	// falhas, handoff, venda perdida. E é o perfil mais comum: quem tem orçamento
	// apertado é justamente quem mais precisa de consórcio.
	//
	// A conta é determinística e sai da cota REAL ancorada (parcela e crédito que
	// a administradora devolveu): crédito-alvo = crédito × (parcela desejada ÷
	// parcela atual). Nenhum número é inventado — isto só reposiciona a FAIXA DE
	// BUSCA; quem devolve as cotas continua sendo a administradora, no nó de
	// descoberta, que re-dispara sozinho ao ver o alvo novo.
	const ajustar_por_parcela = tool({
		description:
			"Use quando o cliente disser que a parcela está alta e indicar quanto caberia por mês ('só consigo uns 2500', 'no máximo 1800'). Reposiciona a busca para cartas cuja parcela caiba nesse valor e devolve o novo crédito-alvo. NÃO invente o valor da nova carta: apresente o que a busca seguinte trouxer.",
		inputSchema: z.object({
			parcelaDesejada: z
				.number()
				.positive()
				.describe("Quanto o cliente disse que consegue pagar por mês, em reais"),
		}),
		execute: async (args: { parcelaDesejada: number }) => {
			if (!conversationId) return SIMULACAO_SEM_OFERTA;
			const { reloadMeta } = await import("@/lib/conversation/meta");
			const meta = await reloadMeta(conversationId).catch(() => null);
			const offer = meta?.recommendedOffer;
			if (!meta || !offer?.creditValue || !offer.monthlyPayment) return SIMULACAO_SEM_OFERTA;
			if (args.parcelaDesejada >= offer.monthlyPayment) {
				return {
					jaCabe: true,
					parcelaAtual: offer.monthlyPayment,
					mensagem:
						"A parcela atual já está dentro do que ele falou — não há o que reduzir; siga com a cota atual.",
				};
			}
			const creditoAlvo = Math.round(
				offer.creditValue * (args.parcelaDesejada / offer.monthlyPayment),
			);
			// NÃO persiste daqui. Esta tool roda DENTRO do nó de conversa, e o nó de
			// persistência do grafo grava o estado dele logo depois — apagando o que
			// fosse escrito por fora. Foi exatamente o que aconteceu: a busca nunca
			// via a faixa nova e o agente ficava repetindo "as opções já vão aparecer"
			// sem nada aparecer, travando o funil de quem pediu parcela menor.
			// Quem aplica a mudança é o `converse`, pelo estado do grafo (mesmo
			// padrão do `suggest_handoff`).
			return {
				creditoAlvo,
				parcelaDesejada: args.parcelaDesejada,
				parcelaAtual: offer.monthlyPayment,
				creditoAtual: offer.creditValue,
				aviso:
					"Busca reposicionada. As cartas reais dessa faixa vêm no próximo passo — não antecipe valores. Diga a ele que a carta menor cobre menos do bem, com o número exato quando a busca voltar.",
			};
		},
	});

	// Mesma ancoragem do `simulate_contemplation`: os cenários saem da oferta
	// real, então o lance que o card mostra pro mês X é o MESMO que a conversa
	// responde quando ele pergunta pelo mês X.
	const compute_scenarios = tool({
		description: consorcioTools.compute_scenarios.description,
		inputSchema: z.object({
			usarLanceEmbutido: z
				.boolean()
				.optional()
				.describe("false quando o cliente recusou lance embutido"),
		}),
		execute: async (args: { usarLanceEmbutido?: boolean }) => {
			if (!conversationId) return SIMULACAO_SEM_OFERTA;
			const { reloadMeta } = await import("@/lib/conversation/meta");
			const meta = await reloadMeta(conversationId).catch(() => null);
			const offer = meta?.recommendedOffer;
			if (!offer?.creditValue || !offer.termMonths) return SIMULACAO_SEM_OFERTA;
			return computeScenarios({
				creditValue: offer.creditValue,
				termMonths: offer.termMonths,
				...(offer.monthlyPayment != null ? { monthlyPayment: offer.monthlyPayment } : {}),
				...(offer.avgBidValue != null ? { averageBid: offer.avgBidValue } : {}),
				...(meta?.qualifyAnswers?.lanceValue != null
					? { ownCashAvailable: meta.qualifyAnswers.lanceValue }
					: {}),
				...(args.usarLanceEmbutido === false ? { maxEmbutidoPct: 0 } : {}),
			});
		},
	});

	const check_proposal_status = tool({
		description: consorcioTools.check_proposal_status.description,
		inputSchema: z.object({}),
		execute: async () => {
			if (!conversationId) return STATUS_NO_CONTEXT;
			const { checkProposalStatus } = await import("@/lib/bevi/proposal-status");
			return checkProposalStatus(conversationId);
		},
	});

	return {
		...consorcioTools,
		// Overrides — schema reduzido (sem conversationId) + closure.
		save_contact_name,
		save_contact_whatsapp,
		present_lead_form,
		// Overrides — descoberta real por conversa (adapter Bevi Trilho B).
		search_groups,
		simulate_quota,
		get_rates,
		get_group_details,
		recommend_groups,
		// Overrides — FIX-179: registram "exibido" (markShown) e guardam a trava
		// de get_group_details/simulate_quota/present_decision_prompt acima.
		// FIX-187: present_recommendation_card/present_simulation_result/
		// present_decision_prompt recusam quando a descoberta do turno falhou.
		present_group_card,
		present_comparison_table,
		present_recommendation_card,
		present_simulation_result,
		present_decision_prompt,
		// Override — status real da proposta (FIX-14).
		check_proposal_status,
		// Overrides — cenário de contemplação ancorado na oferta real (a LLM não
		// calibra a curva; ver comentário na definição).
		simulate_contemplation,
		compute_scenarios,
		// A resposta pra "essa parcela não cabe pra mim".
		ajustar_por_parcela,
	};
}
