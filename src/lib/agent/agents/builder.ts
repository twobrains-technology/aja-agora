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
import { consorcioTools } from "../tools/ai-sdk";

const anthropic = createAnthropic();

type ConsorcioToolName = keyof typeof consorcioTools;
type ConsorcioToolSet = Record<string, (typeof consorcioTools)[ConsorcioToolName]>;

function selectTools(
	activeTools: string[],
): ConsorcioToolSet {
	const out: ConsorcioToolSet = {};
	for (const name of activeTools) {
		if (name in consorcioTools) {
			const key = name as ConsorcioToolName;
			out[name] = consorcioTools[key];
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
				...selectTools(row.activeTools),
				suggest_handoff: consorcioTools.suggest_handoff,
				save_contact_name: consorcioTools.save_contact_name,
				save_contact_whatsapp: consorcioTools.save_contact_whatsapp,
				present_whatsapp_optin: consorcioTools.present_whatsapp_optin,
				present_value_picker: consorcioTools.present_value_picker,
				present_topic_picker: consorcioTools.present_topic_picker,
			};

	// Memory inline — renderizado como system message extra dentro das
	// instructions do agent, pra specialist nascer memory-aware mesmo sem
	// depender do prepend do orchestrator.
	const memoryText = opts.memoryContext
		? buildMemorySystemMessage(opts.memoryContext)
		: null;

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
