"use client";

/**
 * A tabela de campanhas: uma linha por campanha, com o funil do CRM e o gasto
 * do gerenciador na mesma leitura.
 *
 * As três decisões que a tela carrega:
 *
 *   1. **Os dois números de lead ficam na mesma linha.** "Leads (Meta)" é o que a
 *      Meta atribuiu; "Leads (CRM)" é o que o CRM contou. A coluna "Diferença"
 *      nomeia o desencontro em vez de escondê-lo — os dois nunca vão concordar, e
 *      quem lê precisa saber disso antes de cobrar Growth ou financeiro.
 *   2. **Custo por lead qualificado é a primeira coluna de número** e a ordenação
 *      padrão (vem decidida do servidor). Custo por lead sozinho não decide nada.
 *   3. **Campanha sem nome resolvido continua aparecendo.** O resolvedor não
 *      conhecer a campanha não é erro dela: o rótulo cai na UTM ou no id
 *      abreviado, com a marca de "não resolvida" ao lado.
 */

import { TriangleAlertIcon } from "lucide-react";
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
import type { LinhaCampanha } from "@/lib/admin/campanhas-queries";
import { custo, inteiro, reais } from "./formato";

/** "ACTIVE"/"PAUSED"/"ARCHIVED" como a Meta devolve, em português. */
const ROTULO_STATUS: Record<string, string> = {
	ACTIVE: "Ativa",
	PAUSED: "Pausada",
	ARCHIVED: "Arquivada",
};

/** "+3" / "−2" / "0" — o sinal já diz de que lado a diferença caiu. */
function diferenca(valor: number): string {
	if (valor === 0) return "0";
	return valor > 0 ? `+${inteiro(valor)}` : `−${inteiro(Math.abs(valor))}`;
}

function CelulaDiferenca({ valor }: { valor: number }) {
	const cor =
		valor > 0
			? "text-[var(--blue-700)]"
			: valor < 0
				? "text-muted-foreground"
				: "text-muted-foreground";
	return (
		<TableCell
			className={`text-right tabular-nums ${cor}`}
			title={
				valor > 0
					? "A Meta atribuiu mais leads do que o CRM contou no período"
					: valor < 0
						? "O CRM contou mais leads do que a Meta atribuiu no período"
						: "Os dois números coincidiram neste período — é raro e não significa que os dois medem o mesmo"
			}
		>
			{diferenca(valor)}
		</TableCell>
	);
}

export function TabelaCampanhas({ linhas }: { linhas: LinhaCampanha[] }) {
	if (linhas.length === 0) {
		return null;
	}

	return (
		<Card className="shadow-sm">
			<CardHeader>
				<CardTitle>Desempenho por campanha</CardTitle>
				<CardDescription>
					Ordenado por custo por lead qualificado — as com custo mais alto no topo. Campanha sem
					qualificado no período aparece no fim, mas não some.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="overflow-x-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Campanha</TableHead>
								<TableHead className="text-right">Investimento</TableHead>
								<TableHead
									className="text-right"
									title="Investimento dividido pelos leads que chegaram ao estágio qualificado"
								>
									Custo / qualificado
								</TableHead>
								<TableHead className="text-right" title="Leads que a Meta atribuiu no período">
									Leads (Meta)
								</TableHead>
								<TableHead className="text-right" title="Conversas com contato deixado no CRM">
									Leads (CRM)
								</TableHead>
								<TableHead className="text-right" title="Leads (Meta) menos Leads (CRM)">
									Diferença
								</TableHead>
								<TableHead className="text-right">Qualificados</TableHead>
								<TableHead className="text-right">Conversas</TableHead>
								<TableHead className="text-right">Propostas</TableHead>
								<TableHead className="text-right">Fechados</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{linhas.map((linha) => (
								<TableRow key={linha.chave}>
									<TableCell>
										<div className="flex flex-col gap-1 min-w-0">
											<span className="font-medium" title={linha.entityId ?? linha.chave}>
												{linha.nome}
											</span>
											<div className="flex items-center gap-2">
												{!linha.nomeResolvido && (
													<Badge
														variant="outline"
														className="w-fit gap-1 font-normal text-xs"
														title="O gerenciador ainda não espelhou esta campanha — o rótulo é o valor cru da origem"
													>
														<TriangleAlertIcon className="size-3" aria-hidden="true" />
														Nome não resolvido
													</Badge>
												)}
												{linha.status && (
													<Badge variant="secondary" className="w-fit font-normal text-xs">
														{ROTULO_STATUS[linha.status] ?? linha.status}
													</Badge>
												)}
												{linha.visitas > 0 && (
													<span className="text-xs text-muted-foreground tabular-nums">
														{inteiro(linha.visitas)} visitas
													</span>
												)}
											</div>
										</div>
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{linha.spendCents === 0 ? "—" : reais(linha.spendCents)}
									</TableCell>
									<TableCell className="text-right tabular-nums font-medium">
										{custo(linha.custoPorQualificadoCents)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{inteiro(linha.leadsMeta)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{inteiro(linha.identificados)}
									</TableCell>
									<CelulaDiferenca valor={linha.diferencaDeLeads} />
									<TableCell className="text-right tabular-nums">
										{inteiro(linha.qualificados)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{inteiro(linha.conversas)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{inteiro(linha.propostas)}
									</TableCell>
									<TableCell className="text-right tabular-nums font-medium">
										{inteiro(linha.fechados)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			</CardContent>
		</Card>
	);
}
