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

// ---- Artifact union ----

export type ArtifactType = "group_card" | "comparison_table" | "simulation_result" | "recommendation_card" | "lead_form" | "quick_reply" | "value_picker";

export interface Artifact {
  id: string;
  type: ArtifactType;
  payload: GroupCardPayload | ComparisonTablePayload | SimulationResultPayload | RecommendationCardPayload | LeadFormPayload | QuickReplyPayload;
}

// ---- Chat message ----

export type MessageStatus = "pending" | "streaming" | "complete" | "error";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  artifacts: Artifact[];
  createdAt: Date;
  status: MessageStatus;
}

// ---- SSE event types (from backend) ----

export interface TextDeltaEvent {
  type: "text-delta";
  textDelta: string;
}

export interface ArtifactEvent {
  type: "artifact";
  artifact: {
    id: string;
    type: ArtifactType;
    payload: Record<string, unknown>;
  };
}

export interface ErrorEvent {
  type: "error";
  error: string;
}

export type SSEEvent = TextDeltaEvent | ArtifactEvent | ErrorEvent;
