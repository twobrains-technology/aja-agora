import { randomUUID } from "node:crypto";
import { and, desc, eq, max } from "drizzle-orm";
import { db } from "@/db";
import { administradoraDocs, administradoras } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { extractPdfText } from "@/lib/pdf/extract";
import { putObject } from "@/lib/storage";
import { createAdministradoraDocSchema } from "@/lib/validations/mesa";

const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB

type DocRow = typeof administradoraDocs.$inferSelect;

// DTO enxuto: NÃO expõe storageKey nem o textoExtraido cru (ADR Decisão 5).
function toDocDTO(row: DocRow) {
	return {
		id: row.id,
		administradoraId: row.administradoraId,
		titulo: row.titulo,
		tipo: row.tipo,
		versao: row.versao,
		isActive: row.isActive,
		temTexto: Boolean(row.textoExtraido && row.textoExtraido.length > 0),
		createdAt: row.createdAt,
	};
}

export async function GET(req: Request) {
	const { error } = await requireRole("admin");
	if (error) return error;

	const administradoraId = new URL(req.url).searchParams.get("administradoraId");

	const rows = administradoraId
		? await db
				.select()
				.from(administradoraDocs)
				.where(eq(administradoraDocs.administradoraId, administradoraId))
				.orderBy(desc(administradoraDocs.createdAt))
		: await db.select().from(administradoraDocs).orderBy(desc(administradoraDocs.createdAt));

	return Response.json({ docs: rows.map(toDocDTO) });
}

export async function POST(req: Request) {
	const { error, session } = await requireRole("admin");
	if (error) return error;

	let form: FormData;
	try {
		form = await req.formData();
	} catch {
		return Response.json({ error: "multipart/form-data inválido" }, { status: 400 });
	}

	const parsed = createAdministradoraDocSchema.safeParse({
		administradoraId: form.get("administradoraId"),
		titulo: form.get("titulo"),
		tipo: form.get("tipo") ?? undefined,
	});
	if (!parsed.success) {
		return Response.json(
			{ error: "Dados inválidos", details: parsed.error.flatten() },
			{ status: 400 },
		);
	}
	const { administradoraId, titulo, tipo } = parsed.data;

	const file = form.get("file");
	if (!(file instanceof File)) {
		return Response.json({ error: "Arquivo PDF obrigatório (campo 'file')" }, { status: 400 });
	}
	const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
	if (!isPdf) {
		return Response.json({ error: "O arquivo precisa ser um PDF" }, { status: 400 });
	}
	if (file.size === 0) {
		return Response.json({ error: "Arquivo vazio" }, { status: 400 });
	}
	if (file.size > MAX_PDF_BYTES) {
		return Response.json({ error: "PDF excede o limite de 20 MB" }, { status: 413 });
	}

	// FK: a administradora precisa existir.
	const adm = await db
		.select({ id: administradoras.id })
		.from(administradoras)
		.where(eq(administradoras.id, administradoraId));
	if (adm.length === 0) {
		return Response.json({ error: "Administradora não encontrada" }, { status: 404 });
	}

	const bytes = new Uint8Array(await file.arrayBuffer());

	// versionamento: nova versão do mesmo título incrementa `versao` (FIX-62).
	const [{ maxVersao }] = await db
		.select({ maxVersao: max(administradoraDocs.versao) })
		.from(administradoraDocs)
		.where(
			and(
				eq(administradoraDocs.administradoraId, administradoraId),
				eq(administradoraDocs.titulo, titulo),
			),
		);
	const versao = (maxVersao ?? 0) + 1;

	const storageKey = `administradora-docs/${administradoraId}/${randomUUID()}.pdf`;
	await putObject(storageKey, bytes, "application/pdf");

	// extração best-effort: falhar NÃO derruba o upload (textoExtraido fica nulo,
	// re-tentável). É o texto que o copiloto injeta (DEC-C).
	let textoExtraido: string | null = null;
	try {
		const text = await extractPdfText(bytes);
		textoExtraido = text.length > 0 ? text : null;
	} catch (err) {
		console.error(
			"[administradora-docs] extração de texto falhou:",
			err instanceof Error ? err.message : String(err),
		);
	}

	const [row] = await db
		.insert(administradoraDocs)
		.values({
			administradoraId,
			titulo,
			tipo,
			storageKey,
			textoExtraido,
			versao,
			uploadedBy: session?.user?.id ?? null,
		})
		.returning();

	return Response.json(toDocDTO(row), { status: 201 });
}
