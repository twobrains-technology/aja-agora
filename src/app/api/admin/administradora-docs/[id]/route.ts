import { eq } from "drizzle-orm";
import { db } from "@/db";
import { administradoraDocs } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { deleteObject } from "@/lib/storage";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { error } = await requireRole("admin");
	if (error) return error;

	const { id } = await params;

	const [doc] = await db
		.select({ id: administradoraDocs.id, storageKey: administradoraDocs.storageKey })
		.from(administradoraDocs)
		.where(eq(administradoraDocs.id, id));

	if (!doc) {
		return Response.json({ error: "Documento não encontrado" }, { status: 404 });
	}

	await db.delete(administradoraDocs).where(eq(administradoraDocs.id, id));

	// remove o binário do storage — best-effort: a linha já saiu do DB, não deixar
	// o request falhar por causa do storage (evita doc "fantasma" no banco).
	try {
		await deleteObject(doc.storageKey);
	} catch (err) {
		console.error(
			"[administradora-docs] falha ao remover objeto do storage:",
			err instanceof Error ? err.message : String(err),
		);
	}

	return Response.json({ id: doc.id, deleted: true });
}
