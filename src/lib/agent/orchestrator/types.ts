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
	// `modelAsked` (2026-07-13, ADR revoga-jornada-soberana): o MODELO já fez a
	// pergunta deste gate neste turno, com as palavras dele. O adapter então emite
	// só o INPUT (chips/slider/form) e NÃO repete a pergunta canônica — mantém a
	// regra do cliente ("1 pergunta por balão") sem calar o modelo. Antes, o runner
	// DESCARTAVA a pergunta do modelo (`discardHeldQuestion`) e deixava o card
	// perguntar sozinho, o que deixava a conversa robótica e sempre igual.
	| { type: "gate"; gate: Gate; prefix?: string; modelAsked?: boolean }
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
	| { type: "finish"; reason: string }
	// FIX-268 (rodada 7, veredito Fable r6, residual D4 — "texto picotado"):
	// força o fechamento do balão de texto aberto SEM depender de um
	// artifact/gate no meio. Sem isso, 2 directives seguidos (ex.: scarcity →
	// decision quando o card de scarcity não existe) colam o texto num balão
	// só, sem espaçamento — "1 balão = 1 ideia" violado. No-op quando não há
	// balão aberto.
	| { type: "text-boundary" };

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
	/**
	 * FIX-319 (rodada 10, onda 4 — veredito Sonnet, P0 confirmado): sub-turnos
	 * de directive PURAMENTE NARRATIVOS (ex.: scarcity/decision_prompt em
	 * `pipeClosingCeremony`, route.ts) dependiam só de texto de prompt ("NÃO
	 * chame nenhuma tool") pra impedir o modelo de chamar `present_contract_form`
	 * — que continua na allowlist da fase "closing" o turno INTEIRO. Achado ao
	 * vivo: o modelo chamava a tool cedo demais nesses sub-turnos, duplicando
	 * `contract_form` no mesmo turno HTTP. `forceToolChoice: "none"` faz o AI
	 * SDK proibir QUALQUER tool-call nesse turno em nível de API (nunca
	 * regra-no-prompt) — mesmo primitivo já usado por `forceToolChoice` em
	 * `runAgentTurn` (runner.ts), agora exposto pro CHAMADOR de `runTurn`
	 * (index.ts) escolher explicitamente, em vez de só a heurística interna.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: ToolChoice é genérico sobre o ToolSet do agent — repassado como-está até resolveAgent/buildAgent.
	forceToolChoice?: "none";
};

export type TurnContext = {
	conversationId: string;
	channel: Channel;
	currentPersona: Persona;
	meta: ConversationMetadata;
	contactName: string | null;
};
