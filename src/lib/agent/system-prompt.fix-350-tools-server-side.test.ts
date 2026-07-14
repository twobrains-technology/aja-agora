/**
 * FIX-350(a) (P1.3, veredito rodada 4) — o fallback enlatado
 * (`buildToolErrorRecoveryFallback`) continua disparando (agora em
 * `auto-whatsapp` t21: usuário confirma "sim" a um plano já detalhado).
 *
 * Root cause PROVADO por cruzamento de código (sem precisar de log ao vivo):
 * `tool-policy.ts` (`allowedTools`) NUNCA inclui `present_decision_prompt`,
 * `present_topic_picker` nem `present_whatsapp_optin` em NENHUMA fase — as
 * três viraram emissão 100% SERVER-SIDE (FIX-253/FIX-309/FIX-280, comentários
 * no próprio arquivo: "a tool NUNCA entra em allowedTools em nenhuma fase").
 * Mas `system-prompt.ts` (o texto que o modelo lê) nunca foi atualizado —
 * ainda instrui, com "REGRA DURA", que o modelo CHAME essas 3 tools:
 *   - "### Card de decisão... você PODE chamar present_decision_prompt..."
 *   - "### Atalhos com topicos curtos — use present_topic_picker" (REGRA DURA:
 *     nunca prometa sem chamar a tool — pior ainda, empurra a chamada)
 *   - lista de "tools idempotentes" (present_topic_picker/present_whatsapp_optin)
 *
 * Se o modelo seguir a instrução (ela é explícita e enfática — "REGRA DURA"),
 * a chamada bate em `NoSuchToolError` (tool fora do toolset da fase) — o
 * runner suprime toda a narração do turno e emite o fallback enlatado
 * (`directives.ts:452`, disparo em `index.ts` branch `tool-error-recovered`).
 * Duas camadas dizendo coisas contraditórias = exatamente o anti-padrão do
 * projeto ("quando o código assume um invariante, remova a regra-no-prompt
 * correspondente — não deixe as duas"). Fix: apaga a instrução de CHAMAR
 * essas 3 tools do prompt — a emissão já é 100% determinística em código.
 */
import { describe, expect, it } from "vitest";
import {
	buildSpecialistPrompt,
	type PersonaRow,
	SPECIALIST_BASE_PROMPT,
} from "./system-prompt";

const MOCK_ROW = {
	id: "auto",
	displayName: "Helena",
	role: "specialist",
	category: "auto",
	expertise: null,
	voiceTone: "Voz calorosa, frases curtas, sem bordões.",
	examples: [],
	temperature: 0.7,
	activeCampaigns: [],
	handoffTriggers: [],
	forbiddenTopics: [],
	activeTools: [],
	isActive: true,
	version: 1,
	createdAt: new Date(0),
	updatedAt: new Date(0),
} as unknown as PersonaRow;

// Tools 100% server-side (tool-policy.ts: NUNCA aparecem em allowedTools(),
// em nenhuma fase) — o modelo não pode chamá-las, então o prompt não pode
// instruir/permitir que ele as chame.
const SERVER_ONLY_TOOLS = ["present_decision_prompt", "present_topic_picker", "present_whatsapp_optin"];

/** Instruções que mandam/permitem o MODELO chamar a tool — não apenas citar o
 * nome dela ao descrever o que o SISTEMA faz. */
function instructsModelToCall(text: string, tool: string): boolean {
	const patterns = [
		new RegExp(`chame \`?${tool}\`?`, "i"),
		new RegExp(`chamar a tool \`?${tool}\`?`, "i"),
		new RegExp(`pode chamar \`?${tool}\`?`, "i"),
		new RegExp(`use \`?${tool}\`?`, "i"),
	];
	return patterns.some((p) => p.test(text));
}

describe("FIX-350(a) — system-prompt não instrui chamar tools que saíram do toolset (server-side)", () => {
	it.each(["qualify", "reveal", "closing", "terminal"] as const)(
		"fase=%s: nenhuma instrução manda o modelo chamar present_decision_prompt/present_topic_picker/present_whatsapp_optin",
		(phase) => {
			const blocks = buildSpecialistPrompt(
				MOCK_ROW,
				"neutro",
				undefined,
				"done",
				null,
				null,
				null,
				false,
				phase,
			);
			const full = `${blocks.stable}\n${blocks.dynamic}`;
			for (const tool of SERVER_ONLY_TOOLS) {
				expect(instructsModelToCall(full, tool)).toBe(false);
			}
		},
	);

	it("SPECIALIST_BASE_PROMPT (sem filtro de fase) não instrui chamar essas 3 tools", () => {
		for (const tool of SERVER_ONLY_TOOLS) {
			expect(instructsModelToCall(SPECIALIST_BASE_PROMPT, tool)).toBe(false);
		}
	});

	it("a lista de tools idempotentes não inclui present_topic_picker/present_whatsapp_optin (o modelo não as chama mais)", () => {
		const idempotentSection = SPECIALIST_BASE_PROMPT.slice(
			SPECIALIST_BASE_PROMPT.indexOf("### NUNCA repita tools idempotentes"),
			SPECIALIST_BASE_PROMPT.indexOf("REGRA CRITICA — NÃO PERGUNTAR durante a fase de coleta"),
		);
		expect(idempotentSection).not.toMatch(/present_topic_picker/);
		expect(idempotentSection).not.toMatch(/present_whatsapp_optin/);
	});
});
