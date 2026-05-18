/**
 * BUG-CREDIT-PICKER-WEB (descoberto em 2026-05-18)
 *
 * Sintoma reportado:
 *   No chat web, quando a Helena (specialist de imóvel) pergunta "Qual faixa
 *   de crédito você está pensando?", o agent **não renderiza** o artifact
 *   `value_picker` (componente interativo de seleção de faixa). A pergunta
 *   sai como texto puro, forçando o usuário a digitar.
 *
 *   O system-prompt em src/lib/agent/system-prompt.ts:13 manda explicitamente
 *   "NUNCA pergunte valores por texto. Use present_value_picker para mostrar
 *   sliders interativos." Mas o agent não pode chamar a tool se ela não está
 *   exposta no contexto da chamada à Anthropic.
 *
 * Causa raiz suspeita: mesmo padrão do BUG-LEAD-CAPTURE-WEB. A tool
 *   `present_value_picker` existe em
 *   src/lib/agent/tools/ai-sdk.ts:363 (e está em PRESENTATION_TOOLS:562),
 *   mas as personas specialist no DB têm `active_tools` que NÃO inclui
 *   `present_value_picker`. O seed original em
 *   drizzle/0004_agents_crud.sql (linhas 48, 56, 65) listou apenas:
 *     search_groups, simulate_quota, get_rates, get_group_details,
 *     recommend_groups, present_group_card, present_comparison_table,
 *     present_simulation_result, present_recommendation_card
 *   Migrations posteriores (0014 unblock_financing_comparison, 0015 capture
 *   tools) adicionaram outras tools, mas **nunca** adicionaram
 *   `present_value_picker` ao active_tools. O builder em
 *   src/lib/agent/agents/builder.ts:44 só inclui tools listadas em
 *   `row.activeTools` (com exceção dos primitivos hardcoded:
 *   suggest_handoff, save_contact_name, save_contact_whatsapp,
 *   present_whatsapp_optin). Resultado: o agent NUNCA recebe
 *   `present_value_picker` no contexto → não consegue invocar → o card de
 *   seleção de faixa de crédito nunca aparece.
 *
 *   Evidência DB (workspace develop, 2026-05-18):
 *     SELECT active_tools FROM personas WHERE id='imovel';
 *     → não contém "present_value_picker"
 *
 * Este teste verifica que o set de tools exposto pelo builder para cada
 * persona specialist inclui `present_value_picker`. É pré-requisito pra o
 * fluxo "apresente o seletor interativo" do system-prompt funcionar.
 * Foca em `imovel` (caso reportado pela Helena) mas valida as 4 specialists
 * para evitar regressão silenciosa nos outros canais.
 */

import { describe, expect, it } from "vitest";
import { getPersona, pickPersonaForCategory } from "@/lib/agent/personas-repo";
import { buildAgent } from "./builder";

describe("BUG-CREDIT-PICKER-WEB: present_value_picker exposto ao specialist", () => {
	it("specialist de imovel (Helena) DEVE ter present_value_picker nas tools expostas", async () => {
		const persona = await pickPersonaForCategory("imovel", null);
		const agent = buildAgent(persona);

		// Mesmo padrão de introspecção do builder.lead-capture.test.ts:
		// inspeciona o set de tools efetivamente passado ao ToolLoopAgent —
		// é o que será enviado ao modelo Anthropic em streamText.
		// biome-ignore lint/suspicious/noExplicitAny: introspecção do agent
		const toolsRecord = (agent as any).tools as Record<string, unknown>;
		const exposedToolNames = Object.keys(toolsRecord ?? {});

		expect(
			exposedToolNames,
			`present_value_picker precisa estar exposto ao specialist '${persona.id}' ` +
				`(Helena/imovel). active_tools no DB = ${JSON.stringify(persona.activeTools)}. ` +
				"Sem essa tool no contexto da chamada à Anthropic, a Helena não consegue " +
				"renderizar o artifact de seleção de faixa de crédito e cai em texto puro — " +
				"violando o system-prompt (src/lib/agent/system-prompt.ts:13) que manda " +
				"'NUNCA pergunte valores por texto. Use present_value_picker'.",
		).toContain("present_value_picker");
	});

	it("todas as personas specialist (auto/imovel/moto/servicos) expõem present_value_picker", async () => {
		const personaIds = ["auto", "imovel", "moto", "servicos"];
		const missing: Array<{ id: string; activeTools: string[] }> = [];

		for (const id of personaIds) {
			const row = await getPersona(id);
			const agent = buildAgent(row);
			// biome-ignore lint/suspicious/noExplicitAny: introspecção do agent
			const tools = (agent as any).tools as Record<string, unknown>;
			if (!tools || !("present_value_picker" in tools)) {
				missing.push({ id, activeTools: row.activeTools });
			}
		}

		expect(
			missing,
			"Specialists sem present_value_picker exposto:\n" +
				missing
					.map(
						(m) => `  - ${m.id}: active_tools=${JSON.stringify(m.activeTools)}`,
					)
					.join("\n") +
				"\nFix esperado: nova migration adicionando 'present_value_picker' ao " +
				"active_tools de todas as specialists (mesmo padrão da 0014/0015), OU " +
				"declarar a tool como primitivo hardcoded no builder.ts (mesmo padrão de " +
				"suggest_handoff/save_contact_*).",
		).toEqual([]);
	});
});
