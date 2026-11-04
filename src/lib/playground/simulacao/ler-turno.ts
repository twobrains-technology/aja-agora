// Leitor do NDJSON do chat do playground (`/api/admin/playground/chat`) para a simulação.
// Cópia própria da lógica de `lerEventos`/`aplicarLinha` de `chat-lado-a-lado.tsx`: a simulação
// não importa a tela da F3. Client-safe: sem DB, sem `server-only`.
//
// Linhas que o servidor emite: `inicio` (conversationId, dados?, caixaVersao?), `evento`
// ({type: text-delta | text-boundary | tool-call | artifact | finish}), `final` (baloes) e `erro`.

import type { ArtifactLido, BalaoFinal, DadosDaSimulacao, ToolCallLido, TurnoLido } from "./tipos";

export function turnoVazio(httpStatus = 200): TurnoLido {
	return {
		conversationId: null,
		dadosEcoados: null,
		caixaVersao: null,
		textoDosEventos: [],
		baloesFinais: [],
		toolCalls: [],
		artifacts: [],
		finish: null,
		erro: null,
		finalRecebido: false,
		linhasInvalidas: 0,
		httpStatus,
	};
}

function ehObjeto(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function dadosDoEco(v: unknown): DadosDaSimulacao | null {
	if (!ehObjeto(v)) return null;
	const fila = v.fila;
	if (v.fonteDeDados !== "duble" && v.fonteDeDados !== "bevi-dev") return null;
	if (typeof v.catalogo !== "string") return null;
	if (!ehObjeto(fila) || typeof fila.atendentes !== "number") return null;
	return v as unknown as DadosDaSimulacao;
}

/**
 * Aplica uma linha ao estado. `textoDosEventos` mantém o balão aberto como ÚLTIMO item (pode ser
 * "" logo depois de um `text-boundary`); `lerTurno` descarta os vazios ao final.
 */
export function aplicarLinhaNdjson(estado: TurnoLido, linha: Record<string, unknown>): TurnoLido {
	switch (linha.type) {
		case "inicio": {
			const eco = dadosDoEco(linha.dados);
			const versao = linha.caixaVersao;
			return {
				...estado,
				conversationId:
					typeof linha.conversationId === "string" ? linha.conversationId : estado.conversationId,
				dadosEcoados: eco ?? estado.dadosEcoados,
				caixaVersao:
					typeof versao === "string" || typeof versao === "number" ? versao : estado.caixaVersao,
			};
		}
		case "evento": {
			const ev = linha.evento;
			if (!ehObjeto(ev)) return estado;
			if (ev.type === "text-delta" && typeof ev.text === "string") {
				const textos = [...estado.textoDosEventos];
				if (textos.length === 0) textos.push(ev.text);
				else textos[textos.length - 1] += ev.text;
				return { ...estado, textoDosEventos: textos };
			}
			if (ev.type === "text-boundary") {
				const ultimo = estado.textoDosEventos[estado.textoDosEventos.length - 1];
				if (!ultimo) return estado; // sem balão aberto: no-op
				return { ...estado, textoDosEventos: [...estado.textoDosEventos, ""] };
			}
			if (ev.type === "tool-call" && typeof ev.toolName === "string") {
				const chamada: ToolCallLido = {
					toolName: ev.toolName,
					input: ev.input,
					toolCallId: typeof ev.toolCallId === "string" ? ev.toolCallId : "",
				};
				return { ...estado, toolCalls: [...estado.toolCalls, chamada] };
			}
			if (ev.type === "artifact" && typeof ev.artifactType === "string") {
				const artifact: ArtifactLido = {
					artifactType: ev.artifactType,
					payload: ehObjeto(ev.payload) ? ev.payload : {},
					toolCallId: typeof ev.toolCallId === "string" ? ev.toolCallId : "",
				};
				return { ...estado, artifacts: [...estado.artifacts, artifact] };
			}
			if (ev.type === "finish") {
				return { ...estado, finish: { reason: typeof ev.reason === "string" ? ev.reason : "" } };
			}
			return estado;
		}
		case "final": {
			const brutos = Array.isArray(linha.baloes) ? linha.baloes : [];
			const baloes: BalaoFinal[] = [];
			for (const b of brutos) {
				if (!ehObjeto(b) || typeof b.texto !== "string") continue;
				const p = b.promessa;
				baloes.push({
					texto: b.texto,
					promessa:
						ehObjeto(p) && typeof p.rotulo === "string" && typeof p.motivo === "string"
							? { rotulo: p.rotulo, motivo: p.motivo }
							: null,
				});
			}
			return {
				...estado,
				baloesFinais: baloes,
				finalRecebido: true,
				conversationId:
					typeof linha.conversationId === "string" ? linha.conversationId : estado.conversationId,
			};
		}
		case "erro":
			return { ...estado, erro: typeof linha.error === "string" ? linha.error : "Erro" };
		default:
			return estado;
	}
}

function fechar(estado: TurnoLido): TurnoLido {
	return { ...estado, textoDosEventos: estado.textoDosEventos.filter((t) => t.trim() !== "") };
}

/** Lê a resposta inteira. Nunca lança: falha vira `erro` no `TurnoLido`. */
export async function lerTurno(resp: Response): Promise<TurnoLido> {
	let estado = turnoVazio(resp.status);
	if (!resp.ok) {
		return { ...estado, erro: `HTTP ${resp.status}` };
	}
	if (!resp.body) return { ...estado, erro: "Resposta sem corpo" };

	const leitor = resp.body.getReader();
	const dec = new TextDecoder();
	let resto = "";

	const processar = (texto: string) => {
		if (!texto.trim()) return;
		try {
			const linha: unknown = JSON.parse(texto);
			if (ehObjeto(linha)) estado = aplicarLinhaNdjson(estado, linha);
			else estado = { ...estado, linhasInvalidas: estado.linhasInvalidas + 1 };
		} catch {
			estado = { ...estado, linhasInvalidas: estado.linhasInvalidas + 1 };
		}
	};

	try {
		for (;;) {
			const { done, value } = await leitor.read();
			if (done) break;
			resto += dec.decode(value, { stream: true });
			const linhas = resto.split("\n");
			resto = linhas.pop() ?? "";
			for (const l of linhas) processar(l);
		}
		resto += dec.decode();
		processar(resto);
	} catch (err) {
		estado = {
			...estado,
			erro: estado.erro ?? (err instanceof Error ? err.message : "Falha de rede"),
		};
	}
	return fechar(estado);
}
