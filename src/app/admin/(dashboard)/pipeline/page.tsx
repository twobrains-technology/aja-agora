import { Suspense } from "react";
import { PipelineContent } from "@/components/admin/pipeline/pipeline-content";
import { Skeleton } from "@/components/ui/skeleton";
import { STAGE_ORDER } from "@/lib/admin/lead-stages";

function PipelineSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGE_ORDER.map((stage) => (
          <div
            key={stage}
            className="min-w-[260px] w-[260px] shrink-0 rounded-lg border bg-muted/30 p-3 space-y-3"
          >
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PipelinePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Pipeline</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gerencie seus leads arrastando entre as etapas do funil.
        </p>
      </div>
      <Suspense fallback={<PipelineSkeleton />}>
        <PipelineContent />
      </Suspense>
    </div>
  );
}
