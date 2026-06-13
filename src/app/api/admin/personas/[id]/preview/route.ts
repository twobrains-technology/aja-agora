import { requireRole } from "@/lib/admin/require-role";
import { buildAgent } from "@/lib/agent/agents/builder";
import { getPersonaForAdmin } from "@/lib/agent/personas-repo";
import { previewPersonaSchema } from "@/lib/validations/persona";

const RATE_LIMIT_PER_MINUTE = 10;
const buckets = new Map<string, number[]>();

function checkRateLimit(userId: string): boolean {
	const now = Date.now();
	const cutoff = now - 60_000;
	const recent = (buckets.get(userId) ?? []).filter((t) => t > cutoff);
	if (recent.length >= RATE_LIMIT_PER_MINUTE) return false;
	recent.push(now);
	buckets.set(userId, recent);
	return true;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { error, session } = await requireRole("admin");
	if (error) return error;

	if (!checkRateLimit(session.user.id)) {
		return Response.json(
			{ error: "Limite de testes por minuto atingido. Tente em alguns segundos." },
			{ status: 429 },
		);
	}

	const { id } = await params;

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: "JSON invalido" }, { status: 400 });
	}

	const parsed = previewPersonaSchema.safeParse(body);
	if (!parsed.success) {
		return Response.json(
			{ error: "Dados invalidos", details: parsed.error.flatten() },
			{ status: 400 },
		);
	}

	let liveRow: Awaited<ReturnType<typeof getPersonaForAdmin>>;
	try {
		liveRow = await getPersonaForAdmin(id);
	} catch {
		return Response.json({ error: "Persona não encontrada" }, { status: 404 });
	}

	const { sampleMessage, ...draft } = parsed.data;
	const syntheticRow = { ...liveRow, ...draft };
	const agent = buildAgent(syntheticRow, "neutro");

	const start = Date.now();
	let text = "";
	try {
		const result = await agent.stream({
			messages: [{ role: "user", content: sampleMessage }],
		});
		for await (const part of result.fullStream) {
			if (part.type === "text-delta") text += part.text;
		}
	} catch (err) {
		console.error("[preview] agent stream failed:", err);
		return Response.json({ error: "Falha ao executar preview" }, { status: 500 });
	}

	return Response.json({ text, modelLatencyMs: Date.now() - start });
}
