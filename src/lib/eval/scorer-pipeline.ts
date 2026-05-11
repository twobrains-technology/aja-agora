// Pipeline puro (sem I/O de DB) — permite testes com fixtures e calibração offline.

import type { EvalDimensionsPayload, EvalFlagsPayload } from "@/db/schema";
import { JudgeError, type JudgeResponse } from "./judge";
import type { PersonaContext } from "./rubric";
import { average, computeConversaoDimension, computeFlags } from "./scorer-internals";
import {
	computeSignals,
	type DeterministicSignals,
	type SignalsArtifact,
	type SignalsLead,
	type SignalsMessage,
} from "./signals";
import { buildTranscript, type TranscriptArtifact } from "./transcript";

export type JudgeFn = (args: {
	transcript: string;
	personas: PersonaContext[];
	signals: DeterministicSignals;
}) => Promise<JudgeResponse>;

export type EvalInput = {
	status: "active" | "handed_off" | "closed";
	channel: "web" | "whatsapp";
	currentPersona: string | null;
	currentCategory: string | null;
	messages: SignalsMessage[];
	artifacts: SignalsArtifact[];
	lead: SignalsLead;
	personas: PersonaContext[];
	metadata: Parameters<typeof computeSignals>[0]["metadata"];
};

export type EvalComputedSuccess = {
	kind: "success";
	overallScore: number;
	dimensions: EvalDimensionsPayload;
	flags: EvalFlagsPayload;
	topIssues: string[];
	topStrengths: string[];
	tokensInput: number;
	tokensOutput: number;
	signals: DeterministicSignals;
};

export type EvalComputedFailure = {
	kind: "failure";
	error: string;
	signals: DeterministicSignals;
};

export type EvalComputed = EvalComputedSuccess | EvalComputedFailure;

function clampDimension(d: { score: number; reasoning: string }): {
	score: number;
	reasoning: string;
} {
	return { score: Math.min(1, Math.max(0, d.score)), reasoning: d.reasoning };
}

export async function computeEvalFromData(input: EvalInput, judge: JudgeFn): Promise<EvalComputed> {
	const signals = computeSignals({
		metadata: input.metadata,
		channel: input.channel,
		messages: input.messages,
		artifacts: input.artifacts,
		lead: input.lead,
	});

	const transcript = buildTranscript({
		status: input.status,
		channel: input.channel,
		currentPersona: input.currentPersona,
		currentCategory: input.currentCategory,
		messages: input.messages,
		artifacts: input.artifacts as TranscriptArtifact[],
	});

	let judgeResponse: JudgeResponse;
	try {
		judgeResponse = await judge({ transcript, personas: input.personas, signals });
	} catch (err) {
		const message =
			err instanceof JudgeError
				? err.message
				: `unexpected judge error: ${err instanceof Error ? err.message : "unknown"}`;
		return { kind: "failure", error: message, signals };
	}

	const conversao = computeConversaoDimension(signals);
	const dimensions: EvalDimensionsPayload = {
		engajamento: clampDimension(judgeResponse.result.dimensions.engajamento),
		discovery: clampDimension(judgeResponse.result.dimensions.discovery),
		continuidade: clampDimension(judgeResponse.result.dimensions.continuidade),
		naturalidade: clampDimension(judgeResponse.result.dimensions.naturalidade),
		assertividade: clampDimension(judgeResponse.result.dimensions.assertividade),
		conversao,
	};
	const overallScore = average([
		dimensions.engajamento.score,
		dimensions.discovery.score,
		dimensions.continuidade.score,
		dimensions.naturalidade.score,
		dimensions.assertividade.score,
		dimensions.conversao.score,
	]);

	const flags = computeFlags(judgeResponse.result.flags, dimensions, signals);

	return {
		kind: "success",
		overallScore: Math.min(1, Math.max(0, overallScore)),
		dimensions,
		flags,
		topIssues: judgeResponse.result.topIssues.slice(0, 3),
		topStrengths: judgeResponse.result.topStrengths.slice(0, 3),
		tokensInput: judgeResponse.tokensInput,
		tokensOutput: judgeResponse.tokensOutput,
		signals,
	};
}
