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

// ---- Artifact union ----

export type ArtifactType = "group_card" | "comparison_table" | "simulation_result";

export interface Artifact {
  id: string;
  type: ArtifactType;
  payload: GroupCardPayload | ComparisonTablePayload | SimulationResultPayload;
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
