import { notFound } from "next/navigation";
import { SimulatorChat } from "@/components/admin/simulator/attendant/simulator-chat";
import { isSimulatorEnabled } from "@/lib/utils/env";

export default function SimulatorPage() {
	if (!isSimulatorEnabled()) {
		notFound();
	}

	return (
		<div className="space-y-4">
			<div>
				<h1 className="text-2xl font-bold tracking-tight">Simulador de Atendente</h1>
				<p className="text-muted-foreground text-sm mt-1">
					Ferramenta de dev — encarna um atendente cadastrado para testar handoff sem precisar de um
					segundo número de WhatsApp.
				</p>
			</div>
			<SimulatorChat />
		</div>
	);
}
