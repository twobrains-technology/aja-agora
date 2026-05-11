import type { PersonaHandoffTrigger } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { invalidateAgentCache } from "@/lib/agent/agents";
import { getPersonaForAdmin, updatePersona } from "@/lib/agent/personas-repo";
import { personaHandoffTriggerSchema } from "@/lib/validations/persona";

const createHandoffTriggerBodySchema = personaHandoffTriggerSchema.omit({ id: true, enabled: true });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { error } = await requireRole("admin");
	if (error) return error;

	const { id: personaId } = await params;

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: "JSON inválido" }, { status: 400 });
	}

	const parsed = createHandoffTriggerBodySchema.safeParse(body);
	if (!parsed.success) {
		return Response.json(
			{ error: "Dados inválidos", details: parsed.error.flatten() },
			{ status: 400 },
		);
	}

	let persona: Awaited<ReturnType<typeof getPersonaForAdmin>>;
	try {
		persona = await getPersonaForAdmin(personaId);
	} catch {
		return Response.json({ error: "Persona não encontrada" }, { status: 404 });
	}

	const newTrigger: PersonaHandoffTrigger = {
		id: crypto.randomUUID(),
		...parsed.data,
		enabled: true,
	};

	try {
		await updatePersona(personaId, {
			handoffTriggers: [...persona.handoffTriggers, newTrigger],
		});
		invalidateAgentCache();
		return Response.json({ handoffTrigger: newTrigger }, { status: 201 });
	} catch (err) {
		console.error("[admin/personas/handoff-triggers POST]", err);
		const msg = err instanceof Error ? err.message : "unknown error";
		return Response.json({ error: msg }, { status: 500 });
	}
}
