// CAMADA 1 — cenário de conversa determinístico.
//
// Roda o grafo LangGraph DE VERDADE (capture → analyze → route → advance →
// discovery? → converse → emitCard → persist), contra o Postgres de verdade,
// com as DUAS fronteiras LLM trocadas por roteiro: o modelo que fala
// (`ScriptedChatModel`) e o analyzer (Haiku).
//
// O que se asserta aqui é a TRAJETÓRIA — quais artifacts saíram, em que ordem,
// qual gate ficou ativo, como o funil mudou —, NUNCA o texto que o modelo
// produziu. Travar prosa é exatamente o que o CLAUDE.md deste projeto proíbe
// ("conversa é do modelo"); travar ordem de card é invariante de produto e
// pertence ao código. O bug do card de recomendação entalado entre a pergunta
// e os chips de resposta é um erro de ORDEM — e é por isso que ele cabe aqui.

import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { artifacts, conversations, messages } from "@/db/schema";
import type { AnalyzeResult } from "@/lib/agent/orchestrator/analyze";
import type { Channel, TurnEvent } from "@/lib/agent/orchestrator/types";
import type { ConversationMetadata } from "@/lib/agent/personas";
import type { UserIntent } from "@/lib/agent/qualify-state";
import type { BuscaGrupos } from "../nodes/discovery";
import { createRunTurnLangGraph } from "../run-turn";
import { type ScriptedBeat, ScriptedChatModel } from "./scripted-model";

/** Um turno do cenário: o que o cliente diz, o que o analyzer extrai disso e o
 * que o modelo responde. */
export type ScenarioTurn = {
	/** Fala do cliente (ou o rótulo do chip que ele clicou). */
	user: string;
	/** Beats do modelo NESTE turno (um por chamada de `.stream()`). */
	beats: ScriptedBeat[];
	/** O que o analyzer "extraiu" — muta o meta, igual `analyzeAndMerge` faz. */
	extrai?: (meta: ConversationMetadata) => void;
	/** Intent classificado do turno. Default: "neutral". */
	intent?: UserIntent;
	/** `false` = turno de SERVIDOR (directive), não fala do cliente. Vários
	 * guards (`reveal-loop`, entre outros) só se aplicam a turno de usuário, e
	 * o reveal costuma entrar por directive — sem poder alternar isso, um
	 * cenário nunca reproduz o que acontece no turno da busca. Default: true. */
	isUserTurn?: boolean;
};

export type TurnOutcome = {
	user: string;
	events: TurnEvent[];
	/** Só os tipos de artifact, na ordem — a asserção mais usada. */
	artifacts: string[];
	/** A trajetória legível: artifacts e gates na ordem em que o cliente os vê,
	 * com `text` colapsando a fala do modelo num único marcador. */
	trilha: string[];
};

export type ScenarioResult = {
	conversationId: string;
	turns: TurnOutcome[];
	/** Metadata final persistida — o estado do funil ao fim do cenário. */
	meta: ConversationMetadata;
};

/** Analyzer determinístico: não chama rede, aplica o que o turno declarou. */
function analyzerDoRoteiro(turnos: ScenarioTurn[], cursor: { i: number }) {
	return async (
		_text: string,
		_persona: unknown,
		meta: ConversationMetadata,
		_ultimaFala?: string | null,
	): Promise<AnalyzeResult> => {
		const turno = turnos[cursor.i];
		const experienciaAntes = meta.experiencePrev;
		turno?.extrai?.(meta);
		return {
			analysis: { userIntent: turno?.intent ?? "neutral" },
			metaChanged: true,
			newlyExtractedExperience:
				meta.experiencePrev !== experienciaAntes ? (meta.experiencePrev ?? null) : null,
			stuckGateDefaultApplied: null,
			// biome-ignore lint/suspicious/noExplicitAny: `TurnAnalysis` tem ~20 campos
			// opcionais que nenhum cenário precisa declarar; o que importa é o intent
			// e o que `extrai` escreveu no meta.
		} as any;
	};
}

/**
 * Executa o cenário e devolve a trajetória de cada turno.
 *
 * `metaInicial` posiciona a conversa direto no ponto do funil que se quer
 * testar — sem isso, todo cenário teria que reencenar a jornada inteira desde
 * o "oi" pra chegar no gate de interesse, e o teste viraria uma novela frágil.
 */
export async function runScenario(opts: {
	turns: ScenarioTurn[];
	metaInicial?: Partial<ConversationMetadata>;
	channel?: Channel;
	contactName?: string | null;
	/** Resultado da busca na Bevi. Sem isto o cenário chamaria a rede de verdade
	 * — e não daria pra exercitar "voltou vazia", que é o caminho de falha mais
	 * importante do reveal. */
	busca?: BuscaGrupos;
}): Promise<ScenarioResult> {
	const channel = opts.channel ?? "web";
	const cursor = { i: 0 };
	// `null` EXPLÍCITO tem que sobreviver: é o estado "ainda não sei o nome", que
	// é o que faz `nextGate` devolver o gate `name`. Com `??` o null virava um
	// nome default e o primeiro gate do funil ficava impossível de testar.
	const contactName = "contactName" in opts ? (opts.contactName ?? null) : "Cliente Cenário";

	const [conv] = await db
		.insert(conversations)
		.values({
			channel,
			status: "active",
			contactName,
			metadata: (opts.metaInicial ?? {}) as Record<string, unknown>,
		})
		.returning({ id: conversations.id });

	// UM modelo pro cenário inteiro: os beats de todos os turnos numa fila só.
	// O `converse` chama `.stream()` um número variável de vezes por turno
	// (loop de tool-call, dois beats no reveal), então numerar por turno seria
	// uma aposta — a fila única deixa o roteiro ser exatamente o que se lê.
	const model = new ScriptedChatModel({
		beats: opts.turns.flatMap((t) => t.beats),
	});

	const runTurn = createRunTurnLangGraph({
		model,
		analyze: analyzerDoRoteiro(opts.turns, cursor) as never,
		busca: opts.busca,
	});

	const turns: TurnOutcome[] = [];
	for (const [i, turno] of opts.turns.entries()) {
		cursor.i = i;
		const events: TurnEvent[] = [];
		for await (const ev of runTurn({
			channel,
			conversationId: conv.id,
			userText: turno.user,
			isUserTurn: turno.isUserTurn ?? true,
			contactName,
		})) {
			events.push(ev);
		}
		turns.push({
			user: turno.user,
			events,
			artifacts: events
				.filter((e): e is Extract<TurnEvent, { type: "artifact" }> => e.type === "artifact")
				.map((e) => e.artifactType),
			trilha: montarTrilha(events),
		});
	}

	const final = await db.query.conversations.findFirst({ where: eq(conversations.id, conv.id) });

	return {
		conversationId: conv.id,
		turns,
		meta: (final?.metadata ?? {}) as ConversationMetadata,
	};
}

/** A ordem que o CLIENTE vê: cada artifact e gate nomeado, com a fala do
 * modelo colapsada em "text" (deltas individuais são ruído). */
function montarTrilha(events: TurnEvent[]): string[] {
	const trilha: string[] = [];
	for (const ev of events) {
		if (ev.type === "text-delta") {
			if (trilha[trilha.length - 1] !== "text") trilha.push("text");
		} else if (ev.type === "artifact") {
			trilha.push(`artifact:${ev.artifactType}`);
		} else if (ev.type === "gate") {
			trilha.push(`gate:${ev.gate}`);
		}
	}
	return trilha;
}

/** Limpa o que o cenário criou. Cada cenário nasce com conversa própria
 * (id aleatório), então rodar em paralelo com outros arquivos é seguro — mas
 * deixar lixo no banco compartilhado não é. `artifacts` sai antes de
 * `messages` (FK message_id). */
export async function limparCenario(conversationId: string): Promise<void> {
	const msgs = await db
		.select({ id: messages.id })
		.from(messages)
		.where(eq(messages.conversationId, conversationId));
	if (msgs.length) {
		await db.delete(artifacts).where(
			inArray(
				artifacts.messageId,
				msgs.map((m) => m.id),
			),
		);
	}
	await db.delete(messages).where(eq(messages.conversationId, conversationId));
	await db.delete(conversations).where(eq(conversations.id, conversationId));
}
