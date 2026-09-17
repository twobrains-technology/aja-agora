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
	return (
		<div className="space-y-4">
			<div>
				<h1 className="text-2xl font-bold tracking-tight">Cadastro da régua</h1>
				<p className="text-muted-foreground text-sm mt-1">
					Os números que governam os toques do remarketing. O padrão de fábrica vem do código; o que
					você salvar aqui passa a valer em até um ciclo do motor, sem deploy.
				</p>
			</div>
			<ConfigDaRegua />
		</div>
	);
}
