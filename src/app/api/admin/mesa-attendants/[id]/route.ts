import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mesaAttendants } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { isUniqueViolation } from "@/lib/mesa/pg-error";
import { updateMesaAttendantSchema } from "@/lib/validations/mesa";

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

	const parsed = updateMesaAttendantSchema.safeParse(body);
	if (!parsed.success) {
		return Response.json(
			{ error: "Dados inválidos", details: parsed.error.flatten() },
			{ status: 400 },
		);
	}

	try {
		const [row] = await db
			.update(mesaAttendants)
			.set(parsed.data)
			.where(eq(mesaAttendants.id, id))
			.returning();
		if (!row) {
			return Response.json({ error: "Atendente de mesa não encontrado" }, { status: 404 });
		}
		return Response.json(row);
	} catch (err) {
		if (isUniqueViolation(err)) {
			return Response.json(
				{ error: "Já existe um atendente de mesa com esse WhatsApp" },
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

	const [deleted] = await db
		.delete(mesaAttendants)
		.where(eq(mesaAttendants.id, id))
		.returning({ id: mesaAttendants.id });

	if (!deleted) {
		return Response.json({ error: "Atendente de mesa não encontrado" }, { status: 404 });
	}

	return Response.json({ id: deleted.id, deleted: true });
}
