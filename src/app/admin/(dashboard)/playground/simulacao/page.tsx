import { notFound } from "next/navigation";
import { Simulacao } from "@/components/admin/simulacao/simulacao";
import { isPlaygroundEnabled } from "@/lib/playground/ambiente";

export default function SimulacaoPage() {
	if (!isPlaygroundEnabled()) {
		notFound();
	}

	return (
		<div className="space-y-3">
			<div>
				<h1 className="text-2xl font-bold tracking-tight">Simulação de cliente</h1>
				<p className="text-muted-foreground text-sm mt-1">
					Uma IA faz o cliente e conversa sozinha com o vendedor. Só existe em dev.
				</p>
			</div>
			<Simulacao />
		</div>
	);
}
