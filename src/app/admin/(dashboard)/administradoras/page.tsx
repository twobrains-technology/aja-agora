import { AdministradorasTable } from "@/components/admin/administradoras/administradoras-table";

export default function AdministradorasPage() {
	return (
		<div className="space-y-4">
			<div>
				<h1 className="text-2xl font-bold tracking-tight">Administradoras</h1>
				<p className="text-muted-foreground text-sm mt-1">
					Cadastro interno das administradoras com quem a mesa opera, com o dossiê de procedimento
					(PDF) que orienta o copiloto. Não é fonte de ofertas ao cliente.
				</p>
			</div>
			<AdministradorasTable />
		</div>
	);
}
