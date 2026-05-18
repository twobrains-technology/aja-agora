import { desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { automationNodeExecutions, automationRuns, leads } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";

interface Ctx {
	params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Ctx) {
	const { error } = await requireRole("admin", "attendant", "viewer");
	if (error) return error;
	const { id } = await params;
	const runs = await db
		.select({
			id: automationRuns.id,
			leadId: automationRuns.leadId,
			leadName: leads.name,
			status: automationRuns.status,
			startedAt: automationRuns.startedAt,
			completedAt: automationRuns.completedAt,
			stepCount: automationRuns.stepCount,
			errorMessage: automationRuns.errorMessage,
			currentNodeId: automationRuns.currentNodeId,
		})
		.from(automationRuns)
		.leftJoin(leads, eq(automationRuns.leadId, leads.id))
		.where(eq(automationRuns.automationId, id))
		.orderBy(desc(automationRuns.startedAt))
		.limit(100);

	// Carrega node executions agrupado por run.
	// Usa inArray pra evitar bug do `.where(undefined)` que vaza TODAS as
	// execuções do banco — apontado pelo QA crítico (P0).
	const runIds = runs.map((r) => r.id);
	const executions = runIds.length
		? await db
				.select()
				.from(automationNodeExecutions)
				.where(inArray(automationNodeExecutions.runId, runIds))
				.orderBy(automationNodeExecutions.startedAt)
		: [];
	const execMap = new Map<string, typeof executions>();
	for (const ex of executions) {
		const arr = execMap.get(ex.runId) ?? [];
		arr.push(ex);
		execMap.set(ex.runId, arr);
	}

	return NextResponse.json({
		runs: runs.map((r) => ({ ...r, executions: execMap.get(r.id) ?? [] })),
	});
}
