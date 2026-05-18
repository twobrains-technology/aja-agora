// src/lib/chat/types.ts

// ---- Artifact payload types (derived from adapter domain types) ----

export interface GroupCardPayload {
	id: string;
	administradora: string;
	category: "imovel" | "auto" | "moto" | "servicos";
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
	category: "imovel" | "auto" | "moto" | "servicos";
	creditValue: number;
	monthlyPayment: number;
	adminFee: number;
	reserveFund: number;
	insurance: number;
	totalCost: number;
	termMonths: number;
	effectiveRate: number;
	/** Cenário projetado com lance (bug #10). */
	lanceScenario?: {
		lancePercent: number;
		expectedTermMonths: number;
	};
	/** Correção prevista — INCC pra imóvel, IPCA pra auto (bug #10). */
	expectedAdjustment?: {
		index: "INCC" | "IPCA";
		annualPercent: number;
	};
	/** CTAs explícitas pro fechamento (bug #12). */
	actions?: Array<{
		label: string;
		intent: string;
	}>;
}

export interface RecommendationCardPayload {
	id: string;
	administradora: string;
	category: "imovel" | "auto" | "moto" | "servicos";
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
	category: "imovel" | "auto" | "moto" | "servicos";
	fields: ValuePickerField[];
}

// ---- Artifact discriminated union ----

// ---- Topic picker (#05) ----

export interface TopicPickerPayload {
	prompt?: string;
	topics: string[];
	includeBackButton: boolean;
}

// ---- 3 cenários (#16) ----

export interface ScenarioPayload {
	lancePercent: number;
	lanceValue: number;
	ownResourcesValue: number;
	expectedTermMonths: number;
	strategy: string;
	disclaimer: string;
}

export interface ScenariosPayload {
	groupId: string;
	administradora: string;
	creditValue: number;
	termMonths: number;
	scenarios: {
		conservador: ScenarioPayload;
		provavel: ScenarioPayload;
		acelerado: ScenarioPayload;
	};
}

// ---- Comparador consórcio × financiamento (#17) ----

export interface FinancingComparisonPayload {
	category: "imovel" | "auto" | "moto" | "servicos";
	creditValue: number;
	termMonths: number;
	consorcio: { monthlyPayment: number; totalCost: number };
	financing: { monthlyPayment: number; totalCost: number; annualRate: number };
	diff: { monthlyDelta: number; totalDelta: number };
	disclaimer: string;
}

// ---- WhatsApp opt-in (conversational capture pós-simulação) ----

// Sem payload obrigatório — agent só sinaliza "mostre o card aqui".
// O frontend resolve conversationId via context.
export interface WhatsappOptinPayload {
	conversationId?: string;
}

export type ArtifactByType =
	| { type: "group_card"; payload: GroupCardPayload }
	| { type: "comparison_table"; payload: ComparisonTablePayload }
	| { type: "simulation_result"; payload: SimulationResultPayload }
	| { type: "recommendation_card"; payload: RecommendationCardPayload }
	| { type: "lead_form"; payload: LeadFormPayload }
	| { type: "quick_reply"; payload: QuickReplyPayload }
	| { type: "value_picker"; payload: ValuePickerPayload }
	| { type: "topic_picker"; payload: TopicPickerPayload }
	| { type: "scenarios"; payload: ScenariosPayload }
	| { type: "financing_comparison"; payload: FinancingComparisonPayload }
	| { type: "whatsapp_optin"; payload: WhatsappOptinPayload };

export type ArtifactType = ArtifactByType["type"];

export type Artifact = ArtifactByType & { id: string };
