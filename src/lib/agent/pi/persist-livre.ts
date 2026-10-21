// PERSISTÊNCIA DO VENDEDOR LIVRE — o mínimo que é FATO, sem gate.
//
// O que sobrevive (e por quê):
//  · mensagens: é a conversa no admin, na retomada e no histórico do próximo turno;
//  · marcador de card (`registrarCardEnviado`): prova que a cota foi mostrada —
//    sem ele a escolha do cliente não é validável depois;
//  · `persistMeta` ANTES do artifact sair: o adapter relê a meta fresca do banco
//    no handler do card;
//  · nome do contato: o kanban e a mesa leem daqui;
//  · `uso_de_ia`: o livro-caixa de token do turno.
//
// O que saiu: `pendingGate`, `desireAsked`, `conduziu`, lead-stage por gate —
// tudo isso é instrumento do funil que este motor não tem mais.

import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import { passaFinal } from "@/lib/agent/orchestrator/vazamento";
import type { EstadoDoTurno } from "@/lib/agent/turn/estado";
import { projectToMeta } from "@/lib/agent/turn/projecao";
import { sincronizarNomeDoContato } from "@/lib/contacts/sincronizar-nome";
import { registrarCardEnviado } from "@/lib/conversation/cards";
import { saveMessage } from "@/lib/conversation/messages";
import { persistMeta } from "@/lib/conversation/meta";

/** Fala do cliente que não é digitada por ele (diretiva de servidor). */
function pareceDirectiveDeServidor(texto: string): boolean {
	if (texto.length < 400) return false;
	return /\bFLUXO\b|\bFIX-\d+|NÃO chame|tool-call/i.test(texto);
}

export async function persistirTurnoLivre(args: {
	estado: EstadoDoTurno;
	persona?: string | null;
}): Promise<void> {
	const { estado, persona = null } = args;
	const { conversationId, channel, isUserTurn, userText, events } = estado;

	// 1. Fala do cliente — nunca um prompt de servidor no lugar dela.
	if (isUserTurn && userText && !pareceDirectiveDeServidor(userText)) {
		await saveMessage(conversationId, "user", userText, channel);
	}

	// 2. A fala do modelo, um balão por `text-boundary` (o turno pode ter mais de
	// um: fala → card → fala).
	const baloes: string[] = [""];
	for (const ev of events) {
		if (ev.type === "text-boundary") baloes.push("");
		else if (ev.type === "text-delta") baloes[baloes.length - 1] += ev.text;
	}
	for (const texto of baloes) {
		// Último passe: máquina (JSON de argumento, nome de tool) não vira balão.
		const limpo = passaFinal(texto);
		if (limpo.trim().length > 0) {
			await saveMessage(conversationId, "assistant", limpo, channel, persona);
		}
	}

	// 3. Meta ANTES dos cards (o adapter relê do banco ao abrir o artifact).
	const meta = projectToMeta(estado);
	await persistMeta(conversationId, meta);

	if (estado.contactName) {
		await sincronizarNomeDoContato({ conversationId, nome: estado.contactName }).catch(
			(erro: unknown) => {
				console.error("[persist-livre] nome do contato não sincronizado (ignorado):", erro);
			},
		);
	}

	// 4. Cada artifact vira marcador — e só depois sai para o chamador.
	for (const ev of events) {
		if (ev.type !== "artifact") continue;
		await registrarCardEnviado({
			conversationId,
			tipo: ev.artifactType,
			payload: ev.payload,
			channel,
			personaId: persona,
		});
	}
}

/** Drena os eventos não-streamados (artifact/handoff) depois da persistência. */
export function eventosDeSaida(events: readonly TurnEvent[]): TurnEvent[] {
	return events.filter((ev) => ev.type === "artifact" || ev.type === "handoff");
}
