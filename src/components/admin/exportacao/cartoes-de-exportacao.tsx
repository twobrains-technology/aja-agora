"use client";

/**
 * OS TRÊS CARTÕES DA EXPORTAÇÃO — o que sai, quantas linhas, e os botões.
 *
 * Cada cartão diz em UMA frase o que o arquivo contém (o pedido do Gustavo
 * exige que quem recebe saiba o que está levando), mostra a contagem do recorte
 * e oferece CSV e JSON. O que a tela NÃO faz: inventar um rótulo novo para o
 * recorte — título, descrição e unidade vêm de `META_DO_TIPO`, o mesmo
 * dicionário que a API usa.
 */

import { DownloadIcon, FileJsonIcon, FileSpreadsheetIcon, ShieldAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { META_DO_TIPO, TIPOS_DE_EXPORTACAO, type TipoExportacao } from "@/lib/exportacao/tipos";

const nf = new Intl.NumberFormat("pt-BR");

interface Props {
	contagens: Record<TipoExportacao, number> | null;
	carregando: boolean;
	completo: boolean;
	onTrocarCompleto: (valor: boolean) => void;
	onExportar: (tipo: TipoExportacao, formato: "csv" | "json") => void;
}

function BotaoDeFormato({
	tipo,
	formato,
	onExportar,
}: {
	tipo: TipoExportacao;
	formato: "csv" | "json";
	onExportar: Props["onExportar"];
}) {
	const rotulo = formato === "csv" ? "CSV" : "JSON";
	const Icone = formato === "csv" ? FileSpreadsheetIcon : FileJsonIcon;
	return (
		<Button variant="outline" size="sm" onClick={() => onExportar(tipo, formato)}>
			<Icone className="size-3.5" aria-hidden="true" />
			{rotulo}
		</Button>
	);
}

export function CartoesDeExportacao({
	contagens,
	carregando,
	completo,
	onTrocarCompleto,
	onExportar,
}: Props) {
	return (
		<div className="space-y-4">
			<div className="grid gap-4 md:grid-cols-3">
				{TIPOS_DE_EXPORTACAO.map((tipo) => {
					const meta = META_DO_TIPO[tipo];
					const quantidade = contagens?.[tipo];
					return (
						<Card key={tipo} className="flex flex-col">
							<CardHeader>
								<CardTitle className="flex items-center gap-2 text-base">
									<DownloadIcon className="size-4 text-muted-foreground" aria-hidden="true" />
									{meta.titulo}
								</CardTitle>
								<CardDescription>{meta.descricao}</CardDescription>
							</CardHeader>
							<CardContent className="mt-auto flex flex-col gap-3">
								<div className="text-sm text-muted-foreground">
									{carregando && quantidade === undefined ? (
										<Skeleton className="h-5 w-40" />
									) : quantidade === undefined ? (
										"A contagem não está disponível."
									) : (
										<>
											<span className="text-2xl font-semibold tabular-nums text-foreground">
												{nf.format(quantidade)}
											</span>{" "}
											{meta.unidade} no período
										</>
									)}
								</div>
								<div className="flex flex-wrap gap-2">
									<BotaoDeFormato tipo={tipo} formato="csv" onExportar={onExportar} />
									<BotaoDeFormato tipo={tipo} formato="json" onExportar={onExportar} />
								</div>
							</CardContent>
						</Card>
					);
				})}
			</div>

			<div className="space-y-3 rounded-md border p-4">
				<label htmlFor="exportacao-completo" className="flex items-start gap-3 text-sm">
					<Checkbox
						id="exportacao-completo"
						checked={completo}
						onCheckedChange={(valor) => onTrocarCompleto(valor === true)}
						className="mt-0.5"
					/>
					<span>
						<span className="font-medium">Incluir dado pessoal completo</span>
						<span className="mt-0.5 block text-muted-foreground">
							Desligado, telefone, e-mail e nome saem mascarados.
						</span>
					</span>
				</label>

				{completo && (
					<div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-3 text-sm">
						<ShieldAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
						<span>
							Este arquivo terá telefone, e-mail e nome completos. Use só quando for indispensável.
						</span>
					</div>
				)}

				<p className="text-sm text-muted-foreground">
					Vínculos ausentes saem escritos, nunca em branco.
				</p>
			</div>
		</div>
	);
}
