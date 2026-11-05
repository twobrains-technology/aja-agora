"use client";

import { useState } from "react";
import {
	type Marcacao,
	type MarcacaoId,
	type ResultadoDoPerfil,
	ROTULO_DE_MARCACAO,
	ROTULO_DE_STATUS,
} from "@/lib/playground/simulacao/tipos";

const ORDEM: MarcacaoId[] = [
	"chegou-a-proposta",
	"pedido-repetido",
	"card-que-nao-apareceu",
	"resposta-cortada",
	"turno-sem-resposta",
	"numero-sem-ferramenta",
	"chamou-fila",
	"falou-prazo",
	"retomada-sem-novidade",
];

type Props = {
	resultados: ResultadoDoPerfil[];
	rotuloDoPerfil: (id: ResultadoDoPerfil["perfilId"]) => string;
};

/** Marcações × perfis. Toda célula diz o estado, a gravidade e os turnos em TEXTO. */
export function QuadroDeMarcacoes({ resultados, rotuloDoPerfil }: Props) {
	const [aberta, setAberta] = useState<{ perfil: string; marcacao: Marcacao } | null>(null);
	if (resultados.length === 0) {
		return <p className="text-muted-foreground text-sm">Rode um perfil para ver as marcações.</p>;
	}
	return (
		<div className="space-y-2">
			<table className="w-full border-collapse text-xs">
				<thead>
					<tr>
						<th className="border p-1 text-left">Marcação</th>
						{resultados.map((r) => (
							<th key={r.perfilId} className="border p-1 text-left">
								{rotuloDoPerfil(r.perfilId)}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{ORDEM.map((id) => (
						<tr key={id}>
							<th scope="row" className="border p-1 text-left font-medium">
								{ROTULO_DE_MARCACAO[id]}
							</th>
							{resultados.map((r) => {
								const m = r.marcacoes.find((x) => x.id === id);
								if (!m)
									return (
										<td key={r.perfilId} className="border p-1">
											—
										</td>
									);
								const turnos = m.ocorrencias.map((o) => o.turno + 1).join(", ");
								return (
									<td key={r.perfilId} className="border p-1 align-top">
										<button
											type="button"
											className="text-left underline-offset-2 hover:underline"
											aria-label={`${ROTULO_DE_MARCACAO[id]} em ${rotuloDoPerfil(r.perfilId)}: ver evidência`}
											onClick={() => setAberta({ perfil: rotuloDoPerfil(r.perfilId), marcacao: m })}
										>
											<span className="font-bold">{ROTULO_DE_STATUS[m.status]}</span>
											<span> · {m.gravidade}</span>
											{turnos ? <span> · turno {turnos}</span> : null}
										</button>
									</td>
								);
							})}
						</tr>
					))}
				</tbody>
			</table>
			{aberta ? (
				<section aria-label="Evidência" className="rounded border p-2 text-xs">
					<div className="font-medium">
						{ROTULO_DE_MARCACAO[aberta.marcacao.id]} · {aberta.perfil}
					</div>
					{aberta.marcacao.ocorrencias.length === 0 ? (
						<p>{aberta.marcacao.motivoNaoAplicavel ?? "Sem ocorrências."}</p>
					) : (
						<ul className="list-disc pl-4">
							{aberta.marcacao.ocorrencias.map((o) => (
								<li key={`${o.turno}-${o.evidencia}`}>
									Turno {o.turno + 1}: {o.evidencia}
								</li>
							))}
						</ul>
					)}
				</section>
			) : null}
		</div>
	);
}
