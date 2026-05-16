import { requireRole } from "@/lib/admin/require-role";
import { invalidateAgentCache } from "@/lib/agent/agents";
import { getPersonaForAdmin, updatePersona } from "@/lib/agent/personas-repo";
import { updatePersonaSchema } from "@/lib/validations/persona";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { error } = await requireRole("admin");
	if (error) return error;

	const { id } = await params;
	try {
		const row = await getPersonaForAdmin(id);
		return Response.json({ persona: row });
	} catch {
		return Response.json({ error: "Persona não encontrada" }, { status: 404 });
	}
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { error } = await requireRole("admin");
	if (error) return error;

	const { id } = await params;

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: "JSON invalido" }, { status: 400 });
	}

	const parsed = updatePersonaSchema.safeParse(body);
	if (!parsed.success) {
		return Response.json(
			{ error: "Dados invalidos", details: parsed.error.flatten() },
			{ status: 400 },
		);
	}

	try {
		const updated = await updatePersona(id, parsed.data);
		invalidateAgentCache();
		return Response.json({ id: updated.id, version: updated.version });
	} catch {
		return Response.json({ error: "Persona não encontrada" }, { status: 404 });
	}
}
