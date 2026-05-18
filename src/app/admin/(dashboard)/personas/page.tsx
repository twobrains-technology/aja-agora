import { Plus } from "lucide-react";
import Link from "next/link";
import { PersonasTable } from "@/components/admin/personas/personas-table";
import { Button } from "@/components/ui/button";

export default function PersonasPage() {
	return (
		<div className="space-y-4">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h1 className="text-2xl font-bold tracking-tight">Agentes</h1>
					<p className="text-muted-foreground text-sm mt-1">
						Configure voz, campanhas, guardrails e triggers de handoff de cada agente.
					</p>
				</div>
				<Button render={<Link href="/admin/personas/new" />}>
					<Plus className="size-3.5" />
					Novo agente
				</Button>
			</div>
			<PersonasTable />
		</div>
	);
}
