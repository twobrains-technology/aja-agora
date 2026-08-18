"use client";

// O ranking do que foi clicado, ao lado do visor.
//
// Fica em painel e não em tabela no rodapé porque é a legenda do mapa: o
// operador olha a mancha, procura o que ela é, e a resposta precisa estar no
// mesmo campo de visão. Tabela embaixo obriga a rolar a tela para traduzir o
// que se está vendo em cima.
//
// A barra de proporção fica ATRÁS do texto, não numa coluna própria: a lista é
// estreita, e uma coluna de gráfico roubaria a largura do rótulo, que é a única
// coisa aqui que não tem substituto.

import { TriangleAlertIcon } from "lucide-react";
import type { AlvoDoMapa } from "@/lib/heatmap/aggregate";
import { NOME_DA_SECAO } from "./nomes";

export function ListaDeAlvos({ alvos }: { alvos: AlvoDoMapa[] }) {
	if (alvos.length === 0) {
		return (
			<div className="flex h-full flex-col justify-center gap-1 rounded-lg border border-dashed p-6 text-center">
				<p className="font-medium text-sm">Nenhum clique neste recorte</p>
				<p className="text-muted-foreground text-xs">
					Amplie o período ou tire o filtro de desfecho para ver os cliques da página.
				</p>
			</div>
		);
	}

	return (
		<ol className="flex flex-col">
			{alvos.map((alvo, posicao) => (
				<li
					key={`${alvo.section}:${alvo.selector}:${alvo.label}`}
					className="relative border-border/60 border-b last:border-0"
				>
					{/* Preenchimento de fundo — a proporção lida de relance, sem tirar
					    largura do rótulo. */}
					<div
						aria-hidden
						className="absolute inset-y-0 left-0 bg-primary/10"
						style={{ width: `${alvo.sharePct}%` }}
					/>

					<div className="relative flex items-center gap-3 px-3 py-2.5">
						<span className="w-4 shrink-0 text-right font-medium text-muted-foreground text-xs tabular-nums">
							{posicao + 1}
						</span>

						<span className="min-w-0 flex-1">
							<span className="flex items-center gap-1.5">
								<span className="truncate font-medium text-sm" title={alvo.selector ?? undefined}>
									{alvo.label}
								</span>
								{alvo.suspeito && (
									<TriangleAlertIcon
										aria-label="Maioria dos cliques foi de raiva"
										className="size-3.5 shrink-0 text-destructive"
									/>
								)}
							</span>
							<span className="block truncate text-[11px] text-muted-foreground">
								{NOME_DA_SECAO[alvo.section ?? ""] ?? alvo.section ?? "Fora de seção"}
								{alvo.rageCliques > 0 && ` · ${alvo.rageCliques} de raiva`}
							</span>
						</span>

						<span className="shrink-0 text-right">
							<span className="block font-medium text-sm tabular-nums">{alvo.cliques}</span>
							<span className="block text-[11px] text-muted-foreground tabular-nums">
								{alvo.sharePct}%
							</span>
						</span>
					</div>
				</li>
			))}
		</ol>
	);
}
