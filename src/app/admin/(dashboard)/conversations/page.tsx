import { ConversationsTable } from "@/components/admin/conversations/conversations-table";

export default function ConversationsPage() {
	return (
		<div className="space-y-4">
			<div>
				<h1 className="text-2xl font-bold tracking-tight">Conversas</h1>
				<p className="text-muted-foreground text-sm mt-1">
					Histórico completo de conversas com leads em todos os canais.
				</p>
			</div>
			<ConversationsTable />
		</div>
	);
}
