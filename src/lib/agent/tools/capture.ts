import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";

/**
 * Domain tool for persisting lead contact data.
 * Writes directly to the leads table (PII isolation from conversation logs).
 *
 * Uses select-then-insert/update pattern since conversationId is not a unique constraint.
 */
export const captureLead = tool(
	"capture_lead",
	"Salva os dados de contato do lead no banco de dados. Use apos o usuario preencher e enviar o formulario de lead. Os dados sao salvos com referencia a conversa atual. Retorna confirmacao para voce comunicar ao usuario.",
	{
		conversationId: z.string().describe("ID da conversa atual"),
		name: z.string().min(2).describe("Nome completo do lead"),
		phone: z.string().describe("Telefone do lead (DDD + numero)"),
		email: z.string().email().describe("Email do lead"),
	},
	async (args) => {
		// Check if a lead already exists for this conversation (upsert pattern)
		const existing = await db.query.leads.findFirst({
			where: eq(leads.conversationId, args.conversationId),
		});

		if (existing) {
			// Update existing lead
			await db
				.update(leads)
				.set({
					name: args.name,
					phone: args.phone,
					email: args.email,
					updatedAt: new Date(),
				})
				.where(eq(leads.id, existing.id));

			return {
				content: [
					{
						type: "text" as const,
						text: `Lead atualizado com sucesso. Nome: ${args.name}`,
					},
				],
			};
		}

		// Insert new lead
		const [lead] = await db
			.insert(leads)
			.values({
				conversationId: args.conversationId,
				name: args.name,
				phone: args.phone,
				email: args.email,
			})
			.returning();

		return {
			content: [
				{
					type: "text" as const,
					text: `Lead capturado com sucesso. Nome: ${args.name} (ID: ${lead.id})`,
				},
			],
		};
	},
);
