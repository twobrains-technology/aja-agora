import { eq } from "drizzle-orm";
import { db } from "@/db";
import { administradoras } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { isUniqueViolation } from "@/lib/mesa/pg-error";
import { slugify } from "@/lib/mesa/slug";
import { updateAdministradoraSchema } from "@/lib/validations/mesa";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { error } = await requireRole("admin");
	if (error) return error;

	const { id } = await params;

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: "JSON inválido" }, { status: 400 });
	}

	const parsed = updateAdministradoraSchema.safeParse(body);
	if (!parsed.success) {
		return Response.json(
			{ error: "Dados inválidos", details: parsed.error.flatten() },
			{ status: 400 },
		);
	}

	const updates: Record<string, unknown> = { ...parsed.data };
	// slug acompanha o nome (auto a partir do nome — FIX-61).
	if (typeof parsed.data.nome === "string") {
		updates.slug = slugify(parsed.data.nome);
	}

	try {
		const [row] = await db
			.update(administradoras)
			.set(updates)
			.where(eq(administradoras.id, id))
			.returning();
		if (!row) {
			return Response.json({ error: "Administradora não encontrada" }, { status: 404 });
		}
		return Response.json(row);
	} catch (err) {
		if (isUniqueViolation(err)) {
			return Response.json(
				{ error: "Já existe uma administradora com esse nome" },
				{ status: 409 },
			);
		}
		throw err;
	}
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { error } = await requireRole("admin");
	if (error) return error;

	const { id } = await params;

	// Hard delete — docs da administradora caem por ON DELETE CASCADE; handoffs
	// têm administradora_id setado a NULL (ON DELETE SET NULL). Spec §3.1: o admin
	// pode "remover".
	const [deleted] = await db
		.delete(administradoras)
		.where(eq(administradoras.id, id))
		.returning({ id: administradoras.id });

	if (!deleted) {
		return Response.json({ error: "Administradora não encontrada" }, { status: 404 });
	}

	return Response.json({ id: deleted.id, deleted: true });
}
