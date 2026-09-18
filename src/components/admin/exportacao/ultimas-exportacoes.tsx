"use client";

/**
 * AS ÚLTIMAS EXPORTAÇÕES — a auditoria de LGPD na cara de quem exporta.
 *
 * Quem levou, quando, que recorte e — o campo que importa — se o dado saiu
 * MASCARADO ou COMPLETO. Status como ícone + rótulo, cor por token: um selo
 * coral genérico não diria se o arquivo vazou PII.
 */

import { ShieldAlertIcon, ShieldCheckIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { type ExportacaoRegistrada, META_DO_TIPO } from "@/lib/exportacao/tipos";

const nf = new Intl.NumberFormat("pt-BR");

const QUANDO = new Intl.DateTimeFormat("pt-BR", {
	timeZone: "America/Sao_Paulo",
	dateStyle: "short",
	timeStyle: "short",
});

const DIA = new Intl.DateTimeFormat("pt-BR", {
	timeZone: "America/Sao_Paulo",
	dateStyle: "short",
});

function nomeDoTipo(tipo: string): string {
	return META_DO_TIPO[tipo as keyof typeof META_DO_TIPO]?.titulo ?? tipo;
}

interface Props {
	linhas: ExportacaoRegistrada[];
	carregando: boolean;
}

export function UltimasExportacoes({ linhas, carregando }: Props) {
	return (
		<div className="rounded-md border">
			<div className="border-b px-4 py-3">
				<h2 className="text-sm font-semibold">Últimas exportações</h2>
				<p className="text-xs text-muted-foreground">
					Fica registrado quem exportou, quando e se o dado pessoal saiu completo.
				</p>
			</div>

			{carregando && linhas.length === 0 ? (
				<div className="p-6 text-center text-sm text-muted-foreground">Carregando…</div>
			) : linhas.length === 0 ? (
				<div className="p-6 text-center text-sm text-muted-foreground">
					Nenhuma exportação feita ainda.
				</div>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Quando</TableHead>
							<TableHead>Recorte</TableHead>
							<TableHead>Formato</TableHead>
							<TableHead className="text-right">Linhas</TableHead>
							<TableHead>Dado pessoal</TableHead>
							<TableHead>Quem exportou</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{linhas.map((linha) => (
							<TableRow key={linha.id}>
								<TableCell className="whitespace-nowrap">
									{QUANDO.format(new Date(linha.criadoEm))}
								</TableCell>
								<TableCell>
									<div>{nomeDoTipo(linha.tipo)}</div>
									<div className="text-xs text-muted-foreground">
										{DIA.format(new Date(linha.de))} a {DIA.format(new Date(linha.ate))}
									</div>
								</TableCell>
								<TableCell className="uppercase">{linha.formato}</TableCell>
								<TableCell className="text-right tabular-nums">{nf.format(linha.linhas)}</TableCell>
								<TableCell>
									{linha.mascarado ? (
										<Badge variant="outline" className="gap-1.5 text-success">
											<ShieldCheckIcon className="size-3" aria-hidden="true" />
											Mascarado
										</Badge>
									) : (
										<Badge variant="outline" className="gap-1.5 text-warning">
											<ShieldAlertIcon className="size-3" aria-hidden="true" />
											Completo
										</Badge>
									)}
								</TableCell>
								<TableCell className="text-muted-foreground">
									{linha.usuarioEmail ?? "indisponível: autor não registrado"}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</div>
	);
}
