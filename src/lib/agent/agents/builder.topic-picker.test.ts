/**
 * BUG-TOPIC-PICKER-WEB (descoberto em 2026-05-18 — apresentação 13h)
 *
 * Sintoma reportado (screenshot, persona Bruno/moto, simulação):
 *   Após o usuário responder o nome ("Lucas"), o agent (Bruno) responde:
 *     "Beleza, Lucas! Da uma olhada nas opções abaixo pra eu entender
 *      melhor o que você tem em mente:"
 *   …e NENHUM artifact é renderizado abaixo. O texto promete UI que nunca
 *   aparece. Frase exata NÃO existe em system-prompt.ts nem em nenhum
 *   example de drizzle/0016_personas_examples.sql / 0018 — é hallucination
 *   do agent prometendo opções clicáveis que ele acha que pode mostrar.
 *
 *   Esse padrão viola B6 da Bruna ("sempre ≥3 opções concretas, nunca texto
 *   vago") e é exatamente o caso de uso da tool `present_topic_picker`
 *   (src/lib/agent/tools/ai-sdk.ts:408), documentada como:
 *     "Apresenta lista de topicos clicaveis (chips) + botao 'Voltar' opcional.
 *      Use quando o usuario clicar 'Entender mais antes' ou pedir pra
 *      esclarecer duvidas — em vez de campo aberto, oferece atalhos pra
 *      topicos comuns. Bug #05 Bruna v1 review."
 *
 * Causa raiz suspeita (mesmo padrão dos bugs BUG-LEAD-CAPTURE-WEB e
 *   BUG-CREDIT-PICKER-WEB já corrigidos): a tool `present_topic_picker`
 *   existe em src/lib/agent/tools/ai-sdk.ts:408 e está em PRESENTATION_TOOLS
 *   (linha 564), mas as personas specialist no DB NÃO incluem
 *   `present_topic_picker` em `active_tools`:
 *
 *     SELECT id, active_tools FROM personas WHERE id IN
 *       ('auto','moto','imovel','servicos');  (2026-05-18, workspace develop)
 *
 *     → todas listam: search_groups, simulate_quota, get_rates,
 *       get_group_details, recommend_groups, present_group_card,
 *       present_comparison_table, present_simulation_result,
 *       present_recommendation_card, compare_with_financing,
 *       present_financing_comparison, save_contact_name,
 *       save_contact_whatsapp, present_whatsapp_optin, present_value_picker
 *     → NENHUMA lista `present_topic_picker`.
 *
 *   O builder em src/lib/agent/agents/builder.ts:44-53 só inclui tools
 *   listadas em `row.activeTools` MAIS as primitivas hardcoded
 *   (suggest_handoff, save_contact_name, save_contact_whatsapp,
 *   present_whatsapp_optin e present_value_picker). `present_topic_picker`
 *   NÃO está na lista de primitivas, NEM em active_tools de nenhuma
 *   persona → o agent nunca recebe essa tool no contexto da chamada à
 *   Anthropic → não pode invocar → quando "sente" que devia oferecer
 *   opções intermediárias, alucina o texto ("Da uma olhada nas opções
 *   abaixo…") sem ter como produzir a UI prometida.
 *
 * Este teste verifica que o set de tools exposto pelo builder para cada
 *   persona specialist inclui `present_topic_picker`. É pré-requisito pra
 *   o agent conseguir cumprir a promessa textual "olha as opções abaixo"
 *   com um artifact real (chips clicáveis) em vez de hallucination.
 *
 *   Foca em `moto` (caso reportado pelo Bruno) e valida as 4 specialists
 *   para evitar regressão silenciosa em auto/imovel/servicos — mesmo
 *   padrão dos testes builder.lead-capture.test.ts e
 *   builder.credit-picker.test.ts.
 *
 * Fix esperado (NÃO escrito por este agent):
 *   - Migration nova adicionando "present_topic_picker" ao active_tools
 *     de todas as specialists (mesmo padrão da 0014/0015/0017), OU
 *   - Declarar a tool como primitivo hardcoded no builder.ts (mesmo
 *     padrão de suggest_handoff, save_contact_name, save_contact_whatsapp,
 *     present_whatsapp_optin e present_value_picker em builder.ts:48-52).
 *     RECOMENDADO o caminho de migration (consistência
 *     com 0017) + ajuste no builder.ts pra incluir como invariante
 *     (cinto+suspensório, igual fez a 0017).
 *   - Adicional: instrução no system-prompt.ts dizendo QUANDO chamar
 *     present_topic_picker (ex: "se quiser oferecer atalhos antes do gate
 *     de credit/timeframe, chame present_topic_picker com 3 topicos —
 *     NUNCA escreva 'olha as opcoes' sem chamar a tool"). Sem essa
 *     instrução, expor a tool não garante que o agent vá usá-la — mas
 *     SEM a tool no contexto, nem a instrução resolveria.
 */

import { describe, expect, it } from "vitest";
import { getPersona, pickPersonaForCategory } from "@/lib/agent/personas-repo";
import { buildAgent } from "./builder";

describe("BUG-TOPIC-PICKER-WEB: present_topic_picker exposto ao specialist", () => {
	it("specialist de moto (Bruno) DEVE ter present_topic_picker nas tools expostas", async () => {
		const persona = await pickPersonaForCategory("moto", null);
		const agent = buildAgent(persona);

		// Mesmo padrão de introspecção dos testes builder.credit-picker e
		// builder.lead-capture: inspeciona o set de tools efetivamente passado
		// ao ToolLoopAgent — é o que será enviado ao modelo Anthropic em
		// streamText.
		// biome-ignore lint/suspicious/noExplicitAny: introspecção do agent
		const toolsRecord = (agent as any).tools as Record<string, unknown>;
		const exposedToolNames = Object.keys(toolsRecord ?? {});

		expect(
			exposedToolNames,
			`present_topic_picker precisa estar exposto ao specialist '${persona.id}' ` +
				`(Bruno/moto). active_tools no DB = ${JSON.stringify(persona.activeTools)}. ` +
				"Sem essa tool no contexto da chamada à Anthropic, o Bruno (e demais " +
				"specialists) não consegue renderizar o artifact de chips quando " +
				"oferece 'opções abaixo' — alucina o texto sem produzir a UI " +
				"prometida, violando B6 da Bruna (sempre ≥3 opções concretas, nunca " +
				"texto vago). Tool existe em src/lib/agent/tools/ai-sdk.ts:408 e " +
				"está em PRESENTATION_TOOLS, mas não foi adicionada a active_tools " +
				"em nenhuma migration nem ao set de primitivas em builder.ts:48-52.",
		).toContain("present_topic_picker");
	});

	it("todas as personas specialist (auto/imovel/moto/servicos) expõem present_topic_picker", async () => {
		const personaIds = ["auto", "imovel", "moto", "servicos"];
		const missing: Array<{ id: string; activeTools: string[] }> = [];

		for (const id of personaIds) {
			const row = await getPersona(id);
			const agent = buildAgent(row);
			// biome-ignore lint/suspicious/noExplicitAny: introspecção do agent
			const tools = (agent as any).tools as Record<string, unknown>;
			if (!tools || !("present_topic_picker" in tools)) {
				missing.push({ id, activeTools: row.activeTools });
			}
		}

		expect(
			missing,
			"Specialists sem present_topic_picker exposto:\n" +
				missing
					.map((m) => `  - ${m.id}: active_tools=${JSON.stringify(m.activeTools)}`)
					.join("\n") +
				"\nFix esperado: nova migration adicionando 'present_topic_picker' ao " +
				"active_tools de todas as specialists (mesmo padrão da 0017_specialists_value_picker), " +
				"OU declarar a tool como primitivo hardcoded no builder.ts:48-52 " +
				"(mesmo padrão de present_value_picker). Recomendado fazer AMBOS " +
				"(cinto+suspensório, como fez a 0017).",
		).toEqual([]);
	});
});
