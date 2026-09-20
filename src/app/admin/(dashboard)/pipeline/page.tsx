import { PipelineContent } from "@/components/admin/pipeline/pipeline-content";
export default function PipelinePage() {
	return (
		<div className="space-y-4">
			<div>
				<h1 className="text-2xl font-bold tracking-tight">Pipeline</h1>
				<p className="text-muted-foreground text-sm mt-1">
					Gerencie seus leads arrastando entre as etapas do funil.
				</p>
			</div>
			<PipelineContent />
		</div>
	);
}
