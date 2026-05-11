import { eq } from "drizzle-orm";
import { db } from "@/db";
import { personas } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { invalidateAgentCache } from "@/lib/agent/agents";
import { createPersona, listPersonas } from "@/lib/agent/personas-repo";
import { createPersonaSchema, slugifyDisplayName } from "@/lib/validations/persona";

async function pickAvailableId(base: string): Promise<string> {
	if (!base) throw new Error("Nome inválido — não consegui gerar id.");
	const existing = await db.query.personas.findFirst({ where: eq(personas.id, base) });
	if (!existing) return base;
	for (let i = 2; i <= 99; i++) {
		const candidate = `${base}-${i}`;
		const hit = await db.query.personas.findFirst({ where: eq(personas.id, candidate) });
		if (!hit) return candidate;
	}
	throw new Error(`Não consegui gerar id único pra "${base}".`);
}

export async function GET() {
	const { error } = await requireRole("admin");
	if (error) return error;

	const rows = await listPersonas();
	return Response.json({ personas: rows });
}

export async function POST(req: Request) {
	const { error } = await requireRole("admin");
	if (error) return error;

	const body = await req.json().catch(() => null);
	const parsed = createPersonaSchema.safeParse(body);
	if (!parsed.success) {
		return Response.json(
			{ error: "Invalid body", details: parsed.error.format() },
			{ status: 400 },
		);
	}

	try {
		const baseSlug = slugifyDisplayName(parsed.data.displayName);
		const id = await pickAvailableId(baseSlug);
		const created = await createPersona({
			id,
			displayName: parsed.data.displayName,
			role: "specialist",
			category: parsed.data.category,
			expertise: parsed.data.expertise,
			voiceTone: parsed.data.voiceTone,
			activeTools: parsed.data.activeTools,
			isActive: parsed.data.isActive,
		});
		invalidateAgentCache();
		return Response.json({ persona: created }, { status: 201 });
	} catch (err) {
		const msg = err instanceof Error ? err.message : "unknown error";
		console.error("[admin/personas POST]", err);
		return Response.json({ error: msg }, { status: 500 });
	}
}
