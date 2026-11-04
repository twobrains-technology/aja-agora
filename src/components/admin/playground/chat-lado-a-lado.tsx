"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { AjaUIMessage } from "@/lib/chat/ui-message";
import { detectarPromessaDeContemplacao } from "@/lib/playground/detector-de-promessa";
import type { AtributosDoPerfil } from "@/lib/playground/tipos";
import { aplicarEvento, estadoInicial, paraMensagem } from "./eventos-para-mensagem";
import { PainelDeConversa } from "./painel-de-conversa";

export type Modo = "antes" | "depois";

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

export interface EstadoDoTurno {
	texto: string;
	erro?: boolean;
	conversationId?: string;
}

/** Aplica uma linha NDJSON do servidor ao texto acumulado do turno. */
export function aplicarLinha(estado: EstadoDoTurno, linha: Record<string, unknown>): EstadoDoTurno {
	switch (linha.type) {
		case "inicio":
			return typeof linha.conversationId === "string"
				? { ...estado, conversationId: linha.conversationId }
				: estado;
		case "evento": {
			const ev = linha.evento as { type?: unknown; text?: unknown } | undefined;
			if (ev?.type === "text-delta" && typeof ev.text === "string") {
				return { ...estado, texto: estado.texto + ev.text };
			}
			if (ev?.type === "text-boundary" && estado.texto && !estado.texto.endsWith("\n\n")) {
				return { ...estado, texto: `${estado.texto}\n\n` };
			}
			return estado;
		}
		case "final": {
			const baloes = Array.isArray(linha.baloes) ? (linha.baloes as { texto?: unknown }[]) : [];
			const textos = baloes.map((b) => b.texto).filter((t): t is string => typeof t === "string");
			return {
				...estado,
				texto: textos.join("\n\n"),
				conversationId:
					typeof linha.conversationId === "string" ? linha.conversationId : estado.conversationId,
			};
		}
		case "erro":
			return {
				...estado,
				texto: typeof linha.error === "string" ? linha.error : "Erro",
				erro: true,
			};
		default:
			return estado;
	}
}

/** Lê o NDJSON de eventos; uma linha JSON por evento. */
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

export type FonteDeDados = "duble" | "bevi-dev";

export function ChatLadoALado({
	perfilId,
	atributos,
	orientacao,
	fonteDeDados: fonteInicial = "duble",
}: {
	perfilId: string | null;
	atributos: AtributosDoPerfil;
	orientacao: string;
	fonteDeDados?: FonteDeDados;
}) {
	const [fonte, setFonte] = useState<FonteDeDados>(fonteInicial);
	const [bolhas, setBolhas] = useState<Record<Modo, AjaUIMessage[]>>({ antes: [], depois: [] });
	const [texto, setTexto] = useState("");
	const [ocupado, setOcupado] = useState(false);
	const conversas = useRef<Record<Modo, string | undefined>>({
		antes: undefined,
		depois: undefined,
	});
	const contador = useRef(0);

	const anexar = (modo: Modo, fn: (b: AjaUIMessage[]) => AjaUIMessage[]) =>
		setBolhas((s) => ({ ...s, [modo]: fn(s[modo]) }));

	async function enviarUm(modo: Modo, mensagem: string) {
		const idResp = `v-${++contador.current}`;
		const fala = {
			id: `c-${++contador.current}`,
			role: "user",
			parts: [{ type: "text", text: mensagem }],
		} as unknown as AjaUIMessage;
		anexar(modo, (b) => [...b, fala]);
		let estado = estadoInicial(idResp);
		const mostrar = () => {
			const nova = paraMensagem(estado);
			anexar(modo, (b) =>
				b.some((x) => x.id === idResp) ? b.map((x) => (x.id === idResp ? nova : x)) : [...b, nova],
			);
		};
		const escrever = (t: string) => {
			estado = aplicarEvento(estado, { type: "erro", error: t });
			mostrar();
		};
		try {
			const resp = await fetch("/api/admin/playground/chat", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					perfilId: perfilId ?? undefined,
					atributos,
					orientacao,
					modo,
					fonteDeDados: fonte,
					conversationId: conversas.current[modo],
					mensagem,
				}),
			});
			if (!resp.ok) {
				const corpo = (await resp.json().catch(() => ({}))) as { error?: string; erro?: string };
				escrever(corpo.erro ?? corpo.error ?? `Falha ${resp.status}`);
				return;
			}
			await lerEventos(resp, (linha) => {
				estado = aplicarEvento(estado, linha);
				if (estado.conversationId) conversas.current[modo] = estado.conversationId;
				mostrar();
			});
		} catch (err) {
			escrever(err instanceof Error ? err.message : "Falha de rede");
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
				<span className="rounded border px-2 py-0.5 font-medium">
					{fonte === "duble" ? "Bevi: dublê" : "Bevi: dev (dados reais)"}
				</span>
				<label htmlFor="pg-fonte" className="font-medium">
					Fonte dos dados:
				</label>
				<select
					id="pg-fonte"
					className="rounded border bg-background px-1 py-0.5"
					value={fonte}
					disabled={ocupado}
					onChange={(e) => setFonte(e.target.value as FonteDeDados)}
				>
					<option value="duble">Dublê (padrão)</option>
					<option value="bevi-dev">Bevi dev</option>
				</select>
				<span>
					Duas respostas de modelo não provam diferença estatística; a medida é o relatório de
					comparação. Se a fala trouxer celular, o motor grava contato e lead de teste.
				</span>
			</div>
			<div className="flex gap-2">
				<PainelDeConversa modo="antes" mensagens={bolhas.antes} />
				<PainelDeConversa modo="depois" mensagens={bolhas.depois} />
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
