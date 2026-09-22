"use client";

import { UsersIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EixoDoPerfil, PerfilDosVisitantes } from "@/lib/admin/perfil-dos-visitantes";

const nf = new Intl.NumberFormat("pt-BR");

/**
 * As cores das fatias, na ordem. Elas são reforço, nunca a informação: cada
 * fatia também aparece escrita com rótulo e percentual na legenda, para a barra
 * continuar legível em escala de cinza.
 */
const CORES = ["var(--chart-1)", "var(--chart-3)", "var(--chart-4)"];

function percentual(fracao: number): string {
	return `${Math.round(fracao * 100)}%`;
}

function Eixo({ eixo }: { eixo: EixoDoPerfil }) {
	return (
		<div>
			<div className="flex items-baseline justify-between gap-3">
				<span className="text-xs font-medium text-muted-foreground">{eixo.rotulo}</span>
				{eixo.estado === "detalhe" && (
					<span className="text-xs text-muted-foreground tabular-nums">
						{nf.format(eixo.total)} {eixo.unidade}
					</span>
				)}
			</div>

			{eixo.estado === "semMedicao" ? (
				<p className="mt-1.5 py-1.5 text-xs text-muted-foreground">
					Sem dado — {eixo.motivo ?? "não medido no período"}
				</p>
			) : (
				<>
					{/* Uma barra por eixo, preenchida na fração medida. Proporção lida de
					    relance; o número absoluto fica ao lado, na legenda. */}
					<div className="mt-1.5 flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
						{eixo.fatias.map((fatia, i) => (
							<div
								key={fatia.rotulo}
								style={{
									width: `${fatia.fracao * 100}%`,
									backgroundColor: CORES[i % CORES.length],
								}}
								title={`${fatia.rotulo}: ${nf.format(fatia.total)} (${percentual(fatia.fracao)})`}
							/>
						))}
					</div>
					<ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
						{eixo.fatias.map((fatia, i) => (
							<li
								key={fatia.rotulo}
								className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
							>
								<span
									className="size-2 shrink-0 rounded-[2px]"
									style={{ backgroundColor: CORES[i % CORES.length] }}
									aria-hidden="true"
								/>
								{fatia.rotulo}
								<span className="tabular-nums text-foreground">
									{nf.format(fatia.total)} · {percentual(fatia.fracao)}
								</span>
							</li>
						))}
					</ul>
				</>
			)}
		</div>
	);
}

/**
 * "Perfil dos visitantes" — o resumo que o painel não tinha.
 *
 * Entra na primeira dobra do "Agora", ao lado dos cartões de pulso: a área que
 * antes ficava vazia na grade passa a responder "que tipo de gente está vindo",
 * que é a pergunta que o número solto de visitas não responde.
 */
export function PerfilDosVisitantesCard({
	perfil,
	className,
}: {
	perfil: PerfilDosVisitantes;
	className?: string;
}) {
	return (
		<Card className={className}>
			<CardHeader className="pb-2">
				<CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
					<UsersIcon className="size-4 text-primary" aria-hidden="true" />
					Perfil dos visitantes
				</CardTitle>
				<CardDescription className="text-xs">
					{perfil.totalDeChegadas > 0
						? `${nf.format(perfil.totalDeChegadas)} ${perfil.totalDeChegadas === 1 ? "chegada" : "chegadas"} de gente hoje`
						: "Sem visita de gente hoje"}
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				{perfil.eixos.map((eixo) => (
					<Eixo key={eixo.chave} eixo={eixo} />
				))}
			</CardContent>
		</Card>
	);
}
