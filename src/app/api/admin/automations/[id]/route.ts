import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { automations } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { AutomationGraphSchema, validateGraphStructure } from "@/lib/automation/schema";
import { validateTemplateReferences } from "../route";

interface RouteContext {
	params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: RouteContext) {
	const { error } = await requireRole("admin", "attendant", "viewer");
	if (error) return error;
	const { id } = await params;
	const [row] = await db.select().from(automations).where(eq(automations.id, id)).limit(1);
	if (!row) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
	return NextResponse.json(row);
}

const patchSchema = z.object({
	name: z.string().min(1).max(200).optional(),
	description: z.string().max(2000).optional(),
	triggerType: z.enum(["stage_changed", "idle_in_stage", "chat_event"]).optional(),
	triggerConfig: z.record(z.string(), z.unknown()).optional(),
	graph: AutomationGraphSchema.optional(),
	enabled: z.boolean().optional(),
	// optimistic locking — cliente envia version atual; server checa.
	version: z.number().int().optional(),
});

export async function PATCH(req: Request, { params }: RouteContext) {
	const { error } = await requireRole("admin", "attendant");
	if (error) return error;
	const { id } = await params;
	const body = await req.json().catch(() => ({}));
	const parsed = patchSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "VALIDATION_ERROR", details: parsed.error.flatten() },
			{ status: 400 },
		);
	}
	const data = parsed.data;

	if (data.graph) {
		const structure = validateGraphStructure(data.graph);
		if (!structure.ok) {
			return NextResponse.json(
				{ error: "INVALID_GRAPH", message: structure.error },
				{ status: 400 },
			);
		}
		const templateCheck = await validateTemplateReferences(data.graph);
		if (!templateCheck.ok) {
			return NextResponse.json(
				{ error: "TEMPLATE_NOT_APPROVED", message: templateCheck.error },
				{ status: 400 },
			);
		}
	}

	// Optimistic locking — carrega versão atual e grafo (pra revalidar templates
	// em PATCH que só toggle enabled, sem graph no payload).
	const [current] = await db
		.select({ version: automations.version, graph: automations.graph })
		.from(automations)
		.where(eq(automations.id, id))
		.limit(1);
	if (!current) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
	if (data.version !== undefined && data.version !== current.version) {
		return NextResponse.json(
			{ error: "VERSION_MISMATCH", current: current.version },
			{ status: 409 },
		);
	}

	// Se está ativando (enabled true) e não trouxe graph no payload, revalidar
	// o grafo atual contra templates APPROVED — bloqueia ativar automação que
	// referencia template que virou PENDING/REJECTED/PAUSED.
	if (data.enabled === true && data.graph === undefined) {
		const templateCheck = await validateTemplateReferences(
			current.graph as Parameters<typeof validateTemplateReferences>[0],
		);
		if (!templateCheck.ok) {
			return NextResponse.json(
				{ error: "TEMPLATE_NOT_APPROVED", message: templateCheck.error },
				{ status: 400 },
			);
		}
	}

	const updates: Record<string, unknown> = {};
	if (data.name !== undefined) updates.name = data.name;
	if (data.description !== undefined) updates.description = data.description;
	if (data.triggerType !== undefined) updates.triggerType = data.triggerType;
	if (data.triggerConfig !== undefined) updates.triggerConfig = data.triggerConfig;
	if (data.graph !== undefined) updates.graph = data.graph;
	if (data.enabled !== undefined) updates.enabled = data.enabled;
	updates.version = current.version + 1;

	const [row] = await db.update(automations).set(updates).where(eq(automations.id, id)).returning();

	return NextResponse.json(row);
}

export async function DELETE(_req: Request, { params }: RouteContext) {
	const { error } = await requireRole("admin");
	if (error) return error;
	const { id } = await params;
	const result = await db.delete(automations).where(eq(automations.id, id)).returning({
		id: automations.id,
	});
	if (result.length === 0) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
	return NextResponse.json({ deleted: id });
}
