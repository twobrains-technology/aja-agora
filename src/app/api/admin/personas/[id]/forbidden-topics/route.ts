import type { PersonaForbiddenTopic } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { invalidateAgentCache } from "@/lib/agent/agents";
import { getPersonaForAdmin, updatePersona } from "@/lib/agent/personas-repo";
import { personaForbiddenTopicSchema } from "@/lib/validations/persona";

const createForbiddenTopicBodySchema = personaForbiddenTopicSchema.omit({ id: true, enabled: true });

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

	const parsed = createForbiddenTopicBodySchema.safeParse(body);
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

	const newTopic: PersonaForbiddenTopic = {
		id: crypto.randomUUID(),
		...parsed.data,
		enabled: true,
	};

	try {
		await updatePersona(personaId, {
			forbiddenTopics: [...persona.forbiddenTopics, newTopic],
		});
		invalidateAgentCache();
		return Response.json({ forbiddenTopic: newTopic }, { status: 201 });
	} catch (err) {
		console.error("[admin/personas/forbidden-topics POST]", err);
		const msg = err instanceof Error ? err.message : "unknown error";
		return Response.json({ error: msg }, { status: 500 });
	}
}
