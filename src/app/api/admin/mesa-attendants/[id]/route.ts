import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mesaAttendants, mesaHandoffs } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { isUniqueViolation } from "@/lib/mesa/pg-error";
import { updateMesaAttendantSchema } from "@/lib/validations/mesa";
import { invalidateMesaAttendantCache } from "@/lib/whatsapp/mesa/routing";

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
		invalidateMesaAttendantCache();
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

	// Não apaga atendente com caso vinculado: a FK mesa_handoffs.mesa_attendant_id é
	// ON DELETE no action e o histórico de handoffs é auditoria (§8) — o hard-delete cru
	// estouraria 23503 (500). O caminho pra tirar de circulação é DESATIVAR (PATCH isActive).
	const [referenced] = await db
		.select({ id: mesaHandoffs.id })
		.from(mesaHandoffs)
		.where(eq(mesaHandoffs.mesaAttendantId, id))
		.limit(1);
	if (referenced) {
		return Response.json(
			{
				error:
					"Atendente tem casos (handoffs) vinculados — desative em vez de remover; o histórico é preservado.",
			},
			{ status: 409 },
		);
	}

	const [deleted] = await db
		.delete(mesaAttendants)
		.where(eq(mesaAttendants.id, id))
		.returning({ id: mesaAttendants.id });

	if (!deleted) {
		return Response.json({ error: "Atendente de mesa não encontrado" }, { status: 404 });
	}

	invalidateMesaAttendantCache();
	return Response.json({ id: deleted.id, deleted: true });
}
