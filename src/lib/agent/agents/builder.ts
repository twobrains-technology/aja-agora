import { stepCountIs, type ToolChoice, ToolLoopAgent } from "ai";
import { createGatewayAnthropic } from "@/lib/llm/gateway-anthropic";
import { createGatewayOpenAI } from "@/lib/llm/gateway-openai";
import { isNativeAnthropicModel } from "@/lib/llm/model-provider";
import { buildMemorySystemMessage } from "@/lib/memory/reactivation";
import type { MemoryContext } from "@/lib/memory/types";
import { allowedTools } from "../orchestrator/tool-policy";
import type { ConversationMetadata } from "../personas";
import {
	buildConciergePrompt,
	buildSpecialistPrompt,
	type ContractClosedInfo,
	type ExpertiseLevel,
	type PersonaRow,
	type WhatsappOptinStage,
} from "../system-prompt";
import { buildConsorcioTools, consorcioTools } from "../tools/ai-sdk";

const anthropic = createGatewayAnthropic();
const openaiCompat = createGatewayOpenAI();

type ConsorcioToolName = keyof typeof consorcioTools;
type ConsorcioToolSet = Record<string, (typeof consorcioTools)[ConsorcioToolName]>;

function selectTools(
	activeTools: string[],
	// Registry usado pra resolver `activeTools` — pode ser o estático
	// (compat com paths legados) ou o produto da factory `buildConsorcioTools`
	// (com closures de conversationId). O builder default usa a factory.
	// biome-ignore lint/suspicious/noExplicitAny: tools shape opaco
	registry: Record<string, any> = consorcioTools,
): ConsorcioToolSet {
	const out: ConsorcioToolSet = {};
	for (const name of activeTools) {
		if (name in registry) {
			out[name] = registry[name];
		}
	}
	return out;
}

/**
 * Constrói um specialist/concierge `ToolLoopAgent`. `opts` é opcional pra
 * preservar callers existentes (preview routes, testes legados).
 *
 * - `currentDate`: data corrente do turno (em time-travel, `simulatorNow()`
 *   capturada no scope ALS pelo runner). Injetada como `<current_date>` no
 *   system prompt — garante que o LLM raciocine com a data simulada e não
 *   com o cutoff de treinamento.
 * - `memoryContext`: contexto Letta carregado pelo orchestrator-bridge.
 *   Quando passado, é renderizado como bloco extra de instructions dentro
 *   do próprio agent (ao invés de só prepend no orchestrator) — garante que
 *   specialist nasça memory-aware mesmo em paths alternativos (preview,
 *   processor WhatsApp), e que memória vise consistente mesmo se prepend
 *   no orchestrator falhar.
 */
export function buildAgent(
	row: PersonaRow,
	expertise: ExpertiseLevel = "neutro",
	opts: {
		currentDate?: Date;
		memoryContext?: MemoryContext | null;
		/**
		 * UUID da conversation atual. Propagado pelo orchestrator/runner pro
		 * builder, e daqui pra `buildConsorcioTools({ conversationId })` que
		 * injeta como closure nas tools sensíveis (`save_contact_name`,
		 * `save_contact_whatsapp`, `present_lead_form`).
		 *
		 * Por que: BUG-CONVERSATION-ID-HALLUCINATION — quando `conversationId`
		 * aparecia no `inputSchema` da tool, o modelo inventava valores
		 * ("conv_001") e o UPDATE no Postgres não acertava linha. Removido
		 * do schema, injetado via closure aqui.
		 *
		 * Quando undefined (paths admin/preview), as tools sensíveis ainda
		 * existem mas o execute retorna erro informativo — paths admin não
		 * persistem mesmo, então é OK.
		 */
		conversationId?: string;
		/** Canal da conversa atual — propagado pra factory de tools por simetria. */
		channel?: "web" | "whatsapp";
		/**
		 * FIX-5: estagio do opt-in de WhatsApp (locked/open/done), derivado do
		 * meta da conversa pela resolveAgent (deriveWhatsappOptinStage). Entra
		 * no bloco DINAMICO do prompt — pre-reveal o modelo recebe proibicao
		 * explicita em vez das frases-modelo de opt-in (que ele imitava cedo
		 * demais, em texto livre, por fora do guard de artifact).
		 * Default "locked" (seguro) quando omitido.
		 */
		whatsappOptinStage?: WhatsappOptinStage;
		/**
		 * FIX-11: estado TERMINAL do fechamento (contrato fechado nesta
		 * conversa), derivado do meta + bevi_proposals pela resolveAgent.
		 * Quando presente, o bloco DINAMICO do prompt carrega a secao de
		 * contrato fechado (NUNCA negar o fechamento, PROIBIDO re-descoberta/
		 * outra administradora, status respondido do estado). Default null
		 * (sem contrato) — comportamento atual.
		 */
		contractClosedInfo?: ContractClosedInfo | null;
		/**
		 * FIX-19: meta corrente da conversa — fonte da fase da jornada pra
		 * tool-policy (`allowedTools`). Quando presente, o toolset montado
		 * abaixo é FILTRADO pela fase: tool fora de fase NEM ENTRA no request
		 * (contract_form pré-reveal, descoberta pós-fechamento etc. — família
		 * FIX-11/FIX-12/BUG-REVEAL-LOOP). Quando omitido (preview/admin/testes
		 * legados), superfície completa — comportamento anterior preservado.
		 */
		meta?: ConversationMetadata | null;
		/**
		 * Força o modelo a chamar uma tool específica neste turno.
		 *
		 * Quando passado, é repassado pro `ToolLoopAgent` como `toolChoice`
		 * — Anthropic obriga o modelo a usar essa tool antes de qualquer
		 * texto. Usado no fix BUG-SHORT-GREETING-AFTER-NAME (Nível 1) pra
		 * forçar `save_contact_name` quando o turn é "user respondeu com
		 * nome" (detectado em `orchestrator/detect-name-turn.ts`).
		 *
		 * Agent cache em `agents/index.ts` é bypassed quando esse opt é
		 * passado — agent ad-hoc construído a cada turn forçado (raro,
		 * só 1 vez por conversa, ok).
		 */
		toolChoice?: ToolChoice<ConsorcioToolSet>;
		/**
		 * FIX-77: blocos de system DINÂMICOS por turno (systemContext —
		 * knownName/experience/doubts — + examplesBlock filtrados) que ANTES o
		 * orchestrator prependava DENTRO do array `messages` de agent.stream(...),
		 * disparando o warning de prompt-injection da AI SDK a cada turno e
		 * injetando a memória Letta em dobro. Agora chegam aqui e são anexados ao
		 * fim do `instructions` (mapeado pro campo `system` pela SDK — sem warning),
		 * DEPOIS de stable/dynamic/memory e SEM `cacheControl` — o prefixo cacheado
		 * (stable, 1º item, único com ephemeral) fica intacto.
		 */
		extraSystemBlocks?: string[];
	} = {},
): ToolLoopAgent {
	const isConcierge = row.role === "concierge";
	const blocks = isConcierge
		? buildConciergePrompt(row)
		: buildSpecialistPrompt(
				row,
				expertise,
				opts.currentDate,
				opts.whatsappOptinStage,
				opts.contractClosedInfo ?? null,
				opts.meta?.qualifyAnswers?.motivation ?? null,
				// FIX-238: bem específico do gate `desire` — dispara a pergunta
				// do motivo enquanto ele ainda não chegou.
				opts.meta?.qualifyAnswers?.desiredItem ?? null,
			);

	// Factory per-build: tools sensíveis (save_contact_name, save_contact_whatsapp,
	// present_lead_form) ganham conversationId via closure — schema fica reduzido,
	// modelo não alucina ID. Tools não-sensíveis vêm direto do registry estático.
	// Ver `tools/ai-sdk.ts` (buildConsorcioTools) pro racional do BUG-
	// CONVERSATION-ID-HALLUCINATION.
	const registry = buildConsorcioTools({
		conversationId: opts.conversationId,
		channel: opts.channel,
		// FIX-193: perfil de lance → desempate de tipoOferta no recommend_groups
		// (critério interno). Vem do meta, nunca da LLM.
		hasLance: opts.meta?.qualifyAnswers?.hasLance === "yes",
	});

	// Specialists always have suggest_handoff + as ferramentas de captura
	// conversacional de lead (save_contact_name, save_contact_whatsapp,
	// present_whatsapp_optin) + o seletor interativo de valores
	// (present_value_picker) + o seletor de tópicos clicáveis
	// (present_topic_picker) disponíveis — são primitivos do sistema, não
	// comportamento toggleable pelo admin. Sem essas tools no contexto, o
	// agent não consegue persistir o nome/WhatsApp capturados na conversa
	// (BUG-LEAD-CAPTURE-WEB) nem renderizar o card de seleção de faixa de
	// crédito (BUG-CREDIT-PICKER-WEB) nem oferecer atalhos clicáveis em vez
	// de prometer "opções abaixo" sem produzir UI (BUG-TOPIC-PICKER-WEB) —
	// cai em texto puro violando o system-prompt.
	// CINTO+SUSPENSÓRIO: migrations 0015/0017/0019 também adicionam no DB; o
	// invariante aqui garante que mesmo se admin remover via UI futuramente,
	// o builder ainda expõe (mesmo padrão do suggest_handoff).
	// Concierge não qualifica usuários → não precisa nenhuma dessas tools.
	const unfilteredTools = isConcierge
		? {}
		: {
				...selectTools(row.activeTools, registry),
				suggest_handoff: registry.suggest_handoff,
				save_contact_name: registry.save_contact_name,
				save_contact_whatsapp: registry.save_contact_whatsapp,
				present_whatsapp_optin: registry.present_whatsapp_optin,
				present_value_picker: registry.present_value_picker,
				present_topic_picker: registry.present_topic_picker,
				// FIX-253 (rodada 4): present_decision_prompt SAIU daqui de propósito —
				// o card de decisão "Esse plano faz sentido?" (jornada do .docx etapa 4)
				// virou emissão SERVER-SIDE determinística (buildDecisionPromptCard,
				// orchestrator/server-cards.ts). A tool NUNCA entra em allowedTools
				// (tool-policy.ts) em nenhuma fase — listá-la aqui seria morta/enganosa.
				// Passo 5 "Contratar" (fechamento Bevi) + simulador-agulha (passo 4) —
				// primitivos do sistema, sempre expostos.
				present_contract_form: registry.present_contract_form,
				present_contemplation_dial: registry.present_contemplation_dial,
				// FIX-106: simulador de contemplação CONVERSACIONAL (cálculo p/ loop por
				// texto/WhatsApp) — primitivo do sistema, sempre exposto (como a agulha).
				simulate_contemplation: registry.simulate_contemplation,
				// Status REAL da proposta (FIX-14) — primitivo do sistema: pergunta de
				// status tem que funcionar mesmo se o admin nao listar em activeTools.
				check_proposal_status: registry.check_proposal_status,
			};

	// FIX-19: gating a montante — com `meta` presente, só as tools da FASE atual
	// da jornada entram no request ("primitivos sempre presentes" viram
	// "presentes nas fases certas"). Interseção, nunca união: a policy não
	// adiciona tool que o admin/builder não exporia.
	let tools = unfilteredTools;
	if (!isConcierge && opts.meta) {
		const allowed = new Set(allowedTools(opts.meta, opts.channel));
		tools = Object.fromEntries(
			Object.entries(unfilteredTools).filter(([name]) => allowed.has(name)),
		);
	}

	// Memory inline — renderizado como system message extra dentro das
	// instructions do agent, pra specialist nascer memory-aware mesmo sem
	// depender do prepend do orchestrator.
	const memoryText = opts.memoryContext ? buildMemorySystemMessage(opts.memoryContext) : null;

	const baseInstructions = blocks.dynamic
		? [
				{
					role: "system" as const,
					content: blocks.stable,
					providerOptions: {
						anthropic: { cacheControl: { type: "ephemeral" as const, ttl: "1h" as const } },
					},
				},
				{ role: "system" as const, content: blocks.dynamic },
			]
		: [
				{
					role: "system" as const,
					content: blocks.stable,
					providerOptions: {
						anthropic: { cacheControl: { type: "ephemeral" as const, ttl: "1h" as const } },
					},
				},
			];

	const withMemory = memoryText
		? [...baseInstructions, { role: "system" as const, content: memoryText }]
		: baseInstructions;

	// FIX-77: os blocos dinâmicos por turno (systemContext + examplesBlock) entram
	// no FIM do instructions, SEM cacheControl — preserva o prefixo cacheado
	// (stable continua 1º item, byte-idêntico, único com ephemeral). Vinham em
	// `messages` (warning de prompt-injection + memória Letta duplicada).
	const extraBlocks = (opts.extraSystemBlocks ?? [])
		.filter((b): b is string => Boolean(b))
		.map((content) => ({ role: "system" as const, content }));
	const instructions = [...withMemory, ...extraBlocks];

	// FIX-180 — belt nativo do eixo ESTADO→AÇÃO. `prepareStep.activeTools` é o
	// primitivo OFICIAL do AI SDK 6 pra restringir o subconjunto de tools por step
	// (ai-sdk.dev/docs/agents/loop-control). Aqui ele RE-AFIRMA, a cada step, a
	// allowlist da fase (o `tools` já foi filtrado por `allowedTools(meta)` acima —
	// 1ª linha fail-closed + chave de cache em agents/index.ts). O belt torna a
	// governança estado→ação explícita no primitivo nativo e COMPÕE com a reversão
	// do toolChoice forçado (BUG-MUTE-LOOP). Só entra com `meta` presente (specialist
	// em produção); preview/admin/testes legados sem meta preservam o comportamento.
	// ADR: docs/correcoes/decisions/2026-07-01-bloco-a-governanca-agente.md.
	const beltActiveTools = !isConcierge && opts.meta ? Object.keys(tools) : null;
	// BUG-MUTE-LOOP-NAME-CAPTURE (2026-07-01): sem prepareStep, a AI SDK reaplica o
	// MESMO toolChoice em TODOS os steps do loop (stopWhen: stepCountIs(10)) — o
	// Anthropic fica OBRIGADO a chamar save_contact_name em CADA step e NUNCA produz
	// texto (tool_choice força tool_use). Sintoma real (WhatsApp): save_contact_name
	// 10x, textChars:0, agente mudo. Fix: preserva o forcing só no 1º step e reverte
	// pra 'auto' nos seguintes. Um único prepareStep cobre o belt + a reversão.
	const prepareStep =
		opts.toolChoice || beltActiveTools
			? ({ stepNumber }: { stepNumber: number }) => ({
					...(beltActiveTools ? { activeTools: beltActiveTools } : {}),
					...(opts.toolChoice
						? { toolChoice: stepNumber > 0 ? ("auto" as const) : (opts.toolChoice ?? undefined) }
						: {}),
				})
			: undefined;

	// FIX-209 — Claude Sonnet 5: adaptive thinking LIGA por default quando o campo
	// `thinking` é omitido (no Sonnet 4.6 era off por omissão). Isso adiciona
	// latência e uma pausa antes do 1º token, quebrando o constraint de <3s do
	// chat. Desligamos explicitamente (decisão do Kairo, 2026-07-02). É config de
	// nível-request do @ai-sdk/anthropic (não tem relação com o cacheControl dos
	// blocos de system) — por isso mora numa const própria, aplicada via
	// `providerOptions` das settings.
	const anthropicProviderOptions = {
		anthropic: { thinking: { type: "disabled" as const } },
	};

	// Modelos custom (ex: Qwen) não são nativos da Anthropic — o gateway
	// LiteLLM quebra `tool_choice` ao traduzir /v1/messages pra um backend
	// `openai/`-compatible. Esses vão pelo client OpenAI-compatible (sem
	// tradução) e sem os providerOptions específicos da Anthropic (ver
	// qwen-gateway-provider.test.ts).
	const modelId = process.env.AI_MODEL ?? "claude-sonnet-5";
	const modelIsNativeAnthropic = isNativeAnthropicModel(modelId);

	const settings = {
		model: modelIsNativeAnthropic ? anthropic(modelId) : openaiCompat(modelId),
		instructions,
		tools,
		// FIX-209 — Sonnet 5 rejeita `temperature` não-default (400), então NÃO
		// passamos mais sampling params. O tom por persona passa a ser guiado pelo
		// system prompt/traits (as personas já têm prompts distintos); se alguma
		// regredir de tom, reforça-se no prompt — não no sampling.
		...(modelIsNativeAnthropic ? { providerOptions: anthropicProviderOptions } : {}),
		stopWhen: stepCountIs(isConcierge ? 1 : 10),
		// toolChoice: quando o orchestrator detecta "user respondeu nome"
		// (detect-name-turn.ts), força save_contact_name. Default 'auto' quando
		// undefined. Cast no settings inteiro porque o ToolLoopAgent generic infere
		// TOOLS={} empty no construtor — não dá pra fixar o type via inference normal.
		...(opts.toolChoice ? { toolChoice: opts.toolChoice } : {}),
		...(prepareStep ? { prepareStep } : {}),
	};
	// biome-ignore lint/suspicious/noExplicitAny: ver comentário acima — generic inference do construtor não fixa o ToolSet.
	return new ToolLoopAgent(settings as any);
}
