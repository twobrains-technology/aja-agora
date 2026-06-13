import { notFound } from "next/navigation";
import { SimulatorWeb } from "@/components/admin/simulator/web/simulator-web";
import { isSimulatorEnabled } from "@/lib/utils/env";

export default function SimulatorWebPage() {
	if (!isSimulatorEnabled()) {
		notFound();
	}

	return (
		<div className="space-y-3">
			<div>
				<h1 className="text-2xl font-bold tracking-tight">Simulador — Cliente no Site</h1>
				<p className="text-muted-foreground text-sm mt-1">
					Encarna um lead conversando pelo chat web. Reusa os componentes reais do site e a rota
					<code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-xs">/api/chat</code>. Conversas
					não aparecem no pipeline e não disparam WhatsApp pro atendente real.
				</p>
			</div>
			<SimulatorWeb />
		</div>
	);
}
