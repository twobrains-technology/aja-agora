import { createAnthropic } from "@ai-sdk/anthropic";
import { stepCountIs, ToolLoopAgent } from "ai";
import {
	buildConciergePrompt,
	buildSpecialistPrompt,
	type ExpertiseLevel,
	type PersonaRow,
} from "../system-prompt";
import { consorcioTools } from "../tools/ai-sdk";

const anthropic = createAnthropic();

type ConsorcioToolName = keyof typeof consorcioTools;

function selectTools(
	activeTools: string[],
): Record<string, (typeof consorcioTools)[ConsorcioToolName]> {
	const out: Record<string, (typeof consorcioTools)[ConsorcioToolName]> = {};
	for (const name of activeTools) {
		if (name in consorcioTools) {
			const key = name as ConsorcioToolName;
			out[name] = consorcioTools[key];
		}
	}
	return out;
}

export function buildAgent(row: PersonaRow, expertise: ExpertiseLevel = "neutro"): ToolLoopAgent {
	const isConcierge = row.role === "concierge";
	const blocks = isConcierge ? buildConciergePrompt(row) : buildSpecialistPrompt(row, expertise);
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

	const instructions = blocks.dynamic
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

	return new ToolLoopAgent({
		model: anthropic(process.env.AI_MODEL ?? "claude-sonnet-4-6"),
		instructions,
		tools,
		// Per-persona temperature lets warm/playful personas differ from precise/technical
		// ones at sampling level (Claude only exposes temperature, no topP/penalty).
		temperature: row.temperature,
		stopWhen: stepCountIs(isConcierge ? 1 : 10),
	});
}
