"use client";

export interface ItemDoHistorico {
	versao: number;
	salvoPor: string | null;
	criadoEm: string;
	caixaVersao: number | null;
}

export function HistoricoDeVersoes({ itens }: { itens: ItemDoHistorico[] }) {
	return (
		<section aria-label="Histórico de versões" className="space-y-1">
			<h3 className="text-sm font-medium">Histórico de versões</h3>
			{itens.length === 0 ? (
				<p className="text-xs text-muted-foreground">Nenhuma versão salva ainda.</p>
			) : (
				<ul className="space-y-1 text-xs">
					{itens.map((i) => (
						<li key={i.versao} className="rounded border px-2 py-1">
							Versão {i.versao} · {i.salvoPor ?? "autor desconhecido"} ·{" "}
							{new Date(i.criadoEm).toLocaleString("pt-BR")} ·{" "}
							{i.caixaVersao === null ? "NÃO PUBLICADA" : `PUBLICADA (conduta v${i.caixaVersao})`}
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
