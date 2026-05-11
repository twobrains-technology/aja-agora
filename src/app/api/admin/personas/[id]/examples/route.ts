import { z } from "zod";
import type { PersonaExample } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { invalidateAgentCache } from "@/lib/agent/agents";
import { getPersonaForAdmin, updatePersona } from "@/lib/agent/personas-repo";
import { personaExampleSchema } from "@/lib/validations/persona";

// Endpoint granular pra adicionar UM exemplo à persona. Usado pelo "Aplicar"
// do diagnóstico — carrega persona, anexa, salva. Diferente do PATCH /personas/[id]
// que rewrite o array inteiro (sujeito a race com edição concorrente).
const createExampleBodySchema = personaExampleSchema.omit({ id: true }).extend({
	origin: z.enum(["manual", "diagnosis"]).default("manual"),
	sourceConversationId: z.string().uuid().nullable().optional(),
});

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

	const parsed = createExampleBodySchema.safeParse(body);
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

	const newExample: PersonaExample = {
		id: crypto.randomUUID(),
		...parsed.data,
		// `enabled` default = true por convenção. Apply do diagnóstico nasce ativo.
		enabled: parsed.data.enabled ?? true,
	};

	try {
		await updatePersona(personaId, {
			examples: [...persona.examples, newExample],
		});
		invalidateAgentCache();
		return Response.json({ example: newExample }, { status: 201 });
	} catch (err) {
		console.error("[admin/personas/examples POST]", err);
		const msg = err instanceof Error ? err.message : "unknown error";
		return Response.json({ error: msg }, { status: 500 });
	}
}
