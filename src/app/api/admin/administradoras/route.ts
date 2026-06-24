import { desc } from "drizzle-orm";
import { db } from "@/db";
import { administradoras } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { isUniqueViolation } from "@/lib/mesa/pg-error";
import { slugify } from "@/lib/mesa/slug";
import { createAdministradoraSchema } from "@/lib/validations/mesa";

export async function GET() {
	const { error } = await requireRole("admin");
	if (error) return error;

	const rows = await db.select().from(administradoras).orderBy(desc(administradoras.createdAt));

	return Response.json({ administradoras: rows });
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

	const parsed = createAdministradoraSchema.safeParse(body);
	if (!parsed.success) {
		return Response.json(
			{ error: "Dados inválidos", details: parsed.error.flatten() },
			{ status: 400 },
		);
	}

	const { nome, codigoBevi } = parsed.data;
	const slug = slugify(nome);

	try {
		const [row] = await db
			.insert(administradoras)
			.values({ nome, slug, codigoBevi: codigoBevi ?? null })
			.returning();
		return Response.json(row, { status: 201 });
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
