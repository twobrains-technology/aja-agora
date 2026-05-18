import { NewWhatsAppTemplateForm } from "@/components/admin/whatsapp-templates/new-template-form";

export default function NewWhatsAppTemplatePage() {
	return (
		<div className="space-y-4">
			<div>
				<h1 className="text-2xl font-bold tracking-tight">Novo template WhatsApp</h1>
				<p className="text-muted-foreground text-sm mt-1">
					Cadastre uma mensagem para usar em automações. Após salvar, submeta à Meta para aprovação
					(~24h).
				</p>
			</div>
			<NewWhatsAppTemplateForm />
		</div>
	);
}
