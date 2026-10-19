// CENÁRIO DE CONVERSA NO MOTOR DO PI — o irmão de `langgraph/testing/scenario.ts`.
//
// Roda o turno DE VERDADE (capture → analyze → route → advance → discovery? →
// fala do pi → emitCard → persist) contra o Postgres de verdade, com as DUAS
// fronteiras LLM trocadas por roteiro: o modelo (servidor roteirizado local) e o
// analyzer (função que só escreve o que o cenário declarou).
//
// O que se asserta é a TRAJETÓRIA — quais artifacts saíram, em que ordem, qual
// gate ficou ativo —, nunca a prosa do modelo ("conversa é do modelo").
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { artifacts, conversations, messages } from "@/db/schema";
import type { UserIntent as _Intent } from "@/lib/agent/qualify-state";

/** Um turno do cenário: o que o cliente diz, o que o analyzer extrai e o que o
 * modelo responde. */
export type ScenarioTurn = {
	user: string;
	/** Beats do modelo NESTE turno (um por ida ao provedor). */
	beats: ScriptedBeat[];
	/** O que o analyzer "extraiu" — muta o meta, como `analyzeAndMerge` faz. */
	extrai?: (meta: ConversationMetadata) => void;
	/** Intent classificado do turno. Default: "neutral". */
	intent?: _Intent;
	/** `false` = turno de SERVIDOR (directive), não fala do cliente. */
	isUserTurn?: boolean;
};

export type TurnOutcome = {
	user: string;
	events: TurnEvent[];
	/** Só os tipos de artifact, na ordem — a asserção mais usada. */
	artifacts: string[];
	/** A trajetória legível: artifacts e gates na ordem em que o cliente os vê. */
	trilha: string[];
};

import type { AnalyzeResult } from "@/lib/agent/orchestrator/analyze";
import type { Channel, TurnEvent } from "@/lib/agent/orchestrator/types";
import type { ConversationMetadata } from "@/lib/agent/personas";
import type { UserIntent } from "@/lib/agent/qualify-state";
import type { BuscaGrupos } from "@/lib/agent/turn/discovery";
import { encryptIdentity } from "@/lib/conversation/identity";
import { createRunTurnPi } from "../turno";
import { type ScriptedBeat, subirServidorRoteirizado } from "./servidor-roteirizado";

/** CPF falso para a identidade semeada — PII de teste, nunca de gente real. */
const CPF_FALSO_DO_CENARIO = "52998224725";

export type ScenarioResultPi = {
	conversationId: string;
	turns: TurnOutcome[];
	meta: ConversationMetadata;
	/** Quantas idas ao "modelo" o turno fez. */
	chamadasAoModelo: number;
	/** O system que o modelo recebeu no último turno (texto achatado). */
	sistema: string;
};

function analyzerDoRoteiro(turnos: ScenarioTurn[], cursor: { i: number }) {
	return async (
		_text: string,
		_persona: unknown,
		meta: ConversationMetadata,
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
			// biome-ignore lint/suspicious/noExplicitAny: shape inteiro do TurnAnalysis
		} as any;
	};
}

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

export async function runScenarioPi(opts: {
	turns: ScenarioTurn[];
	metaInicial?: Partial<ConversationMetadata>;
	channel?: Channel;
	contactName?: string | null;
	telefone?: string;
	busca?: BuscaGrupos;
}): Promise<ScenarioResultPi> {
	const channel = opts.channel ?? "web";
	const cursor = { i: 0 };
	const contactName = "contactName" in opts ? (opts.contactName ?? null) : "Cliente Cenário";

	const metadata: Record<string, unknown> = { ...(opts.metaInicial ?? {}) };
	if (opts.telefone) {
		metadata.identityEnc = encryptIdentity({ cpf: CPF_FALSO_DO_CENARIO, celular: opts.telefone });
	}

	const [conv] = await db
		.insert(conversations)
		.values({ channel, status: "active", contactName, metadata })
		.returning({ id: conversations.id });

	const servidor = await subirServidorRoteirizado(opts.turns.flatMap((t) => t.beats));

	try {
		const runTurn = createRunTurnPi({
			provider: {
				id: "cenario",
				baseUrl: `${servidor.url}/v1`,
				apiKey: "cenario",
				model: "cenario",
			},
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

		const final = await db.query.conversations.findFirst({
			where: eq(conversations.id, conv.id),
		});

		return {
			conversationId: conv.id,
			turns,
			meta: (final?.metadata ?? {}) as ConversationMetadata,
			chamadasAoModelo: servidor.chamadas(),
			sistema: servidor.ultimoSistema(),
		};
	} finally {
		await servidor.fechar();
	}
}

/** Apaga o que o cenário criou (artifacts antes de messages: FK). */
export async function limparCenarioPi(conversationId: string): Promise<void> {
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
