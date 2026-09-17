"use client";

import { Card } from "@/components/ui/card";
import type { Contadores, Situacao } from "@/lib/admin/remarketing-tela";
import { ROTULO_DA_SITUACAO, SITUACOES } from "@/lib/admin/remarketing-tela";
import { cn } from "@/lib/utils";

const nf = new Intl.NumberFormat("pt-BR");

/**
 * Os contadores do topo — e o filtro, no mesmo lugar.
 *
 * Clicar num cartão filtra a lista por aquela situação (segundo clique limpa):
 * é o que transforma "124 ativos" de número em pergunta. Cada cartão carrega
 * `aria-pressed` porque o estado selecionado não pode existir só na cor.
 *
 * Os números vêm do RECORTE (período + objetivo), não do filtro de situação: se
 * viessem do filtro, escolher "Responderam" zeraria todos os outros cartões e a
 * tela deixaria de mostrar a distribuição.
 */
export function CartoesDaRegua({
	contadores,
	situacaoAtiva,
	onSelecionar,
}: {
	contadores: Contadores;
	situacaoAtiva: Situacao | null;
	onSelecionar: (situacao: Situacao | null) => void;
}) {
	return (
		<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
			{SITUACOES.map((situacao) => {
				const ativo = situacaoAtiva === situacao;
				return (
					<Card key={situacao} size="sm" className={cn("gap-0", ativo && "ring-2 ring-primary")}>
						<button
							type="button"
							aria-pressed={ativo}
							onClick={() => onSelecionar(ativo ? null : situacao)}
							title={
								ativo
									? "Mostrar todas as situações"
									: `Mostrar só quem ${ROTULO_DA_SITUACAO[situacao].toLowerCase()}`
							}
							className="w-full px-4 text-left transition-colors hover:bg-muted/50"
						>
							<span className="block text-xs text-muted-foreground">
								{ROTULO_DA_SITUACAO[situacao]}
							</span>
							<span className="mt-0.5 block font-heading text-2xl font-semibold tabular-nums">
								{nf.format(contadores[situacao])}
							</span>
						</button>
					</Card>
				);
			})}
		</div>
	);
}
