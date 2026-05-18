import { desc, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { automations, whatsappTemplates } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import {
	AutomationGraphSchema,
	type AutomationGraph,
	validateGraphStructure,
} from "@/lib/automation/schema";

export async function GET() {
	const { error } = await requireRole("admin", "attendant", "viewer");
	if (error) return error;
	const rows = await db.select().from(automations).orderBy(desc(automations.createdAt));
	return NextResponse.json({ automations: rows });
}

const createSchema = z.object({
	name: z.string().min(1).max(200),
	description: z.string().max(2000).optional(),
	triggerType: z.enum(["stage_changed", "idle_in_stage", "chat_event"]),
	triggerConfig: z.record(z.string(), z.unknown()),
	graph: AutomationGraphSchema,
	enabled: z.boolean().default(false),
});

export async function POST(req: Request) {
	const { error, session } = await requireRole("admin", "attendant");
	if (error) return error;
	const body = await req.json().catch(() => ({}));
	const parsed = createSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "VALIDATION_ERROR", details: parsed.error.flatten() },
			{ status: 400 },
		);
	}
	const data = parsed.data;
	const structure = validateGraphStructure(data.graph);
	if (!structure.ok) {
		return NextResponse.json({ error: "INVALID_GRAPH", message: structure.error }, { status: 400 });
	}
	const templateCheck = await validateTemplateReferences(data.graph);
	if (!templateCheck.ok) {
		return NextResponse.json(
			{ error: "TEMPLATE_NOT_APPROVED", message: templateCheck.error },
			{ status: 400 },
		);
	}
	const [row] = await db
		.insert(automations)
		.values({
			name: data.name,
			description: data.description ?? null,
			triggerType: data.triggerType,
			triggerConfig: data.triggerConfig,
			graph: data.graph,
			enabled: data.enabled,
			createdBy: session?.user.id ?? null,
		})
		.returning();
	return NextResponse.json(row, { status: 201 });
}

/**
 * Garante que toda referência a action.send_whatsapp(mode=template) usa
 * um template com metaStatus=APPROVED. Cobre CA-P1-02 (parte da API).
 */
export async function validateTemplateReferences(
	graph: AutomationGraph,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const names = new Set<string>();
	for (const n of graph.nodes) {
		if (n.type !== "action.send_whatsapp") continue;
		const cfg = n.config as { mode?: string; templateName?: string };
		if (cfg.mode === "template" && cfg.templateName) names.add(cfg.templateName);
	}
	if (names.size === 0) return { ok: true };
	const found = await db
		.select({ name: whatsappTemplates.name, metaStatus: whatsappTemplates.metaStatus })
		.from(whatsappTemplates)
		.where(inArray(whatsappTemplates.name, Array.from(names)));
	const byName = new Map(found.map((t) => [t.name, t.metaStatus]));
	for (const name of names) {
		const status = byName.get(name);
		if (!status) return { ok: false, error: `template "${name}" não encontrado` };
		if (status !== "APPROVED") {
			return { ok: false, error: `template "${name}" status ${status}, esperado APPROVED` };
		}
	}
	return { ok: true };
}
