import { eq } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RunsTimeline } from "@/components/admin/automations/runs-timeline";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { automations } from "@/db/schema";

interface PageProps {
	params: Promise<{ id: string }>;
}

export default async function AutomationRunsPage({ params }: PageProps) {
	const { id } = await params;
	const [row] = await db.select().from(automations).where(eq(automations.id, id)).limit(1);
	if (!row) notFound();
	return (
		<div className="space-y-4">
			<div className="flex items-center gap-2">
				<Button variant="ghost" size="sm" render={<Link href={`/admin/automations/${id}`} />}>
					<ChevronLeft className="size-3.5" /> Voltar
				</Button>
				<h1 className="text-2xl font-bold tracking-tight">Runs · {row.name}</h1>
			</div>
			<RunsTimeline automationId={id} />
		</div>
	);
}
