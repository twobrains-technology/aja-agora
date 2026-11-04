"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { detectarPromessaDeContemplacao } from "@/lib/playground/detector-de-promessa";
import { ler } from "@/lib/playground/orientacao-em-partes";
import type { AtributosDoPerfil } from "@/lib/playground/tipos";
import { ChatLadoALado } from "./chat-lado-a-lado";
import { ConfirmarPublicacao } from "./confirmar-publicacao";
import { EditorDePerfil } from "./editor-de-perfil";
import { HistoricoDeVersoes, type ItemDoHistorico } from "./historico-de-versoes";

interface ResumoDePerfil {
	id: string;
	nome: string;
}

const ATRIBUTOS_INICIAIS: AtributosDoPerfil = {
	agressividade: "equilibrada",
	proatividade: "media",
	tecnicidade: "neutro",
	tom: "neutro",
};

async function json<T>(
	url: string,
	init?: RequestInit,
): Promise<{ ok: boolean; status: number; corpo: T }> {
	const r = await fetch(url, init);
	const corpo = (await r.json().catch(() => ({}))) as T;
	return { ok: r.ok, status: r.status, corpo };
}

const msgDeErro = (c: unknown, padrao: string) => {
	const o = c as { erro?: string; error?: string; motivo?: string } | null;
	return o?.erro ?? o?.error ?? o?.motivo ?? padrao;
};

export function Playground() {
	const [perfis, setPerfis] = useState<ResumoDePerfil[]>([]);
	const [perfilId, setPerfilId] = useState<string | null>(null);
	const [nome, setNome] = useState("");
	const [atributos, setAtributos] = useState<AtributosDoPerfil>(ATRIBUTOS_INICIAIS);
	const [orientacao, setOrientacao] = useState("");
	const [versao, setVersao] = useState(0);
	const [historico, setHistorico] = useState<ItemDoHistorico[]>([]);
	const [aviso, setAviso] = useState<string | null>(null);
	const [erro, setErro] = useState<string | null>(null);
	const [previa, setPrevia] = useState<{ viva: string; resultante: string } | null>(null);
	const [publicando, setPublicando] = useState(false);

	const carregarLista = useCallback(async () => {
		const r = await json<{ perfis?: ResumoDePerfil[] } | ResumoDePerfil[]>(
			"/api/admin/playground/perfis",
		);
		if (!r.ok) return setErro(msgDeErro(r.corpo, "Falha ao listar perfis."));
		setPerfis(Array.isArray(r.corpo) ? r.corpo : (r.corpo.perfis ?? []));
	}, []);

	useEffect(() => {
		void carregarLista();
	}, [carregarLista]);

	async function escolher(id: string) {
		setErro(null);
		setAviso(null);
		setPrevia(null);
		if (!id) {
			setPerfilId(null);
			setNome("");
			setAtributos(ATRIBUTOS_INICIAIS);
			setOrientacao("");
			setVersao(0);
			setHistorico([]);
			return;
		}
		const r = await json<{
			perfil?: { nome: string; atributos: AtributosDoPerfil; orientacao: string; versao: number };
			nome?: string;
			atributos?: AtributosDoPerfil;
			orientacao?: string;
			versao?: number;
			historico?: ItemDoHistorico[];
		}>(`/api/admin/playground/perfis/${id}`);
		if (!r.ok) return setErro(msgDeErro(r.corpo, "Falha ao carregar o perfil."));
		const p = r.corpo.perfil ?? r.corpo;
		setPerfilId(id);
		setNome(p.nome ?? "");
		setAtributos(p.atributos ?? ATRIBUTOS_INICIAIS);
		setOrientacao(p.orientacao ?? "");
		setVersao(p.versao ?? 0);
		setHistorico(r.corpo.historico ?? []);
	}

	async function salvar() {
		setErro(null);
		setAviso(null);
		const em = ler(orientacao);
		for (const texto of [...Object.values(em.partes), em.livre]) {
			const det = detectarPromessaDeContemplacao(texto);
			if (!det.ok) return setErro(det.motivo);
		}
		const corpo = JSON.stringify({ nome, atributos, orientacao, versao });
		const cabecalho = { "Content-Type": "application/json" };
		if (!perfilId) {
			if (!nome.trim()) return setErro("Dê um nome ao perfil antes de salvar.");
			const r = await json<{ id?: string; perfil?: { id: string } }>(
				"/api/admin/playground/perfis",
				{
					method: "POST",
					headers: cabecalho,
					body: corpo,
				},
			);
			if (!r.ok) return setErro(msgDeErro(r.corpo, "Falha ao criar o perfil."));
			const novo = r.corpo.id ?? r.corpo.perfil?.id;
			await carregarLista();
			if (novo) await escolher(novo);
			return setAviso("Perfil criado.");
		}
		const r = await json<unknown>(`/api/admin/playground/perfis/${perfilId}`, {
			method: "PUT",
			headers: cabecalho,
			body: corpo,
		});
		if (r.status === 409)
			return setErro(
				"CONFLITO: outra pessoa salvou este perfil antes. Recarregue para ver a versão atual.",
			);
		if (!r.ok) return setErro(msgDeErro(r.corpo, "Falha ao salvar."));
		await escolher(perfilId);
		setAviso("Perfil salvo.");
	}

	async function pedirPublicacao() {
		if (!perfilId) return setErro("Salve o perfil antes de publicar.");
		setErro(null);
		const r = await json<{ viva: string; resultante: string }>(
			`/api/admin/playground/perfis/${perfilId}/previa`,
		);
		if (!r.ok) return setErro(msgDeErro(r.corpo, "Falha ao calcular a prévia."));
		setPrevia(r.corpo);
	}

	async function publicar() {
		if (!perfilId) return;
		setPublicando(true);
		const r = await json<{ caixaVersao?: number }>(
			`/api/admin/playground/perfis/${perfilId}/publicar`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ confirmar: true }),
			},
		);
		setPublicando(false);
		if (!r.ok) return setErro(msgDeErro(r.corpo, "Falha ao publicar."));
		setPrevia(null);
		await escolher(perfilId);
		setAviso(`Publicado: conduta versão ${r.corpo.caixaVersao ?? "?"}.`);
	}

	return (
		<div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
			<div className="space-y-3">
				<div className="space-y-1">
					<label htmlFor="pg-perfil" className="text-sm font-medium">
						Perfil
					</label>
					<select
						id="pg-perfil"
						className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
						value={perfilId ?? ""}
						onChange={(e) => void escolher(e.target.value)}
					>
						<option value="">Novo perfil (não salvo)</option>
						{perfis.map((p) => (
							<option key={p.id} value={p.id}>
								{p.nome}
							</option>
						))}
					</select>
				</div>
				<div className="space-y-1">
					<label htmlFor="pg-nome" className="text-sm font-medium">
						Nome do perfil
					</label>
					<input
						id="pg-nome"
						className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
						value={nome}
						onChange={(e) => setNome(e.target.value)}
					/>
				</div>
				<EditorDePerfil
					atributos={atributos}
					orientacao={orientacao}
					onAtributos={setAtributos}
					onOrientacao={setOrientacao}
					erroDoServidor={erro}
				/>
				{aviso && <output className="block text-sm font-medium">OK: {aviso}</output>}
				<div className="flex gap-2">
					<Button size="sm" onClick={() => void salvar()}>
						Salvar
					</Button>
					<Button
						size="sm"
						variant="outline"
						onClick={() => void pedirPublicacao()}
						disabled={!perfilId}
					>
						Publicar
					</Button>
				</div>
				{previa && (
					<ConfirmarPublicacao
						viva={previa.viva}
						resultante={previa.resultante}
						publicando={publicando}
						onConfirmar={() => void publicar()}
						onCancelar={() => setPrevia(null)}
					/>
				)}
				<HistoricoDeVersoes itens={historico} />
			</div>
			<ChatLadoALado perfilId={perfilId} atributos={atributos} orientacao={orientacao} />
		</div>
	);
}
