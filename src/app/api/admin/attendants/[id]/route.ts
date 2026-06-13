import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user as userTable } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { updateAttendantSchema } from "@/lib/validations/attendant";
import { invalidateAttendantCache } from "@/lib/whatsapp/proxy";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { error } = await requireRole("admin", "attendant");
	if (error) return error;

	const { id } = await params;

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: "JSON invalido" }, { status: 400 });
	}

	const parsed = updateAttendantSchema.safeParse(body);
	if (!parsed.success) {
		return Response.json(
			{ error: "Dados invalidos", details: parsed.error.flatten() },
			{ status: 400 },
		);
	}

	const existing = await db.query.user.findFirst({
		where: eq(userTable.id, id),
	});
	if (!existing || existing.role !== "attendant") {
		return Response.json({ error: "Atendente nao encontrado" }, { status: 404 });
	}

	await db.update(userTable).set(parsed.data).where(eq(userTable.id, id));

	invalidateAttendantCache();

	return Response.json({ id, updated: Object.keys(parsed.data) });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { error } = await requireRole("admin", "attendant");
	if (error) return error;

	const { id } = await params;

	const existing = await db.query.user.findFirst({
		where: eq(userTable.id, id),
	});
	if (!existing || existing.role !== "attendant") {
		return Response.json({ error: "Atendente nao encontrado" }, { status: 404 });
	}

	await db.update(userTable).set({ isActive: false }).where(eq(userTable.id, id));

	invalidateAttendantCache();

	return Response.json({ id, status: "inactive" });
}
