import { createAnthropic } from "@ai-sdk/anthropic";
import { stepCountIs, type ToolChoice, ToolLoopAgent } from "ai";
import { buildMemorySystemMessage } from "@/lib/memory/reactivation";
import type { MemoryContext } from "@/lib/memory/types";
import {
	buildConciergePrompt,
	buildSpecialistPrompt,
	type ExpertiseLevel,
	type PersonaRow,
} from "../system-prompt";
import { buildConsorcioTools, consorcioTools } from "../tools/ai-sdk";

const anthropic = createAnthropic();

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
	} = {},
): ToolLoopAgent {
	const isConcierge = row.role === "concierge";
	const blocks = isConcierge
		? buildConciergePrompt(row)
		: buildSpecialistPrompt(row, expertise, opts.currentDate);

	// Factory per-build: tools sensíveis (save_contact_name, save_contact_whatsapp,
	// present_lead_form) ganham conversationId via closure — schema fica reduzido,
	// modelo não alucina ID. Tools não-sensíveis vêm direto do registry estático.
	// Ver `tools/ai-sdk.ts` (buildConsorcioTools) pro racional do BUG-
	// CONVERSATION-ID-HALLUCINATION.
	const registry = buildConsorcioTools({
		conversationId: opts.conversationId,
		channel: opts.channel,
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
	const tools = isConcierge
		? {}
		: {
				...selectTools(row.activeTools, registry),
				suggest_handoff: registry.suggest_handoff,
				save_contact_name: registry.save_contact_name,
				save_contact_whatsapp: registry.save_contact_whatsapp,
				present_whatsapp_optin: registry.present_whatsapp_optin,
				present_value_picker: registry.present_value_picker,
				present_topic_picker: registry.present_topic_picker,
				// Card de decisão "Esse plano faz sentido?" (jornada do .docx etapa 4)
				// — primitivo do sistema, sempre exposto (não toggleable pelo admin).
				present_decision_prompt: registry.present_decision_prompt,
				// Passo 5 "Contratar" (fechamento Bevi) + simulador-agulha (passo 4) —
				// primitivos do sistema, sempre expostos.
				present_contract_form: registry.present_contract_form,
				present_contemplation_dial: registry.present_contemplation_dial,
			};

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
						anthropic: { cacheControl: { type: "ephemeral" as const } },
					},
				},
				{ role: "system" as const, content: blocks.dynamic },
			]
		: [
				{
					role: "system" as const,
					content: blocks.stable,
					providerOptions: {
						anthropic: { cacheControl: { type: "ephemeral" as const } },
					},
				},
			];

	const instructions = memoryText
		? [...baseInstructions, { role: "system" as const, content: memoryText }]
		: baseInstructions;

	const settings = {
		model: anthropic(process.env.AI_MODEL ?? "claude-sonnet-4-6"),
		instructions,
		tools,
		// Per-persona temperature lets warm/playful personas differ from precise/technical
		// ones at sampling level (Claude only exposes temperature, no topP/penalty).
		temperature: row.temperature,
		stopWhen: stepCountIs(isConcierge ? 1 : 10),
		// Quando o orchestrator detectar "user respondeu nome" (cf.
		// detect-name-turn.ts), passa toolChoice: { type: 'tool',
		// toolName: 'save_contact_name' } pra obrigar o modelo a chamar.
		// Default 'auto' quando undefined. Cast no settings inteiro porque
		// o ToolLoopAgent generic infere `TOOLS={}` empty no construtor —
		// não dá pra fixar o type do ToolChoice via inference normal.
		...(opts.toolChoice ? { toolChoice: opts.toolChoice } : {}),
	};
	// biome-ignore lint/suspicious/noExplicitAny: ver comentário acima — generic inference do construtor não fixa o ToolSet.
	return new ToolLoopAgent(settings as any);
}
