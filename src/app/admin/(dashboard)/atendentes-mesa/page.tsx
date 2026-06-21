import { MesaAttendantsTable } from "@/components/admin/mesa-attendants/mesa-attendants-table";

export default function AtendentesMesaPage() {
	return (
		<div className="space-y-4">
			<div>
				<h1 className="text-2xl font-bold tracking-tight">Atendentes de mesa</h1>
				<p className="text-muted-foreground text-sm mt-1">
					Cadastro simples (nome + WhatsApp) dos atendentes de operação que recebem o transbordo e
					conversam com o copiloto. Sem login — diferente dos atendentes de conversa.
				</p>
			</div>
			<MesaAttendantsTable />
		</div>
	);
}
