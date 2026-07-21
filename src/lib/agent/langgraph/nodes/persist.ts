// Nó `persist` — ÚLTIMO nó do grafo. Escreve `messages`/`artifacts`/`meta`
// no shape que a UI/admin/mesa leem — reusa `saveMessage`/`persistMeta`
// tal-e-qual o runtime Vercel (mesmas tabelas, mesmo formato de linha).
//
// ORDEM importa (fix MÉDIA-7 do crítico): `persistMeta` roda ANTES de
// qualquer evento "gate"/"artifact" ser DRENADO pro chamador — os dois
// channel adapters fazem `reloadMeta(conversationId)` fresco do banco no
// handler de "gate" (web/adapter.ts:308), então a escrita tem que existir
// antes do evento sair. Por isso NENHUM nó anterior a este (`discovery`,
// `emitCard`) empurra "artifact"/"gate" via `config.writer` — só
// `text-delta`/`tool-call` (sem dependência de leitura fresca do banco)
// streamam ao vivo. `run-turn.ts` drena os demais tipos de
// `state.events` do ESTADO FINAL do grafo (depois deste nó já ter rodado),
// nunca do stream ao vivo — garantia por TOPOLOGIA, não por timing.
import { artifacts as artifactsTable } from "@/db/schema";
import { db } from "@/db";
import { saveMessage } from "@/lib/conversation/messages";
import { persistMeta } from "@/lib/conversation/meta";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import { simulatorNow } from "@/lib/utils/simulator-clock";
import { projectToMeta } from "../emit";
import type { AgentGraphStateType } from "../state";

export async function persistNode(
	state: AgentGraphStateType,
): Promise<Partial<AgentGraphStateType>> {
	const { conversationId, channel, funnel, isUserTurn, userText } = state;
	const persona = funnel.currentPersona;

	// Salva o turno do usuário e a fala completa do modelo (reconstruída dos
	// text-delta acumulados por `converse` — mesma reconstrução que
	// `runner.ts` faz com `fullResponse`) ANTES dos cards, espelhando a ordem
	// de leitura da UI (texto, depois artifact).
	if (isUserTurn && userText) {
		await saveMessage(conversationId, "user", userText, channel);
	}
	const assistantText = state.events
		.filter((ev): ev is Extract<TurnEvent, { type: "text-delta" }> => ev.type === "text-delta")
		.map((ev) => ev.text)
		.join("");
	if (assistantText.trim().length > 0) {
		await saveMessage(conversationId, "assistant", assistantText, channel, persona);
	}

	for (const ev of state.events) {
		if (ev.type !== "artifact") continue;
		// Mesmo padrão de `emitServerCard` (orchestrator/index.ts): 1 message
		// marcador `[card: tipo]` por artifact, pra o log do admin nunca perder
		// o turno mesmo quando não há texto (BUG-ADMIN-MESSAGE-MISSING).
		const messageId = await saveMessage(
			conversationId,
			"assistant",
			`[card: ${ev.artifactType}]`,
			channel,
			persona,
		);
		await db.insert(artifactsTable).values({
			messageId,
			type: ev.artifactType,
			payload: ev.payload,
			createdAt: simulatorNow(),
		});
	}

	const meta = projectToMeta(state);
	await persistMeta(conversationId, meta);

	const events: TurnEvent[] = [];
	// Proxy determinístico de `lead-stage` (TODO rodada-1: paridade fina com
	// `LEAD_STAGE_BY_TOOL`, runner.ts — hoje disparado por tool específica, não
	// por transição de funil). `recordStageReached` (chamado pelos adapters,
	// intactos) é forward-only e idempotente — reemitir a cada turno é seguro.
	if (funnel.desireAsked) events.push({ type: "lead-stage", stage: "engajado" });
	if (funnel.identityCollected) events.push({ type: "lead-stage", stage: "qualificado" });
	events.push({ type: "meta-update", meta });
	events.push({ type: "finish", reason: "ok" });

	return { events };
}
