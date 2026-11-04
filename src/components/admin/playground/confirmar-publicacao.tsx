"use client";

import { Button } from "@/components/ui/button";

export function ConfirmarPublicacao({
	viva,
	resultante,
	publicando,
	onConfirmar,
	onCancelar,
}: {
	viva: string;
	resultante: string;
	publicando: boolean;
	onConfirmar: () => void;
	onCancelar: () => void;
}) {
	const igual = viva === resultante;
	return (
		<div
			role="alertdialog"
			aria-label="Confirmar publicação"
			className="space-y-2 rounded border p-3"
		>
			<p className="text-sm font-medium">
				Publicar muda a conduta de TODAS as conversas deste ambiente. Confira a diferença:
			</p>
			{igual && <p className="text-xs">SEM DIFERENÇA: a conduta resultante é igual à viva.</p>}
			<div className="grid grid-cols-2 gap-2">
				<div>
					<h4 className="text-xs font-medium">Conduta viva (hoje)</h4>
					<pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">
						{viva}
					</pre>
				</div>
				<div>
					<h4 className="text-xs font-medium">Conduta resultante (após publicar)</h4>
					<pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">
						{resultante}
					</pre>
				</div>
			</div>
			<div className="flex gap-2">
				<Button size="sm" onClick={onConfirmar} disabled={publicando}>
					{publicando ? "Publicando…" : "Confirmar publicação"}
				</Button>
				<Button size="sm" variant="outline" onClick={onCancelar} disabled={publicando}>
					Cancelar
				</Button>
			</div>
		</div>
	);
}
