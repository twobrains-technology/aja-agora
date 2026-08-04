"use client";

import { InfoIcon } from "lucide-react";
import type { CoberturaAtribuicao } from "@/lib/admin/performance-types";

/**
 * Diz em voz alta quanto do funil tem origem conhecida.
 *
 * Existe pra a tela não mentir por omissão: conversa criada antes desta
 * instrumentação, ou por caminho que não passou pela landing, entra no total e
 * some da tabela por origem. Sem esta faixa, a soma das campanhas pareceria o
 * total e alguém decidiria verba com base num recorte silencioso.
 */
export function CoberturaAtribuicaoAviso({ cobertura }: { cobertura: CoberturaAtribuicao }) {
	if (cobertura.conversasTotal === 0) return null;

	const completa = cobertura.percent >= 99;

	return (
		<div
			className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
				completa ? "text-muted-foreground" : "border-amber-500 bg-amber-50 text-amber-900"
			}`}
		>
			<InfoIcon className="size-4 mt-0.5 shrink-0" aria-hidden="true" />
			<p>
				<span className="font-medium">
					{cobertura.percent.toFixed(1)}% das conversas têm origem identificada
				</span>{" "}
				({cobertura.conversasComOrigem} de {cobertura.conversasTotal}).
				{!completa &&
					" As demais não passaram pela landing instrumentada — elas contam no funil, mas não aparecem na tabela por origem."}
			</p>
		</div>
	);
}
