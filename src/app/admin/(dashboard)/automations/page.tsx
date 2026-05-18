import { Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { AutomationsList } from "@/components/admin/automations/automations-list";
import { Button } from "@/components/ui/button";

export default function AutomationsPage() {
	return (
		<div className="space-y-4">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h1 className="text-2xl font-bold tracking-tight">Automações</h1>
					<p className="text-muted-foreground text-sm mt-1">
						Fluxos que disparam ações automaticamente em pontos do funil — envio de WhatsApp, email,
						mover lead de stage etc.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Button variant="outline" render={<Link href="/admin/automations/new?with=ai" />}>
						<Sparkles className="size-3.5" />
						Gerar com IA
					</Button>
					<Button render={<Link href="/admin/automations/new" />}>
						<Plus className="size-3.5" />
						Nova automação
					</Button>
				</div>
			</div>
			<AutomationsList />
		</div>
	);
}
