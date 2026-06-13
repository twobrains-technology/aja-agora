/**
 * BUG-LEAD-CAPTURE-WEB (descoberto em 2026-05-18)
 *
 * Sintoma reportado: lead NÃO é criado no momento em que o usuário diz o nome
 * via chat web. Critério do test plan
 * (docs/test-plans/lead-capture-web.md, CA-02):
 *   "Após user responder 'Kairo', SELECT name,stage FROM leads WHERE
 *    conversation_id=$1 → name='Kairo', stage='novo', phone IS NULL".
 *
 * Causa raiz suspeita: as personas specialist no DB têm `active_tools`
 * que NÃO inclui `save_contact_name`, `save_contact_whatsapp` nem
 * `present_whatsapp_optin`. O builder de agent
 * (src/lib/agent/agents/builder.ts:33) só monta as tools que estão na
 * lista `activeTools` da persona. Resultado: o agent NUNCA recebe a tool
 * `save_contact_name` no contexto da chamada à Anthropic → não pode
 * invocá-la → lead nunca é criado. O nome só aparece no texto do
 * assistant, mas DB fica vazio até que o handler `whatsapp_optin` de
 * `/api/chat/route.ts:236` cria o lead via `saveContactWhatsapp` direto
 * (esse handler chama a função utilitária, não passa pelo agent loop).
 *
 * Este teste:
 * 1) Verifica que o set de tools exposto pelo builder para uma persona
 *    specialist real inclui `save_contact_name` (CA-01 — pré-requisito
 *    pro agent chamar a tool).
 * 2) Como sanity check end-to-end, simula a sequência conversacional
 *    descrita no test plan e valida via DB que: ao chamar a tool
 *    `save_contact_name` exposta ao agent, a linha em `leads` é criada
 *    com phone NULL; depois, ao chamar `save_contact_whatsapp` na
 *    mesma conversa, a MESMA linha é enriquecida (id idêntico, phone
 *    preenchido, count==1).
 *
 * Ambas as asserções precisam passar para a feature funcionar como o
 * test plan exige. Hoje a (1) FALHA → bug confirmado.
 */

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { conversations, leads } from "@/db/schema";
import { getPersona, pickPersonaForCategory } from "@/lib/agent/personas-repo";
import { buildAgent } from "./builder";

describe("BUG-LEAD-CAPTURE-WEB: tools de captura conversacional expostas ao specialist", () => {
	it("specialist de auto DEVE ter save_contact_name nas tools expostas (CA-01 prereq)", async () => {
		const persona = await pickPersonaForCategory("auto", null);
		const agent = buildAgent(persona);

		// Inspeciona o set de tools do ToolLoopAgent — equivalente ao que vai
		// ser passado ao modelo Anthropic na chamada streamText.
		// biome-ignore lint/suspicious/noExplicitAny: introspecção do agent
		const toolsRecord = (agent as any).tools as Record<string, unknown>;
		const exposedToolNames = Object.keys(toolsRecord ?? {});

		expect(
			exposedToolNames,
			`save_contact_name precisa estar exposto ao specialist '${persona.id}'. ` +
				`active_tools no DB = ${JSON.stringify(persona.activeTools)}. ` +
				"Sem essa tool, o agent nunca consegue persistir o nome capturado " +
				"conversacionalmente → lead nunca é criado no momento do nome.",
		).toContain("save_contact_name");
	});

	it("specialist de auto DEVE ter save_contact_whatsapp + present_whatsapp_optin (CA-05/CA-08)", async () => {
		const persona = await pickPersonaForCategory("auto", null);
		const agent = buildAgent(persona);
		// biome-ignore lint/suspicious/noExplicitAny: introspecção do agent
		const toolsRecord = (agent as any).tools as Record<string, unknown>;
		const exposedToolNames = Object.keys(toolsRecord ?? {});

		expect(exposedToolNames).toContain("save_contact_whatsapp");
		expect(exposedToolNames).toContain("present_whatsapp_optin");
	});

	it("todas as personas specialist (auto/imovel/moto/servicos) expõem save_contact_name", async () => {
		const personaIds = ["auto", "imovel", "moto", "servicos"];
		const missing: string[] = [];
		for (const id of personaIds) {
			const row = await getPersona(id);
			const agent = buildAgent(row);
			// biome-ignore lint/suspicious/noExplicitAny: introspecção do agent
			const tools = (agent as any).tools as Record<string, unknown>;
			if (!tools || !("save_contact_name" in tools)) missing.push(id);
		}
		expect(
			missing,
			`Personas sem save_contact_name: ${missing.join(", ")}. ` +
				"Cada specialist precisa ter a tool registrada em active_tools no DB " +
				"OU o builder precisa expor as tools de captura por padrão.",
		).toEqual([]);
	});
});

describe("BUG-LEAD-CAPTURE-WEB: sequência conversacional cria + enriquece o MESMO lead", () => {
	let convId: string;

	beforeEach(async () => {
		const [c] = await db.insert(conversations).values({}).returning();
		convId = c.id;
	});

	afterEach(async () => {
		await db.delete(leads).where(eq(leads.conversationId, convId));
		await db.delete(conversations).where(eq(conversations.id, convId));
	});

	it("CA-02 + CA-08: nome cria lead (phone NULL); WhatsApp depois ENRIQUECE o mesmo lead (sem duplicar)", async () => {
		// Step 1 — usuário disse o nome. Em produção, o agent chamaria
		// `save_contact_name` via tool. Para isolar do bug de tools não
		// expostas (asserido no describe acima), invocamos a tool execute
		// diretamente — exatamente como o AI SDK faria se a tool estivesse
		// registrada na persona. Este caminho EXERCITA o handler real
		// (saveContactName -> createLeadFromConversation).
		const { consorcioTools } = await import("@/lib/agent/tools/ai-sdk");
		// biome-ignore lint/suspicious/noExplicitAny: execute é tipado opaco
		const saveName = (consorcioTools.save_contact_name as any).execute;
		const r1 = await saveName({ conversationId: convId, name: "Maria" });
		expect(r1, `tool save_contact_name retornou erro: ${r1}`).toMatch(/salvo/i);

		// Assert CA-02: lead criado com nome='Maria', phone NULL, stage='novo'
		const leadAfterName = await db.query.leads.findFirst({
			where: eq(leads.conversationId, convId),
		});
		expect(leadAfterName, "lead deveria ter sido criado ao salvar o nome").toBeDefined();
		expect(leadAfterName?.name).toBe("Maria");
		expect(leadAfterName?.phone).toBeNull();
		expect(leadAfterName?.stage).toBe("novo");
		const leadIdAfterName = leadAfterName?.id;

		// Step 2 — usuário enviou WhatsApp via card. O sistema chama
		// `saveContactWhatsapp` (action handler ou tool). Mesma conv.
		// biome-ignore lint/suspicious/noExplicitAny: execute é tipado opaco
		const saveWa = (consorcioTools.save_contact_whatsapp as any).execute;
		const r2 = await saveWa({ conversationId: convId, phone: "+5511999999999" });
		expect(r2, `tool save_contact_whatsapp retornou erro: ${r2}`).toMatch(/salvo|wha/i);

		// Assert CA-08: MESMO lead (id idêntico), phone agora preenchido, stage promovido
		const leadsAfterWa = await db.query.leads.findMany({
			where: eq(leads.conversationId, convId),
		});
		expect(
			leadsAfterWa.length,
			`deveria existir exatamente 1 lead para a conversation ${convId}, encontrei ${leadsAfterWa.length}`,
		).toBe(1);
		const enriched = leadsAfterWa[0];
		expect(enriched.id, "WhatsApp deve enriquecer o MESMO lead, não criar novo").toBe(
			leadIdAfterName,
		);
		expect(enriched.name).toBe("Maria");
		expect(enriched.phone).toBe("11999999999");
		expect(enriched.stage).toBe("engajado");
	});
});
