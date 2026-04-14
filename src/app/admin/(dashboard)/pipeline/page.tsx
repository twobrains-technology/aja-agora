import { KanbanBoard } from "@/components/admin/pipeline/kanban-board";

export default function PipelinePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Pipeline</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gerencie seus leads arrastando entre as etapas do funil.
        </p>
      </div>
      <KanbanBoard />
    </div>
  );
}
