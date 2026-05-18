import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { AutomationEditorShell } from "@/components/admin/automations/automation-editor-shell";
import { db } from "@/db";
import { automations } from "@/db/schema";
import type { AutomationGraph } from "@/lib/automation/schema";

interface PageProps {
	params: Promise<{ id: string }>;
}

export default async function EditAutomationPage({ params }: PageProps) {
	const { id } = await params;
	const [row] = await db.select().from(automations).where(eq(automations.id, id)).limit(1);
	if (!row) notFound();
	const initial = {
		id: row.id,
		name: row.name,
		description: row.description,
		triggerType: row.triggerType,
		triggerConfig: row.triggerConfig as Record<string, unknown>,
		graph: row.graph as unknown as AutomationGraph,
		enabled: row.enabled,
		version: row.version,
	};
	return (
		<div className="space-y-3">
			<h1 className="text-2xl font-bold tracking-tight">{row.name}</h1>
			<AutomationEditorShell mode="edit" initial={initial} />
		</div>
	);
}
