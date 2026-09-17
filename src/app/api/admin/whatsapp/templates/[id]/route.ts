import { eq } from "drizzle-orm";
import { db } from "@/db";
import { type WhatsappTemplateComponent, whatsappTemplates } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { isUniqueViolation } from "@/lib/mesa/pg-error";
import { buildTemplateComponents, updateTemplateSchema } from "@/lib/validations/whatsapp-template";

/**
 * PATCH — edita um template. FIX-204 (D2).
 *
 * Regra: o `usageKey` (vínculo lógico) é editável SEMPRE — o vínculo pode migrar
 * para uma nova versão aprovada. O CONTEÚDO (metaName/category/language/corpo)
 * só é editável enquanto `status = DRAFT`: depois de submetido, o template é
 * imutável na Meta; só o vínculo local se move.
 *
 * Para editar HEADER/FOOTER é preciso enviar também o corpo (body), pois os
 * `components` são reconstruídos como um todo.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { error } = await requireRole("admin");
	if (error) return error;

	const { id } = await params;

	let raw: unknown;
	try {
		raw = await req.json();
	} catch {
		return Response.json({ error: "JSON inválido" }, { status: 400 });
	}

	const parsed = updateTemplateSchema.safeParse(raw);
	if (!parsed.success) {
		return Response.json(
			{ error: "Dados inválidos", details: parsed.error.flatten() },
			{ status: 400 },
		);
	}

	const [current] = await db
		.select()
		.from(whatsappTemplates)
		.where(eq(whatsappTemplates.id, id))
		.limit(1);
	if (!current) {
		return Response.json({ error: "Template não encontrado" }, { status: 404 });
	}

	const {
		usageKey,
		metaName,
		category,
		language,
		header,
		headerFormat,
		headerHandle,
		body,
		footer,
		quickReplyText,
		carousel,
	} = parsed.data;

	const updates: Partial<typeof whatsappTemplates.$inferInsert> = {};

	// Vínculo: editável sempre. `null` desvincula; `undefined` = não mexe.
	if (usageKey !== undefined) updates.usageKey = usageKey;

	const wantsContentEdit =
		metaName !== undefined ||
		category !== undefined ||
		language !== undefined ||
		body !== undefined ||
		header !== undefined ||
		headerFormat !== undefined ||
		headerHandle !== undefined ||
		footer !== undefined ||
		quickReplyText !== undefined ||
		carousel !== undefined;

	if (wantsContentEdit) {
		if (current.status !== "DRAFT") {
			return Response.json(
				{
					error:
						"Só é possível editar o conteúdo enquanto o template está em rascunho (DRAFT). Fora do DRAFT, apenas o vínculo (usageKey) é editável.",
				},
				{ status: 409 },
			);
		}
		if (metaName !== undefined) updates.metaName = metaName;
		if (category !== undefined) updates.category = category;
		if (language !== undefined) updates.language = language;

		if (body !== undefined) {
			const { components, bodyPreview } = buildTemplateComponents({
				header,
				headerFormat,
				headerHandle,
				body,
				footer,
				quickReplyText,
				carousel,
			});
			// Cast porque `CAROUSEL` não existe no tipo do schema (arquivo de outro bloco).
			updates.components = components as WhatsappTemplateComponent[];
			updates.bodyPreview = bodyPreview;
		} else if (
			header !== undefined ||
			headerFormat !== undefined ||
			headerHandle !== undefined ||
			footer !== undefined ||
			quickReplyText !== undefined ||
			carousel !== undefined
		) {
			return Response.json(
				{ error: "Para editar header/footer/botão/carrossel, envie também o corpo (body)." },
				{ status: 400 },
			);
		}
	}

	if (Object.keys(updates).length === 0) {
		return Response.json(current);
	}

	try {
		const [row] = await db
			.update(whatsappTemplates)
			.set(updates)
			.where(eq(whatsappTemplates.id, id))
			.returning();
		return Response.json(row);
	} catch (err) {
		if (isUniqueViolation(err)) {
			return Response.json(
				{ error: "Já existe um template com essa chave de uso (usageKey)" },
				{ status: 409 },
			);
		}
		throw err;
	}
}
