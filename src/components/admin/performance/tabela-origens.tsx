"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { TipoOrigem } from "@/lib/admin/origem-label";
import type { LinhaOrigem } from "@/lib/admin/performance-types";

const ROTULO_TIPO: Record<TipoOrigem, string> = {
	campanha: "Campanha",
	"click-to-whatsapp": "Click-to-WhatsApp",
	referencia: "Referência",
	direto: "Direto",
};

export function TabelaOrigens({ origens }: { origens: LinhaOrigem[] }) {
	return (
		<Card className="shadow-sm">
			<CardHeader>
				<CardTitle>Desempenho por origem</CardTitle>
				<CardDescription>Quanto cada campanha trouxe — e quanto virou contrato</CardDescription>
			</CardHeader>
			<CardContent>
				{origens.length === 0 ? (
					<div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
						Nenhuma visita registrada no período
					</div>
				) : (
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Origem</TableHead>
									<TableHead className="text-right">Visitas</TableHead>
									<TableHead className="text-right">Conversas</TableHead>
									<TableHead className="text-right">Identificados</TableHead>
									<TableHead className="text-right">Propostas</TableHead>
									<TableHead className="text-right">Fechados</TableHead>
									<TableHead className="text-right">Visita → contrato</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{origens.map((linha) => (
									<TableRow key={linha.origem.label}>
										<TableCell>
											<div className="flex flex-col gap-1">
												<span className="font-medium">{linha.origem.label}</span>
												<Badge variant="outline" className="w-fit font-normal text-xs">
													{ROTULO_TIPO[linha.origem.tipo]}
												</Badge>
											</div>
										</TableCell>
										<TableCell className="text-right tabular-nums">{linha.visitas}</TableCell>
										<TableCell className="text-right tabular-nums">{linha.conversas}</TableCell>
										<TableCell className="text-right tabular-nums">{linha.identificados}</TableCell>
										<TableCell className="text-right tabular-nums">{linha.propostas}</TableCell>
										<TableCell className="text-right tabular-nums font-medium">
											{linha.fechados}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{linha.taxaFechamento.toFixed(1)}%
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
