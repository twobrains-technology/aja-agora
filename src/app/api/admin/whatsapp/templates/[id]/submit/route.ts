import { eq } from "drizzle-orm";
import { db } from "@/db";
import { whatsappTemplates } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { createTemplate } from "@/lib/whatsapp/api";

/**
 * POST — submete um template (DRAFT) à Meta. FIX-204 (D3).
 *
 * Sucesso: persiste `metaTemplateId` + `status = PENDING` + `submittedAt`, e limpa
 * qualquer erro anterior.
 *
 * Falha da Meta (4xx/5xx): mantém `status = DRAFT`, grava a mensagem de erro em
 * `rejectionReason` (exibida no admin) e responde 502 — NUNCA persiste um PENDING
 * falso (spec §Erros).
 *
 * Só age a partir de DRAFT: re-submeter um PENDING/APPROVED é 409.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { error } = await requireRole("admin");
	if (error) return error;

	const { id } = await params;

	const [tmpl] = await db
		.select()
		.from(whatsappTemplates)
		.where(eq(whatsappTemplates.id, id))
		.limit(1);
	if (!tmpl) {
		return Response.json({ error: "Template não encontrado" }, { status: 404 });
	}
	if (tmpl.status !== "DRAFT") {
		return Response.json(
			{
				error: `Template já submetido (status atual: ${tmpl.status}). Só é possível submeter um rascunho (DRAFT).`,
			},
			{ status: 409 },
		);
	}
	if (!tmpl.category) {
		return Response.json(
			{ error: "Defina a categoria antes de submeter à Meta." },
			{ status: 400 },
		);
	}

	try {
		const result = await createTemplate({
			name: tmpl.metaName,
			language: tmpl.language,
			category: tmpl.category,
			components: tmpl.components ?? [],
		});

		const [row] = await db
			.update(whatsappTemplates)
			.set({
				status: "PENDING",
				metaTemplateId: result.id,
				// A Meta pode recategorizar na submissão; refletimos se veio.
				...(result.category ? { category: result.category as typeof tmpl.category } : {}),
				submittedAt: new Date(),
				rejectionReason: null,
			})
			.where(eq(whatsappTemplates.id, id))
			.returning();

		return Response.json(row);
	} catch (err) {
		// Falha da Meta → mantém DRAFT + registra o erro (visível no admin).
		const message = err instanceof Error ? err.message : String(err);
		const [row] = await db
			.update(whatsappTemplates)
			.set({ status: "DRAFT", rejectionReason: message })
			.where(eq(whatsappTemplates.id, id))
			.returning();
		return Response.json(
			{ error: "Falha ao submeter à Meta", message, template: row },
			{ status: 502 },
		);
	}
}
