import { desc } from "drizzle-orm";
import { db } from "@/db";
import { mesaAttendants } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { isUniqueViolation } from "@/lib/mesa/pg-error";
import { createMesaAttendantSchema } from "@/lib/validations/mesa";

export async function GET() {
	const { error } = await requireRole("admin");
	if (error) return error;

	const rows = await db.select().from(mesaAttendants).orderBy(desc(mesaAttendants.createdAt));

	return Response.json({ mesaAttendants: rows });
}

export async function POST(req: Request) {
	const { error } = await requireRole("admin");
	if (error) return error;

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: "JSON inválido" }, { status: 400 });
	}

	const parsed = createMesaAttendantSchema.safeParse(body);
	if (!parsed.success) {
		return Response.json(
			{ error: "Dados inválidos", details: parsed.error.flatten() },
			{ status: 400 },
		);
	}

	try {
		const [row] = await db.insert(mesaAttendants).values(parsed.data).returning();
		return Response.json(row, { status: 201 });
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
