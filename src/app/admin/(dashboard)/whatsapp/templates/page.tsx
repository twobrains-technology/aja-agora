import { TemplatesTable } from "@/components/admin/whatsapp-templates/templates-table";

export default function WhatsappTemplatesPage() {
	return (
		<div className="space-y-4">
			<div>
				<h1 className="text-2xl font-bold tracking-tight">Templates de WhatsApp</h1>
				<p className="text-muted-foreground text-sm mt-1">
					Cadastro, submissão à Meta e acompanhamento de status dos Message Templates oficiais. Fora
					da janela de 24h, só um template aprovado pode iniciar conversa — a chave de uso
					(usageKey) liga cada template ao ponto de disparo da jornada.
				</p>
			</div>
			<TemplatesTable />
		</div>
	);
}
