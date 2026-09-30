import { ConversationsTable } from "@/components/admin/conversations/conversations-table";
import { FiltroAB, NOTA_DO_BRACO_DA_CONVERSA } from "@/components/admin/dashboard/filtro-ab";

export default function ConversationsPage() {
	return (
		<div className="space-y-4">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 className="text-2xl font-bold tracking-tight">Conversas</h1>
					<p className="text-muted-foreground text-sm mt-1">
						Histórico completo de conversas com leads em todos os canais.
					</p>
				</div>
				{/* O recorte por braço de experimento. Aqui a linha É uma conversa, então
				    o braço é o DA CONVERSA — e é o que o filtro escreve na tela. */}
				<FiltroAB nota={NOTA_DO_BRACO_DA_CONVERSA} />
			</div>
			<ConversationsTable />
		</div>
	);
}
