import { desc } from "drizzle-orm";
import { db } from "@/db";
import { whatsappTemplates } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { isUniqueViolation } from "@/lib/mesa/pg-error";
import { buildTemplateComponents, createTemplateSchema } from "@/lib/validations/whatsapp-template";

/**
 * GET — lista todos os templates (mais recentes primeiro) para o admin.
 * FIX-204. Protegida por role admin (mesmo guard das demais rotas admin).
 */
export async function GET() {
	const { error } = await requireRole("admin");
	if (error) return error;

	const rows = await db.select().from(whatsappTemplates).orderBy(desc(whatsappTemplates.createdAt));

	return Response.json({ templates: rows });
}

/**
 * POST — cria um template em rascunho (DRAFT), ainda NÃO submetido à Meta.
 * FIX-204. O `usageKey` é opcional no cadastro (D1) e único-quando-setado; corpo
 * (BODY), `metaName` e `category` são obrigatórios. A submissão à Meta é um passo
 * separado (`[id]/submit`).
 */
export async function POST(req: Request) {
	const { error } = await requireRole("admin");
	if (error) return error;

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: "JSON inválido" }, { status: 400 });
	}

	const parsed = createTemplateSchema.safeParse(body);
	if (!parsed.success) {
		return Response.json(
			{ error: "Dados inválidos", details: parsed.error.flatten() },
			{ status: 400 },
		);
	}

	const { usageKey, metaName, category, language, header, body: bodyText, footer } = parsed.data;
	const { components, bodyPreview } = buildTemplateComponents({ header, body: bodyText, footer });

	try {
		const [row] = await db
			.insert(whatsappTemplates)
			.values({
				usageKey: usageKey ?? null,
				metaName,
				category,
				language,
				components,
				bodyPreview,
				status: "DRAFT",
			})
			.returning();
		return Response.json(row, { status: 201 });
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
