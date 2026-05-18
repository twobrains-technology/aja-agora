import { Plus } from "lucide-react";
import Link from "next/link";
import { WhatsAppTemplatesTable } from "@/components/admin/whatsapp-templates/templates-table";
import { Button } from "@/components/ui/button";

export default function WhatsAppTemplatesPage() {
	return (
		<div className="space-y-4">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h1 className="text-2xl font-bold tracking-tight">Templates WhatsApp</h1>
					<p className="text-muted-foreground text-sm mt-1">
						Mensagens pré-aprovadas pela Meta. Usadas em automações fora da janela de 24h.
					</p>
				</div>
				<Button render={<Link href="/admin/whatsapp-templates/new" />}>
					<Plus className="size-3.5" />
					Novo template
				</Button>
			</div>
			<WhatsAppTemplatesTable />
		</div>
	);
}
