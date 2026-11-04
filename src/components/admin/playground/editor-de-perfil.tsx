"use client";

import { Textarea } from "@/components/ui/textarea";
import { detectarPromessaDeContemplacao } from "@/lib/playground/detector-de-promessa";
import {
	AGRESSIVIDADES,
	type AtributosDoPerfil,
	PROATIVIDADES,
	ROTULOS,
	TECNICIDADES,
	TONS,
} from "@/lib/playground/tipos";

export const LIMITE_DA_ORIENTACAO = 2000;

const CAMPOS = [
	{ chave: "agressividade", rotulo: "Agressividade comercial", opcoes: AGRESSIVIDADES },
	{ chave: "proatividade", rotulo: "Proatividade de follow-up", opcoes: PROATIVIDADES },
	{ chave: "tecnicidade", rotulo: "Tecnicidade", opcoes: TECNICIDADES },
	{ chave: "tom", rotulo: "Tom", opcoes: TONS },
] as const;

export function EditorDePerfil({
	atributos,
	orientacao,
	onAtributos,
	onOrientacao,
	erroDoServidor,
}: {
	atributos: AtributosDoPerfil;
	orientacao: string;
	onAtributos: (a: AtributosDoPerfil) => void;
	onOrientacao: (t: string) => void;
	erroDoServidor?: string | null;
}) {
	const detector = detectarPromessaDeContemplacao(orientacao);
	const erro = !detector.ok ? detector.motivo : (erroDoServidor ?? null);
	const acima = orientacao.length > LIMITE_DA_ORIENTACAO;

	return (
		<div className="space-y-3">
			{CAMPOS.map((c) => {
				const id = `pg-${c.chave}`;
				const rotulos = ROTULOS[c.chave] as Record<string, string>;
				return (
					<div key={c.chave} className="space-y-1">
						<label htmlFor={id} className="text-sm font-medium">
							{c.rotulo}
						</label>
						<select
							id={id}
							className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
							value={atributos[c.chave]}
							onChange={(e) => onAtributos({ ...atributos, [c.chave]: e.target.value })}
						>
							{(c.opcoes as readonly string[]).map((o) => (
								<option key={o} value={o}>
									{rotulos[o]}
								</option>
							))}
						</select>
					</div>
				);
			})}
			<div className="space-y-1">
				<label htmlFor="pg-orientacao" className="text-sm font-medium">
					Orientação em texto
				</label>
				<Textarea
					id="pg-orientacao"
					rows={6}
					value={orientacao}
					aria-invalid={erro ? true : undefined}
					aria-describedby="pg-orientacao-info"
					onChange={(e) => onOrientacao(e.target.value)}
				/>
				<div id="pg-orientacao-info" className="flex justify-between gap-2 text-xs">
					<span role={erro ? "alert" : undefined} className={erro ? "font-medium" : "sr-only"}>
						{erro ? `ERRO: ${erro}` : "Orientação sem erro."}
					</span>
					<span>
						{orientacao.length}/{LIMITE_DA_ORIENTACAO} caracteres
						{acima ? " — ACIMA DO LIMITE" : ""}
					</span>
				</div>
			</div>
		</div>
	);
}
