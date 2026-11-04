"use client";

import { Textarea } from "@/components/ui/textarea";
import { PARTES_NA_TELA, PARTES_PADRAO } from "@/lib/agent/prompt-do-vendedor";
import { CONTATO_TELEFONE_ANTES } from "@/lib/playground/compilar-perfil";
import { detectarPromessaDeContemplacao } from "@/lib/playground/detector-de-promessa";
import { ler, serializar } from "@/lib/playground/orientacao-em-partes";
import {
	AGRESSIVIDADES,
	type AtributosDoPerfil,
	type ContatoPreset,
	type ParteId,
	PROATIVIDADES,
	ROTULOS,
	TECNICIDADES,
	TONS,
} from "@/lib/playground/tipos";

export const LIMITE_POR_PARTE = 8000;

const ROTULO_DA_PARTE: Record<ParteId, string> = {
	abertura: "Abertura",
	descoberta: "Descoberta",
	contato: "Contato",
	"cartas-e-cards": "Cartas e cards",
	objecoes: "Objeções",
	"proposta-e-fechamento": "Proposta e fechamento",
	"atendimento-humano": "Atendimento humano",
};

const ROTULO_DO_CONTATO: Record<ContatoPreset, string> = {
	"carta-primeiro": "Carta primeiro, WhatsApp depois (padrão)",
	"telefone-antes": "WhatsApp antes da carta (só site)",
};

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
	const atual = ler(orientacao);
	const emitir = (parcial: Partial<typeof atual>) =>
		onOrientacao(serializar({ ...atual, ...parcial }));
	const textoPadrao = (id: ParteId) =>
		id === "contato" && atual.contato === "telefone-antes"
			? CONTATO_TELEFONE_ANTES
			: PARTES_PADRAO[id];

	function editar(id: ParteId, texto: string) {
		const partes = { ...atual.partes };
		if (texto === textoPadrao(id)) delete partes[id];
		else partes[id] = texto;
		emitir({ partes });
	}

	function restaurar(id: ParteId) {
		const partes = { ...atual.partes };
		delete partes[id];
		emitir({ partes });
	}

	const livreDet = detectarPromessaDeContemplacao(atual.livre);
	const livreErro = !livreDet.ok ? livreDet.motivo : null;

	return (
		<div className="space-y-4">
			<fieldset aria-label="Estilo geral" className="space-y-3 rounded-md border p-3">
				<legend className="px-1 text-sm font-semibold" aria-hidden="true">
					Estilo geral
				</legend>
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
			</fieldset>
			{PARTES_NA_TELA.map((id) => {
				const rotulo = ROTULO_DA_PARTE[id];
				const campo = `pg-parte-${id}`;
				const editada = atual.partes[id] !== undefined;
				const texto = atual.partes[id] ?? textoPadrao(id);
				const det = editada ? detectarPromessaDeContemplacao(texto) : { ok: true as const };
				const erro = !det.ok ? det.motivo : null;
				return (
					<fieldset key={id} aria-label={`Parte: ${rotulo}`} className="space-y-1">
						<div className="flex items-center justify-between gap-2">
							<label htmlFor={campo} className="text-sm font-medium">
								{rotulo}
							</label>
							<span className="text-xs font-medium">{editada ? "editada" : "padrão"}</span>
						</div>
						{id === "contato" && (
							<select
								aria-label="Preset de contato"
								className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
								value={atual.contato}
								onChange={(e) => emitir({ contato: e.target.value as ContatoPreset })}
							>
								{(Object.keys(ROTULO_DO_CONTATO) as ContatoPreset[]).map((c) => (
									<option key={c} value={c}>
										{ROTULO_DO_CONTATO[c]}
									</option>
								))}
							</select>
						)}
						<Textarea
							id={campo}
							rows={6}
							value={texto}
							aria-invalid={erro ? true : undefined}
							onChange={(e) => editar(id, e.target.value)}
						/>
						<div className="flex items-center justify-between gap-2 text-xs">
							<span role={erro ? "alert" : undefined} className={erro ? "font-medium" : "sr-only"}>
								{erro ? `ERRO: ${erro}` : "Parte sem erro."}
							</span>
							<span>
								{texto.length}/{LIMITE_POR_PARTE} caracteres
								{texto.length > LIMITE_POR_PARTE ? " — ACIMA DO LIMITE" : ""}
							</span>
						</div>
						<button
							type="button"
							className="rounded-md border px-2 py-1 text-xs"
							disabled={!editada}
							onClick={() => restaurar(id)}
						>
							Restaurar padrão da parte
						</button>
					</fieldset>
				);
			})}
			<div className="space-y-1">
				<label htmlFor="pg-orientacao" className="text-sm font-medium">
					Orientação adicional
				</label>
				<Textarea
					id="pg-orientacao"
					rows={4}
					value={atual.livre}
					aria-invalid={livreErro ? true : undefined}
					onChange={(e) => emitir({ livre: e.target.value })}
				/>
				<div className="flex justify-between gap-2 text-xs">
					<span
						role={livreErro || erroDoServidor ? "alert" : undefined}
						className={livreErro || erroDoServidor ? "font-medium" : "sr-only"}
					>
						{livreErro || erroDoServidor
							? `ERRO: ${livreErro ?? erroDoServidor}`
							: "Orientação sem erro."}
					</span>
					<span>
						{atual.livre.length}/{LIMITE_POR_PARTE} caracteres
						{atual.livre.length > LIMITE_POR_PARTE ? " — ACIMA DO LIMITE" : ""}
					</span>
				</div>
			</div>
		</div>
	);
}
