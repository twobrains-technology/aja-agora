import { AutomationEditorShell } from "@/components/admin/automations/automation-editor-shell";

interface PageProps {
	searchParams: Promise<{ with?: string }>;
}

export default async function NewAutomationPage({ searchParams }: PageProps) {
	const { with: withMode } = await searchParams;
	return (
		<div className="space-y-3">
			<h1 className="text-2xl font-bold tracking-tight">Nova automação</h1>
			<AutomationEditorShell mode="new" initialAiOpen={withMode === "ai"} />
		</div>
	);
}
