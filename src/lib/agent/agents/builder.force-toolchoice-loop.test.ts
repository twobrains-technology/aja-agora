/**
 * BUG-MUTE-LOOP-NAME-CAPTURE (achado cross-frente, 2026-07-01)
 *
 * docs/correcoes/inbox/2026-07-01-crossfrente-agente-mudo-captura-nome.md
 *
 * Sintoma real (WhatsApp, simulador `/admin/simulator/whatsapp`): agente
 * pergunta "como posso te chamar?" -> usuário responde "Kairo" -> agente
 * fica MUDO por 1 turno inteiro. Turn-trace real:
 *   toolsCalled: [save_contact_name x10], toolCount:10, textChars:0
 *
 * Causa raiz: `detect-name-turn.ts` detecta "user respondeu com nome" e o
 * orchestrator força `toolChoice: { type: 'tool', toolName:
 * 'save_contact_name' }` no agent (fix intencional BUG-SHORT-GREETING-
 * AFTER-NAME — obrigar o modelo a persistir o nome mesmo se ignorar o
 * prompt). Só que `buildAgent` (builder.ts) passa esse `toolChoice` como
 * setting ESTÁTICO do `ToolLoopAgent` — sem `prepareStep`. A AI SDK 6
 * reaplica o MESMO toolChoice em TODOS os steps do loop (confirmado em
 * node_modules/ai/dist/index.mjs: `toolChoice: prepareStepResult?.toolChoice
 * ?? toolChoice` a cada step), a menos que `prepareStep` diga o contrário.
 * Resultado: Anthropic é OBRIGADO a chamar save_contact_name em CADA um dos
 * `stepCountIs(10)` steps — nunca pode responder com texto (tool_choice
 * força tool_use, nunca permite finish_reason=stop) — o loop esgota o teto
 * de steps mudo.
 *
 * Fix: `prepareStep` que preserva o forcing só no `stepNumber === 0`
 * (mantém a intenção original do fix anterior) e reverte pra
 * `{ type: 'auto' }` em `stepNumber > 0` — deixa o modelo falar depois de
 * persistir o nome.
 */

import { describe, expect, it } from "vitest";
import { getPersona } from "@/lib/agent/personas-repo";
import { buildAgent } from "./builder";

describe("BUG-MUTE-LOOP-NAME-CAPTURE: prepareStep reverte toolChoice forçado após o 1º step", () => {
	it("agent com opts.toolChoice DEVE expor prepareStep (senão o forcing vale pra TODOS os steps)", async () => {
		const persona = await getPersona("auto");
		const forced = { type: "tool" as const, toolName: "save_contact_name" as const };
		const agent = buildAgent(persona, "neutro", { toolChoice: forced });

		// biome-ignore lint/suspicious/noExplicitAny: introspecção do agent (settings é TS-private, não JS-private)
		const settings = (agent as any).settings;
		expect(
			typeof settings.prepareStep,
			"buildAgent precisa expor `prepareStep` no ToolLoopAgentSettings quando " +
				"opts.toolChoice é passado. Sem isso, o toolChoice ESTÁTICO se repete em " +
				"TODOS os steps do loop (stopWhen: stepCountIs(10)), forçando o modelo a " +
				"chamar a MESMA tool a cada step sem NUNCA poder produzir texto. Bug real " +
				"(WhatsApp, 2026-07-01): save_contact_name chamado 10x, textChars:0, " +
				"usuário recebe silêncio por 1 turno inteiro.",
		).toBe("function");
	});

	it("step 0 preserva o forcing (é o motivo do toolChoice existir)", async () => {
		const persona = await getPersona("auto");
		const forced = { type: "tool" as const, toolName: "save_contact_name" as const };
		const agent = buildAgent(persona, "neutro", { toolChoice: forced });
		// biome-ignore lint/suspicious/noExplicitAny: introspecção do agent
		const settings = (agent as any).settings;

		const step0 = await settings.prepareStep({
			steps: [],
			stepNumber: 0,
			model: settings.model,
			messages: [],
			experimental_context: undefined,
		});
		expect(step0?.toolChoice).toEqual(forced);
	});

	it("step 1+ (APÓS o 1º tool-call forçado) reverte pra 'auto' — senão o agent trava mudo", async () => {
		const persona = await getPersona("auto");
		const forced = { type: "tool" as const, toolName: "save_contact_name" as const };
		const agent = buildAgent(persona, "neutro", { toolChoice: forced });
		// biome-ignore lint/suspicious/noExplicitAny: introspecção do agent
		const settings = (agent as any).settings;

		const step1 = await settings.prepareStep({
			steps: [],
			stepNumber: 1,
			model: settings.model,
			messages: [],
			experimental_context: undefined,
		});
		expect(
			step1?.toolChoice,
			"no step 1 (após o 1º tool-call forçado), prepareStep precisa devolver " +
				"toolChoice: 'auto' (STRING — o tipo ToolChoice<T> de alto nível da AI SDK é " +
				"'auto'|'none'|'required'|{type:'tool',...}, NÃO {type:'auto'}; um objeto " +
				"{type:'auto'} cai no branch errado da conversão interna da SDK e vira " +
				"{type:'tool', toolName: undefined} — reproduz o MESMO bug mudo) — senão o " +
				"modelo continua OBRIGADO a chamar save_contact_name para sempre e nunca " +
				"produz texto (loop mudo, bug real).",
		).toEqual("auto");
	});

	it("agent SEM opts.toolChoice preserva comportamento normal (prepareStep ausente ou inócuo)", async () => {
		const persona = await getPersona("auto");
		const agent = buildAgent(persona);
		// biome-ignore lint/suspicious/noExplicitAny: introspecção do agent
		const settings = (agent as any).settings;
		if (settings.prepareStep) {
			const step0 = await settings.prepareStep({
				steps: [],
				stepNumber: 0,
				model: settings.model,
				messages: [],
				experimental_context: undefined,
			});
			expect(step0?.toolChoice).toBeUndefined();
		}
	});
});
