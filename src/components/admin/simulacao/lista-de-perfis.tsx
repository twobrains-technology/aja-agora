"use client";

import { Button } from "@/components/ui/button";
import {
	type EstadoDeExecucao,
	type PerfilDeCliente,
	type PerfilId,
	type ResultadoDoPerfil,
	ROTULO_DE_ESTADO,
	ROTULO_DE_VEREDITO,
} from "@/lib/playground/simulacao/tipos";

type Props = {
	perfis: readonly PerfilDeCliente[];
	estados: Partial<Record<PerfilId, EstadoDeExecucao>>;
	resultados: Partial<Record<PerfilId, ResultadoDoPerfil>>;
	selecionado: PerfilId | null;
	rodando: boolean;
	aoSelecionar: (id: PerfilId) => void;
	aoRodar: (id: PerfilId) => void;
	aoRodarTodos: () => void;
	aoCancelar: () => void;
};

export function ListaDePerfis(p: Props) {
	return (
		<section aria-label="Perfis de cliente" className="space-y-2">
			<div className="flex gap-2">
				<Button type="button" size="sm" disabled={p.rodando} onClick={p.aoRodarTodos}>
					Rodar todos
				</Button>
				<Button
					type="button"
					size="sm"
					variant="outline"
					disabled={!p.rodando}
					onClick={p.aoCancelar}
				>
					Cancelar
				</Button>
			</div>
			<ul className="space-y-1">
				{p.perfis.map((perfil) => {
					const estado = p.estados[perfil.id] ?? "NAO_EXECUTADO";
					const r = p.resultados[perfil.id];
					return (
						<li
							key={perfil.id}
							className={`rounded border p-2 text-sm ${p.selecionado === perfil.id ? "border-2" : ""}`}
						>
							<div className="flex items-center justify-between gap-2">
								<button
									type="button"
									className="text-left font-medium underline-offset-2 hover:underline"
									aria-pressed={p.selecionado === perfil.id}
									onClick={() => p.aoSelecionar(perfil.id)}
								>
									{perfil.rotulo}
								</button>
								<Button
									type="button"
									size="sm"
									variant="outline"
									disabled={p.rodando}
									aria-label={`Rodar este: ${perfil.rotulo}`}
									onClick={() => p.aoRodar(perfil.id)}
								>
									Rodar este
								</Button>
							</div>
							<div className="text-xs">
								Estado: {ROTULO_DE_ESTADO[estado]}
								{r ? ` · Veredito: ${ROTULO_DE_VEREDITO[r.veredito]}` : " · Veredito: —"}
							</div>
						</li>
					);
				})}
			</ul>
		</section>
	);
}
