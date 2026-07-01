import type { Category, ConversationMetadata, QualifyAnswers } from "@/lib/agent/personas";
import { type Gate, nextGate } from "@/lib/agent/qualify-state";

export type LeadStage =
	| "novo"
	| "engajado"
	| "qualificado"
	| "em_negociacao"
	| "proposta_enviada"
	| "na_administradora"
	| "em_atendimento"
	| "aguardando_pagamento"
	| "fechado_ganho"
	| "perdido";

export type SignalsMessage = {
	id: string;
	role: "user" | "assistant" | "system";
	content: string;
	createdAt: Date;
	personaId?: string | null;
};

export type SignalsArtifact = {
	messageId: string;
	type: string;
	payload: Record<string, unknown>;
};

export type SignalsLead = {
	stage: LeadStage;
	name: string | null;
	phone: string | null;
	email: string | null;
} | null;

export type PersonaSegment = {
	personaId: string;
	startMessageId: string;
	endMessageId: string;
	turnCount: number;
};

export type DeterministicSignals = {
	replyRate: number;
	qualifyCoverage: number;
	qualifyMissing: string[];
	numbersInTextFlagged: Array<{ messageId: string; number: string; context: string }>;
	dropOffGate: Gate | null;
	conversionStage: LeadStage;
	hasLead: boolean;
	personaSegments: PersonaSegment[];
};

const REQUIRED_BY_CATEGORY: Record<string, ReadonlyArray<keyof QualifyAnswers | "creditRange">> = {
	imovel: ["creditRange", "prazoMeses"],
	auto: ["creditRange", "hasLance"],
	servicos: ["creditRange"],
};

// R$, %, e número + unidade temporal/parcela. Unidade necessária pra evitar
// matchar anos calendário ("em 2026") e quantidades genéricas no texto.
const NUMBER_REGEX =
	/R\$\s*[\d.]+(?:,\d{1,2})?|\b\d+(?:[.,]\d+)?\s*%|\b\d+(?:[.,]\d+)?\s*(?:m[eê]s(?:es)?|anos?|parcelas?)\b/gi;

export function computeSignals(args: {
	metadata: ConversationMetadata | null;
	channel: "web" | "whatsapp";
	messages: SignalsMessage[];
	artifacts: SignalsArtifact[];
	lead: SignalsLead;
}): DeterministicSignals {
	const { metadata, channel, messages, artifacts, lead } = args;

	return {
		replyRate: computeReplyRate(messages),
		...computeQualifyCoverage(metadata),
		numbersInTextFlagged: computeNumbersFlagged(messages, artifacts),
		dropOffGate: computeDropOffGate(metadata),
		conversionStage: lead?.stage ?? "novo",
		hasLead: computeHasLead(channel, lead),
		personaSegments: computePersonaSegments(messages),
	};
}

// Web só tem o form como canal de contato → email é obrigatório. WhatsApp já
// usa o telefone como canal nativo → email é opcional (handoff direto pelo
// botão de interesse cria o lead com email=null e isso é normal).
function computeHasLead(channel: "web" | "whatsapp", lead: SignalsLead): boolean {
	if (!lead?.name || !lead.phone) return false;
	if (channel === "web" && !lead.email) return false;
	return true;
}

export function computePersonaSegments(messages: SignalsMessage[]): PersonaSegment[] {
	const segments: PersonaSegment[] = [];
	let current: PersonaSegment | null = null;

	for (const m of messages) {
		if (m.role !== "assistant") continue;
		const personaId = m.personaId ?? null;
		if (!personaId) continue;

		if (current && current.personaId === personaId) {
			current.endMessageId = m.id;
			current.turnCount++;
		} else {
			if (current) segments.push(current);
			current = {
				personaId,
				startMessageId: m.id,
				endMessageId: m.id,
				turnCount: 1,
			};
		}
	}
	if (current) segments.push(current);
	return segments;
}

function computeReplyRate(messages: SignalsMessage[]): number {
	const userTurns = messages.filter((m) => m.role === "user").length;
	const assistantTurns = messages.filter((m) => m.role === "assistant").length;
	if (assistantTurns === 0) return 1;
	return Math.min(1, userTurns / assistantTurns);
}

function computeQualifyCoverage(metadata: ConversationMetadata | null): {
	qualifyCoverage: number;
	qualifyMissing: string[];
} {
	if (!metadata) return { qualifyCoverage: 0, qualifyMissing: [] };

	// Categorias visitadas: união de personasSeen com currentCategory.
	const visited = new Set<Category>(metadata.personasSeen ?? []);
	if (metadata.currentCategory) visited.add(metadata.currentCategory);
	if (visited.size === 0) return { qualifyCoverage: 0, qualifyMissing: [] };

	const byCategory = metadata.qualifyAnswersByCategory ?? {};
	const missing: string[] = [];
	let totalFilled = 0;
	let totalRequired = 0;

	for (const cat of visited) {
		const required = REQUIRED_BY_CATEGORY[cat];
		if (!required) continue;
		// Categoria atual usa qualifyAnswers; categorias passadas usam o snapshot.
		const answers =
			cat === metadata.currentCategory
				? (metadata.qualifyAnswers ?? byCategory[cat] ?? {})
				: (byCategory[cat] ?? {});

		for (const field of required) {
			totalRequired++;
			if (field === "creditRange") {
				if (answers.creditMin !== undefined || answers.creditMax !== undefined) totalFilled++;
				else missing.push(`${cat}.creditRange`);
			} else {
				if (answers[field] !== undefined && answers[field] !== null) totalFilled++;
				else missing.push(`${cat}.${field}`);
			}
		}
	}

	return {
		qualifyCoverage: totalRequired === 0 ? 0 : totalFilled / totalRequired,
		qualifyMissing: missing,
	};
}

function computeNumbersFlagged(
	messages: SignalsMessage[],
	artifacts: SignalsArtifact[],
): Array<{ messageId: string; number: string; context: string }> {
	const knownNumbers = collectArtifactNumbers(artifacts);
	const flagged: Array<{ messageId: string; number: string; context: string }> = [];

	for (const msg of messages) {
		if (msg.role !== "assistant") continue;
		const matches = msg.content.matchAll(NUMBER_REGEX);
		for (const match of matches) {
			const raw = match[0];
			const numericValue = parseNumeric(raw);
			if (numericValue === null) continue;
			if (matchesKnownNumber(numericValue, knownNumbers)) continue;
			flagged.push({
				messageId: msg.id,
				number: raw,
				context: extractContext(msg.content, match.index ?? 0),
			});
		}
	}

	return flagged;
}

function collectArtifactNumbers(artifacts: SignalsArtifact[]): Set<number> {
	const result = new Set<number>();
	for (const a of artifacts) walkForNumbers(a.payload, result);
	return result;
}

function walkForNumbers(value: unknown, out: Set<number>): void {
	if (typeof value === "number" && Number.isFinite(value)) {
		out.add(value);
		// Forma derivada: percent fracionário (0.18) também conhecido como integer (18).
		out.add(Math.round(value * 100));
		// Cross-unit meses ↔ anos: artifact "prazoMeses: 120" precisa casar com
		// texto "10 anos" e vice-versa. Sem isso o agente fala em ano e tudo
		// vira flag de hallucination.
		if (Number.isInteger(value) && value % 12 === 0) out.add(value / 12);
		out.add(value * 12);
		return;
	}
	if (Array.isArray(value)) {
		for (const v of value) walkForNumbers(v, out);
		return;
	}
	if (value && typeof value === "object") {
		for (const v of Object.values(value)) walkForNumbers(v, out);
	}
}

function parseNumeric(raw: string): number | null {
	const cleaned = raw
		.replace(/R\$\s*/i, "")
		.replace(/\s*%/, "")
		.replace(/\s*(?:m[eê]s(?:es)?|anos?|parcelas?)\s*$/i, "")
		.replace(/\./g, "")
		.replace(",", ".");
	const n = Number(cleaned);
	return Number.isFinite(n) ? n : null;
}

function matchesKnownNumber(value: number, known: Set<number>): boolean {
	if (known.has(value)) return true;
	const rounded = Math.round(value);
	if (known.has(rounded)) return true;
	// Tolerância de ±1 unidade pra arredondamento de centavos
	if (known.has(rounded + 1) || known.has(rounded - 1)) return true;
	return false;
}

function extractContext(content: string, matchIndex: number): string {
	const start = Math.max(0, matchIndex - 30);
	const end = Math.min(content.length, matchIndex + 60);
	return content.slice(start, end).replace(/\s+/g, " ").trim();
}

function computeDropOffGate(metadata: ConversationMetadata | null): Gate | null {
	if (!metadata) return null;
	if (!metadata.currentCategory) return null;
	try {
		return nextGate(metadata);
	} catch {
		return null;
	}
}
