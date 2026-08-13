import { ConfiguracaoWhatsapp } from "@/components/admin/whatsapp-perfil/configuracao-whatsapp";

export default function ConfiguracaoWhatsappPage() {
	return (
		<div className="space-y-4">
			<div>
				<h1 className="text-2xl font-bold tracking-tight">Configuração do WhatsApp</h1>
				<p className="text-muted-foreground text-sm mt-1">
					O perfil corporativo do número oficial — foto, recado, descrição, endereço, e-mail e ramo
					de atividade. É o que o cliente vê antes de mandar a primeira mensagem. Os dados moram na
					Meta, não aqui: o que esta tela mostra é lido dela a cada abertura.
				</p>
			</div>
			<ConfiguracaoWhatsapp />
		</div>
	);
}
