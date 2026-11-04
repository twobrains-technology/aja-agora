"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { detectarPromessaDeContemplacao } from "@/lib/playground/detector-de-promessa";
import type { AtributosDoPerfil } from "@/lib/playground/tipos";

export type Modo = "antes" | "depois";

export interface Bolha {
	id: string;
	autor: "cliente" | "vendedor";
	texto: string;
	erro?: boolean;
}

/** Roteiro fixo para comparar perfis sem digitar. Sem CPF; celular só o de teste. */
export const ROTEIRO_PADRAO: readonly string[] = [
	"Oi, quero saber sobre consórcio de carro.",
	"Uns 80 mil. E se eu não for contemplado?",
	"Isso não é melhor que financiamento?",
	"Demora muito pra sair?",
];

export const rotuloDeModo: Record<Modo, string> = {
	antes: "Antes (conduta viva)",
	depois: "Depois (perfil em edição)",
};

export function temPromessa(texto: string): boolean {
	return !detectarPromessaDeContemplacao(texto).ok;
}

/** Lê o NDJSON de eventos; tolerante a nomes de campo (texto/delta/conversationId). */
export async function lerEventos(
	resp: Response,
	aoEvento: (e: Record<string, unknown>) => void,
): Promise<void> {
	if (!resp.body) return;
	const leitor = resp.body.getReader();
	const dec = new TextDecoder();
	let resto = "";
	for (;;) {
		const { done, value } = await leitor.read();
		if (done) break;
		resto += dec.decode(value, { stream: true });
		const linhas = resto.split("\n");
		resto = linhas.pop() ?? "";
		for (const l of linhas) {
			if (!l.trim()) continue;
			try {
				aoEvento(JSON.parse(l) as Record<string, unknown>);
			} catch {
				// linha truncada: ignora
			}
		}
	}
	if (resto.trim()) {
		try {
			aoEvento(JSON.parse(resto) as Record<string, unknown>);
		} catch {
			// ignora
		}
	}
}

function PainelDeChat({ modo, bolhas }: { modo: Modo; bolhas: Bolha[] }) {
	return (
		<section
			aria-label={`Conversa ${rotuloDeModo[modo]}`}
			className="flex-1 min-w-0 rounded border"
		>
			<h3 className="border-b px-2 py-1 text-sm font-medium">{rotuloDeModo[modo]}</h3>
			<ul className="min-h-64 space-y-2 p-2">
				{bolhas.map((b) => (
					<li key={b.id} className="rounded border px-2 py-1 text-sm">
						<div className="text-xs font-medium">
							{b.autor === "cliente" ? "Cliente" : "Vendedor"}
							{b.erro ? " · ERRO" : ""}
						</div>
						{b.autor === "vendedor" && temPromessa(b.texto) && (
							<div className="text-xs font-bold">PROMESSA DE CONTEMPLAÇÃO</div>
						)}
						<div className="whitespace-pre-wrap">{b.texto}</div>
					</li>
				))}
			</ul>
		</section>
	);
}

export function ChatLadoALado({
	perfilId,
	atributos,
	orientacao,
}: {
	perfilId: string | null;
	atributos: AtributosDoPerfil;
	orientacao: string;
}) {
	const [bolhas, setBolhas] = useState<Record<Modo, Bolha[]>>({ antes: [], depois: [] });
	const [texto, setTexto] = useState("");
	const [ocupado, setOcupado] = useState(false);
	const conversas = useRef<Record<Modo, string | undefined>>({
		antes: undefined,
		depois: undefined,
	});
	const contador = useRef(0);

	const anexar = (modo: Modo, fn: (b: Bolha[]) => Bolha[]) =>
		setBolhas((s) => ({ ...s, [modo]: fn(s[modo]) }));

	async function enviarUm(modo: Modo, mensagem: string) {
		const idResp = `v-${++contador.current}`;
		anexar(modo, (b) => [
			...b,
			{ id: `c-${++contador.current}`, autor: "cliente", texto: mensagem },
		]);
		anexar(modo, (b) => [...b, { id: idResp, autor: "vendedor", texto: "" }]);
		const escrever = (t: string, erro = false) =>
			anexar(modo, (b) => b.map((x) => (x.id === idResp ? { ...x, texto: t, erro } : x)));
		try {
			const resp = await fetch("/api/admin/playground/chat", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					perfilId: perfilId ?? undefined,
					atributos,
					orientacao,
					modo,
					conversationId: conversas.current[modo],
					mensagem,
				}),
			});
			if (!resp.ok) {
				const corpo = (await resp.json().catch(() => ({}))) as { error?: string; erro?: string };
				escrever(corpo.erro ?? corpo.error ?? `Falha ${resp.status}`, true);
				return;
			}
			let acumulado = "";
			await lerEventos(resp, (e) => {
				if (typeof e.conversationId === "string") conversas.current[modo] = e.conversationId;
				const parte =
					typeof e.texto === "string" ? e.texto : typeof e.delta === "string" ? e.delta : null;
				if (parte) {
					acumulado += parte;
					escrever(acumulado);
				}
				if (typeof e.erro === "string") escrever(e.erro, true);
			});
		} catch (err) {
			escrever(err instanceof Error ? err.message : "Falha de rede", true);
		}
	}

	async function enviar(mensagem: string) {
		if (!mensagem.trim() || ocupado) return;
		setOcupado(true);
		await Promise.all([enviarUm("antes", mensagem), enviarUm("depois", mensagem)]);
		setOcupado(false);
	}

	async function reproduzir() {
		if (ocupado) return;
		setOcupado(true);
		for (const fala of ROTEIRO_PADRAO) {
			await Promise.all([enviarUm("antes", fala), enviarUm("depois", fala)]);
		}
		setOcupado(false);
	}

	function reiniciar() {
		conversas.current = { antes: undefined, depois: undefined };
		setBolhas({ antes: [], depois: [] });
	}

	return (
		<div className="space-y-2">
			<div className="flex flex-wrap items-center gap-2 text-xs">
				<span className="rounded border px-2 py-0.5 font-medium">Bevi: dublê</span>
				<span>
					Duas respostas de modelo não provam diferença estatística; a medida é o relatório de
					comparação. Se a fala trouxer celular, o motor grava contato e lead de teste.
				</span>
			</div>
			<div className="flex gap-2">
				<PainelDeChat modo="antes" bolhas={bolhas.antes} />
				<PainelDeChat modo="depois" bolhas={bolhas.depois} />
			</div>
			<form
				className="flex gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					const m = texto;
					setTexto("");
					void enviar(m);
				}}
			>
				<label htmlFor="pg-fala" className="sr-only">
					Fala do cliente (enviada às duas conversas)
				</label>
				<input
					id="pg-fala"
					className="flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
					placeholder="Fala do cliente — vai para Antes e Depois"
					value={texto}
					onChange={(e) => setTexto(e.target.value)}
				/>
				<Button type="submit" size="sm" disabled={ocupado || !texto.trim()}>
					{ocupado ? "Aguardando…" : "Enviar às duas"}
				</Button>
				<Button type="button" size="sm" variant="outline" onClick={reiniciar} disabled={ocupado}>
					Reiniciar conversa
				</Button>
				<Button type="button" size="sm" variant="outline" onClick={reproduzir} disabled={ocupado}>
					Reproduzir roteiro
				</Button>
			</form>
		</div>
	);
}
