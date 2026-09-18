import { Power, PowerOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { opcoesDoAmbiente } from "@/lib/admin/motivo-fora-da-regua";
import { ConfigDaRegua } from "./config-da-regua";

/**
 * O cadastro da dinâmica do remarketing — `/admin/remarketing/config`.
 *
 * A régua (a de verdade, a que manda mensagem) nasceu com os números em código.
 * Esta tela é onde eles passam a ser ajustáveis: cada parâmetro com nome legível,
 * valor vigente e de onde ele veio. O que não muda é a hierarquia — **o código é
 * o padrão, o banco é o ajuste**: apagar uma linha (ou esvaziar o campo) volta ao
 * padrão de fábrica.
 */
export default function RemarketingConfigPage() {
	// A chave operacional é lida no SERVIDOR: é ela que decide se o motor dispara.
	// A tela que governa a régua não pode deixar de dizer se ela está rodando.
	const { reguaLigada } = opcoesDoAmbiente();

	return (
		<div className="space-y-4">
			<div>
				<div className="flex flex-wrap items-center gap-2">
					<h1 className="text-2xl font-bold tracking-tight">Cadastro da régua</h1>
					<Badge variant={reguaLigada ? "success" : "outline"} className="gap-1.5">
						{reguaLigada ? (
							<Power className="size-3" aria-hidden="true" />
						) : (
							<PowerOff className="size-3" aria-hidden="true" />
						)}
						{reguaLigada ? "Ligada" : "Desligada"}
					</Badge>
				</div>
				<p className="text-muted-foreground text-sm mt-1">
					Os números que governam os toques do remarketing. O padrão de fábrica vem do código; o que
					você salvar aqui passa a valer em até um ciclo do motor, sem deploy.
					{!reguaLigada &&
						" A régua está desligada: estes valores só passam a disparar quando a chave for ligada no ambiente."}
				</p>
			</div>
			<ConfigDaRegua />
		</div>
	);
}
