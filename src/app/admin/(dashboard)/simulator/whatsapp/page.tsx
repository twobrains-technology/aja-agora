import { notFound } from "next/navigation";
import { SimulatorWhatsapp } from "@/components/admin/simulator/whatsapp/simulator-whatsapp";

export default function SimulatorWhatsappPage() {
	if (process.env.NODE_ENV === "production") {
		notFound();
	}

	return (
		<div className="space-y-3">
			<div>
				<h1 className="text-2xl font-bold tracking-tight">Simulador — Cliente no WhatsApp</h1>
				<p className="text-muted-foreground text-sm mt-1">
					Encarna um lead recebendo o agente pelo WhatsApp. Mensagens passam pelo MESMO{" "}
					<code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-xs">processTextMessage</code>{" "}
					que o webhook real chama — só a saída pra Meta API é interceptada e roteada pra essa
					UI.
				</p>
			</div>
			<SimulatorWhatsapp />
		</div>
	);
}
