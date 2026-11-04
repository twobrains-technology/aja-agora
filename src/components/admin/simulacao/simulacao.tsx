"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { numerosDoCatalogo } from "@/lib/playground/dubles/catalogos";
import { PERFIS_DE_CLIENTE, perfilPorId } from "@/lib/playground/simulacao/perfis-de-cliente";
import {
	montarExportacao,
	nomeDoArquivoDeExportacao,
	serializarExportacao,
} from "@/lib/playground/simulacao/relatorio";
import {
	ACHADO_FINISH_REASON,
	type DepsDaSimulacao,
	type OpcoesDaSimulacao,
	PADRAO_DO_SERVIDOR,
	rodarSimulacao,
} from "@/lib/playground/simulacao/rodar-simulacao";
import type {
	DadosDaSimulacao,
	EstadoDeExecucao,
	PerfilId,
	RespostaDeFalaDoCliente,
	ResultadoDoPerfil,
	TurnoDaSimulacao,
} from "@/lib/playground/simulacao/tipos";
import { ListaDePerfis } from "./lista-de-perfis";
import { QuadroDeMarcacoes } from "./quadro-de-marcacoes";
import { rotuloDaFonte, SeletorDeDados } from "./seletor-de-dados";
import { Transcricao } from "./transcricao";

const ROTA_DO_CHAT = "/api/admin/playground/chat";
const ROTA_DO_CLIENTE = "/api/admin/playground/simulacao/cliente";

export function depsDoNavegador(): DepsDaSimulacao {
	return {
		chamarChat: (corpo, sinal) =>
			fetch(ROTA_DO_CHAT, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(corpo),
				signal: sinal,
			}),
		falaDoCliente: async (pedido) => {
			const resp = await fetch(ROTA_DO_CLIENTE, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(pedido),
			});
			if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
			return (await resp.json()) as RespostaDeFalaDoCliente;
		},
		numerosConhecidos: numerosDoCatalogo,
	};
}

function baixar(nome: string, conteudo: string) {
	const url = URL.createObjectURL(new Blob([conteudo], { type: "application/json" }));
	const a = document.createElement("a");
	a.href = url;
	a.download = nome;
	a.click();
	URL.revokeObjectURL(url);
}

export function Simulacao() {
	const [dadosEscolhidos, setDadosEscolhidos] = useState<DadosDaSimulacao | null>(null);
	const [estados, setEstados] = useState<Partial<Record<PerfilId, EstadoDeExecucao>>>({});
	const [resultados, setResultados] = useState<Partial<Record<PerfilId, ResultadoDoPerfil>>>({});
	const [vivos, setVivos] = useState<Partial<Record<PerfilId, TurnoDaSimulacao[]>>>({});
	const [selecionado, setSelecionado] = useState<PerfilId | null>(null);
	const [rodando, setRodando] = useState(false);
	const controlador = useRef<AbortController | null>(null);

	async function executar(ids: PerfilId[]) {
		const ac = new AbortController();
		controlador.current = ac;
		setRodando(true);
		const deps = depsDoNavegador();
		for (const id of ids) {
			if (ac.signal.aborted) break;
			const perfil = perfilPorId(id);
			setSelecionado(id);
			setVivos((v) => ({ ...v, [id]: [] }));
			const opcoes: OpcoesDaSimulacao = {
				perfil,
				dados: dadosEscolhidos ?? perfil.dados,
				modo: "antes",
				sinal: ac.signal,
				aoEstado: (e) => setEstados((s) => ({ ...s, [id]: e })),
				aoTurno: (t) => setVivos((v) => ({ ...v, [id]: [...(v[id] ?? []), t] })),
			};
			const r = await rodarSimulacao(opcoes, deps);
			setResultados((s) => ({ ...s, [id]: r }));
		}
		setRodando(false);
	}

	const lista = PERFIS_DE_CLIENTE.map((p) => resultados[p.id]).filter(
		(r): r is ResultadoDoPerfil => r !== undefined,
	);
	const fonteAtual = (dadosEscolhidos ?? PADRAO_DO_SERVIDOR).fonteDeDados;
	const achados = [...new Set([ACHADO_FINISH_REASON, ...lista.flatMap((r) => r.achados)])];
	const turnosDaTela = selecionado
		? (vivos[selecionado] ?? resultados[selecionado]?.turnos ?? [])
		: [];
	const rotuloDoPerfil = (id: PerfilId) => perfilPorId(id).rotulo;

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<span className="text-sm font-medium">
					{rotuloDaFonte(fonteAtual)}
					{dadosEscolhidos ? "" : " (padrão de cada perfil)"}
				</span>
				<Link href="/admin/playground" className="text-sm underline">
					Voltar ao playground
				</Link>
			</div>

			<div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
				<div className="space-y-3">
					<SeletorDeDados
						valor={dadosEscolhidos ?? PADRAO_DO_SERVIDOR}
						aoMudar={setDadosEscolhidos}
						desabilitado={rodando}
					/>
					{dadosEscolhidos ? (
						<Button
							type="button"
							size="sm"
							variant="outline"
							disabled={rodando}
							onClick={() => setDadosEscolhidos(null)}
						>
							Usar o padrão de cada perfil
						</Button>
					) : null}
					<ListaDePerfis
						perfis={PERFIS_DE_CLIENTE}
						estados={estados}
						resultados={resultados}
						selecionado={selecionado}
						rodando={rodando}
						aoSelecionar={setSelecionado}
						aoRodar={(id) => void executar([id])}
						aoRodarTodos={() => void executar(PERFIS_DE_CLIENTE.map((p) => p.id))}
						aoCancelar={() => controlador.current?.abort()}
					/>
				</div>
				<div className="space-y-4">
					<Transcricao turnos={turnosDaTela} />
					<QuadroDeMarcacoes resultados={lista} rotuloDoPerfil={rotuloDoPerfil} />
				</div>
			</div>

			<footer className="space-y-2 border-t pt-3">
				<Button
					type="button"
					size="sm"
					variant="outline"
					disabled={lista.length === 0}
					onClick={() => {
						const agora = new Date();
						baixar(
							nomeDoArquivoDeExportacao(agora),
							serializarExportacao(montarExportacao(lista, agora)),
						);
					}}
				>
					Exportar JSON
				</Button>
				<ul className="text-muted-foreground list-disc pl-4 text-xs">
					{achados.map((a) => (
						<li key={a}>{a}</li>
					))}
				</ul>
			</footer>
		</div>
	);
}
