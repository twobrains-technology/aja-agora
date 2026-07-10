import type { Category, ConversationMetadata, Persona } from "@/lib/agent/personas";
import type { Gate, UserIntent } from "@/lib/agent/qualify-state";
import type { ArtifactType } from "@/lib/chat/types";

export type Channel = "web" | "whatsapp";

export type LeadCollectionField = "name" | "phone" | "email";

export type ChatMessage = {
	role: "system" | "user" | "assistant";
	content: string;
};

export type ProducedArtifact = {
	type: string;
	payload: Record<string, unknown>;
};

export type TurnEvent =
	| { type: "text-delta"; text: string }
	| { type: "tool-call"; toolName: string; input: unknown; toolCallId: string }
	| {
			type: "artifact";
			artifactType: ArtifactType;
			payload: Record<string, unknown>;
			toolCallId: string;
	  }
	| { type: "gate"; gate: Gate; prefix?: string }
	| {
			type: "transition";
			fromPersona: Persona | null;
			toPersona: Persona;
			toPersonaName: string;
			toCategory: Category;
			bridgeText: string;
	  }
	| { type: "welcome-categories" }
	| { type: "handoff"; reason: string; triggerId?: string }
	| { type: "lead-stage"; stage: "novo" | "engajado" | "qualificado" }
	| { type: "meta-update"; meta: ConversationMetadata }
	| { type: "lead-collection-prompt"; field: LeadCollectionField; text: string }
	// FIX-24: telemetria de observabilidade — emitidos pelo runner pra alimentar
	// o turn-trace (suppressões de guard + métricas de cache da Anthropic). NÃO
	// são user-facing: os adapters (web/whatsapp) os tratam como no-op.
	| { type: "suppression"; artifactType: string; reason: string }
	| { type: "usage"; cacheRead: number; cacheWrite: number }
	| { type: "finish"; reason: string };

export type TurnInput = {
	channel: Channel;
	conversationId: string;
	userText: string;
	isUserTurn: boolean;
	contactName?: string | null;
	skipAnalyzer?: boolean;
	skipLeadCollection?: boolean;
	userIntent?: UserIntent;
	/**
	 * Chave estável da pessoa nesse canal. Web: cookie hex (AJA_UID). WhatsApp:
	 * geralmente vem `null` aqui — usa `conversations.waId` resolvido dentro
	 * do orquestrador. Usado pela camada de memória pra mapear pessoa ↔ agent.
	 */
	userKey?: string | null;
	/**
	 * FIX-253/254 (rodada 4) — o handler CHAMADOR (route.ts) já vai emitir o
	 * "gate" (card + pergunta) explicitamente logo em seguida a este turno de
	 * directive (ex.: embedded_bid no clique do gate lance). Sem isso, o
	 * disparo automático de `nextGateToFire` DENTRO deste turno (mayEvaluateGates
	 * do runner) emite o MESMO gate de novo — double-dispatch (educação+chips
	 * duplicados, achado N-C do veredito Fable FINAL). Suprime só o EVENTO
	 * "gate" (e o card server-side que o acompanha); o bookkeeping de meta
	 * (desireAsked/consentOffered/simulatorOfferDispatched) permanece — é
	 * estado, não output duplicado.
	 */
	suppressGateEvent?: boolean;
};

export type TurnContext = {
	conversationId: string;
	channel: Channel;
	currentPersona: Persona;
	meta: ConversationMetadata;
	contactName: string | null;
};
