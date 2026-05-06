// src/lib/chat/types.ts

// ---- Artifact payload types (derived from adapter domain types) ----

export interface GroupCardPayload {
	id: string;
	administradora: string;
	category: "imovel" | "auto" | "servicos";
	creditValue: number;
	monthlyPayment: number;
	adminFeePercent: number;
	termMonths: number;
	availableSlots: number;
	contemplationRate: number;
}

export interface ComparisonTablePayload {
	groups: GroupCardPayload[];
	highlightBestIndex?: number;
}

export interface SimulationResultPayload {
	groupId: string;
	administradora: string;
	creditValue: number;
	monthlyPayment: number;
	adminFee: number;
	reserveFund: number;
	insurance: number;
	totalCost: number;
	termMonths: number;
	effectiveRate: number;
}

export interface RecommendationCardPayload {
	id: string;
	administradora: string;
	category: "imovel" | "auto" | "servicos";
	creditValue: number;
	monthlyPayment: number;
	adminFeePercent: number;
	termMonths: number;
	contemplationRate: number;
	score: number; // 0-1 composite score from rankGroups()
	scoreBreakdown: {
		monthlyFit: number;
		contemplation: number;
		adminFee: number;
		termMatch: number;
	};
}

// ---- Lead form payload (NO PII — only metadata for artifact storage) ----

export interface LeadFormPayload {
	conversationId: string;
	recommendationId?: string;
}

// ---- Quick reply payload ----

export interface QuickReplyOption {
	label: string;
	value: string;
	emoji?: string;
}

export interface QuickReplyPayload {
	options: QuickReplyOption[];
}

// ---- Value picker payload (legacy tool artifact) ----

export interface ValuePickerField {
	id: string;
	label: string;
	min: number;
	max: number;
	step: number;
	default: number;
	prefix?: string;
	suffix?: string;
	format?: "currency" | "months";
}

export interface ValuePickerPayload {
	category: "imovel" | "auto" | "servicos";
	fields: ValuePickerField[];
}

// ---- Artifact discriminated union ----

export type ArtifactByType =
	| { type: "group_card"; payload: GroupCardPayload }
	| { type: "comparison_table"; payload: ComparisonTablePayload }
	| { type: "simulation_result"; payload: SimulationResultPayload }
	| { type: "recommendation_card"; payload: RecommendationCardPayload }
	| { type: "lead_form"; payload: LeadFormPayload }
	| { type: "quick_reply"; payload: QuickReplyPayload }
	| { type: "value_picker"; payload: ValuePickerPayload };

export type ArtifactType = ArtifactByType["type"];

export type Artifact = ArtifactByType & { id: string };
