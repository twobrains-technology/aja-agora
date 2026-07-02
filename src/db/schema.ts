import { relations, sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	boolean,
	check,
	index,
	integer,
	jsonb,
	numeric,
	pgEnum,
	pgTable,
	real,
	text,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import type { Category, ExpertiseLevel } from "@/lib/agent/personas";
import type { UserIntent } from "@/lib/agent/qualify-state";
import type { HumanMemoryBlock } from "@/lib/memory/types";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const messageRoleEnum = pgEnum("message_role", ["user", "assistant", "system"]);

export const channelEnum = pgEnum("channel", ["web", "whatsapp"]);

export const conversationStatusEnum = pgEnum("conversation_status", [
	"active",
	"handed_off",
	"closed",
]);

// FIX-43: split do fechamento (na_administradora → aguardando_pagamento →
// fechado_ganho) refletindo mesa manual + boleto, alimentado por polling
// (FIX-44). Ordem = funil forward-only; `perdido` é terminal.
// FIX-126 (D17): `em_atendimento` = um atendente de mesa ASSUMIU o caso (claim "Vou
// atender"). Posicionada ENTRE na_administradora e aguardando_pagamento (não antes — senão
// o claim, que dispara quando o lead já está em na_administradora, regrediria e o
// forward-only viraria no-op). Ver docs/correcoes/decisions/2026-07-01-bloco-mesa-transbordo-auto.md.
export const leadStageEnum = pgEnum("lead_stage", [
	"novo",
	"engajado",
	"qualificado",
	"em_negociacao",
	"proposta_enviada",
	"na_administradora",
	"em_atendimento",
	"aguardando_pagamento",
	"fechado_ganho",
	"perdido",
]);

export const actorTypeEnum = pgEnum("actor_type", ["system", "admin"]);

export const insightTypeEnum = pgEnum("insight_type", [
	"summary",
	"intent",
	"budget",
	"objections",
	"next_action",
]);

export const memoryEventTypeEnum = pgEnum("memory_event_type", [
	"agent_created",
	"context_loaded",
	"memory_stored",
	"reconciled",
	"fallback_triggered",
	"purged",
]);

// ─── Mesa de operação (transbordo + copiloto) ────────────────────────────────
// Spec de negócio: docs/visao/mesa-de-operacao.md.
export const administradoraDocTipoEnum = pgEnum("administradora_doc_tipo", [
	"manual",
	"tabela",
	"outro",
]);

export const mesaHandoffStatusEnum = pgEnum("mesa_handoff_status", [
	"aberto",
	"em_andamento",
	"concluido",
	"cancelado",
]);

export const mesaCopilotRoleEnum = pgEnum("mesa_copilot_role", ["assistant", "attendant"]);

// ─── Documentos do cliente (S3 nosso = fonte da verdade) ─────────────────────
// Design: docs/superpowers/specs/2026-06-28-gestao-documentos-cliente-design.md.
// Mesmos slots do KYC já usados no fechamento Bevi (DocumentSlot em
// src/lib/adapters/proposal-gateway.ts) — reaproveita o vocabulário do domínio.
export const clientDocumentSlotEnum = pgEnum("client_document_slot", [
	"identidade_frente",
	"identidade_verso",
	"comprovante_endereco",
]);

// Só "stored" por hora (o ativo nosso nunca é removido/expirado nesta feature —
// ver §7 Fora de escopo do design). Enum em vez de texto livre pra bater com o
// padrão do repo (leadStageEnum, mesaHandoffStatusEnum etc).
export const clientDocumentStatusEnum = pgEnum("client_document_status", ["stored"]);

export const clientDocumentDispatchStatusEnum = pgEnum("client_document_dispatch_status", [
	"pending",
	"sent",
	"failed",
	"manual",
]);

export const clientDocumentDispatchTargetEnum = pgEnum("client_document_dispatch_target", [
	"bevi_a",
	"bevi_b",
	"mesa",
]);

// ─── WhatsApp Message Templates (Meta oficial) ───────────────────────────────
// Design: docs/design/specs/2026-07-02-whatsapp-templates-meta-design.md.
// Ciclo de vida de um template na Cloud API da Meta: DRAFT (local, ainda não
// submetido) → PENDING (submetido, aguardando revisão) → APPROVED/REJECTED, e
// depois DISABLED/PAUSED (a Meta pode desabilitar/pausar um template aprovado).
export const whatsappTemplateStatusEnum = pgEnum("whatsapp_template_status", [
	"DRAFT",
	"PENDING",
	"APPROVED",
	"REJECTED",
	"DISABLED",
	"PAUSED",
]);

// Categorias oficiais da Meta (a submissão declara uma; a Meta pode recategorizar).
export const whatsappTemplateCategoryEnum = pgEnum("whatsapp_template_category", [
	"UTILITY",
	"MARKETING",
	"AUTHENTICATION",
]);

// Estado de uma mensagem business-initiated enfileirada à espera de template
// aprovado (fallback anti-manual — ver FIX-201/spec §Resolução de envio).
export const whatsappOutboundStatusEnum = pgEnum("whatsapp_outbound_status", [
	"pending",
	"sent",
	"failed",
]);

// ─── Better Auth Tables ──────────────────────────────────────────────────────

export const user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text("image"),
	role: text("role").default("viewer").notNull(),
	phone: varchar("phone", { length: 32 }),
	isActive: boolean("is_active").default(true).notNull(),
	invitedAt: timestamp("invited_at"),
	invitedBy: text("invited_by").references((): AnyPgColumn => user.id),
	inviteToken: text("invite_token").unique(),
	inviteExpiresAt: timestamp("invite_expires_at"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
});

export const session = pgTable(
	"session",
	{
		id: text("id").primaryKey(),
		expiresAt: timestamp("expires_at").notNull(),
		token: text("token").notNull().unique(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => new Date())
			.notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
	"account",
	{
		id: text("id").primaryKey(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: timestamp("access_token_expires_at"),
		refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
		scope: text("scope"),
		password: text("password"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
	"verification",
	{
		id: text("id").primaryKey(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: timestamp("expires_at").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [index("verification_identifier_idx").on(table.identifier)],
);

// ─── Application Tables ─────────────────────────────────────────────────────

// Contacts (cliente unificado — FIX-41)
// Uma entidade CLIENTE resolvida por telefone, CPF ou e-mail, agregando N
// conversas/leads/propostas de qualquer canal (web/WhatsApp). Antes não existia:
// `leads` era 1:1 com `conversation` e o mesmo cliente em dois canais virava dois
// cards. Ver docs/jornada/proposta-funil-contatos-retorno.md (Parte 1).
export const contacts = pgTable(
	"contacts",
	{
		id: uuid().defaultRandom().primaryKey(),
		phone: text(), // E.164, normalizePhoneBR — nullable
		// DES-CPF-RAW: CPF em texto puro por hora (decisão Kairo 2026-06-14:
		// "preciso do CPF, não tem problema estar raw por hora"). Endurecer
		// pós-piloto (HMAC determinístico ou cifra+hash pesquisável). Mitigações
		// que valem já: NUNCA logar, NUNCA injetar no prompt do LLM, mascarar na
		// UI admin por padrão.
		cpf: text(),
		email: text(),
		name: text(), // melhor nome conhecido
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("contacts_phone_idx").on(table.phone),
		index("contacts_cpf_idx").on(table.cpf),
		index("contacts_email_idx").on(table.email),
		// Invariante: ao menos um identificador presente (cliente sem telefone,
		// CPF nem e-mail não é resolvível — leads anônimos ficam sem contactId).
		check(
			"contacts_identifier_check",
			sql`${table.phone} IS NOT NULL OR ${table.cpf} IS NOT NULL OR ${table.email} IS NOT NULL`,
		),
	],
);

// Conversations
export const conversations = pgTable(
	"conversations",
	{
		id: uuid().defaultRandom().primaryKey(),
		waId: varchar("wa_id", { length: 50 }),
		// Cliente unificado (FIX-41) — nullable até a identidade ser resolvida.
		contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
		channel: channelEnum().default("web").notNull(),
		status: conversationStatusEnum().default("active").notNull(),
		handedOffUserId: text("handed_off_user_id").references(() => user.id),
		contactName: varchar("contact_name", { length: 100 }),
		metadata: jsonb().$type<Record<string, unknown>>(),
		isSimulated: boolean("is_simulated").default(false).notNull(),
		// FIX-86: lastInboundAt rastreia o último inbound do cliente no WhatsApp.
		// Essencial para controlar a janela de 24h da Meta Cloud API — texto livre
		// só é permitido se o último inbound foi há menos de 24h.
		lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("conversations_wa_id_idx").on(table.waId),
		index("conversations_handed_off_user_id_idx").on(table.handedOffUserId),
		index("conversations_last_inbound_at_idx").on(table.lastInboundAt),
	],
);

// Messages
export const messages = pgTable(
	"messages",
	{
		id: uuid().defaultRandom().primaryKey(),
		conversationId: uuid("conversation_id")
			.notNull()
			.references(() => conversations.id, { onDelete: "cascade" }),
		role: messageRoleEnum().notNull(),
		content: text().notNull(),
		channel: channelEnum().default("web").notNull(),
		// Persona slug que produziu este turno; NULL para user/system e mensagens
		// históricas. Usado pelo eval pra segmentar transcript multi-persona.
		personaId: text("persona_id"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [index("messages_conversation_persona_idx").on(table.conversationId, table.personaId)],
);

// Artifacts
// `type` é `text` (não enum) porque a fonte de verdade da union é a TS
// `ArtifactType` em `src/lib/chat/types.ts` — ela evolui frequentemente e
// trocar enum DB a cada novo artifact é fricção sem ganho (não há consumer
// SQL fora do código TS que precise validar via enum).
export const artifacts = pgTable("artifacts", {
	id: uuid().defaultRandom().primaryKey(),
	messageId: uuid("message_id")
		.notNull()
		.references(() => messages.id, { onDelete: "cascade" }),
	type: text().notNull(),
	payload: jsonb().notNull().$type<Record<string, unknown>>(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Leads (PII separate from conversation logs)
export const leads = pgTable(
	"leads",
	{
		id: uuid().defaultRandom().primaryKey(),
		conversationId: uuid("conversation_id")
			.notNull()
			.references(() => conversations.id, { onDelete: "cascade" }),
		// Cliente unificado (FIX-41) — nullable (leads anônimos sem contato).
		contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
		name: text(),
		phone: text(),
		email: text(),
		stage: leadStageEnum("stage").default("novo").notNull(),
		creditValue: numeric("credit_value", { precision: 12, scale: 2 }),
		isSimulated: boolean("is_simulated").default(false).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("leads_created_at_idx").on(table.createdAt),
		// Consulta legada por telefone (dedup/backfill) — FIX-41.
		index("leads_phone_idx").on(table.phone),
	],
);

// Lead Events (funnel transition audit trail)
export const leadEvents = pgTable("lead_events", {
	id: uuid().defaultRandom().primaryKey(),
	leadId: uuid("lead_id")
		.notNull()
		.references(() => leads.id, { onDelete: "cascade" }),
	fromStage: leadStageEnum("from_stage"),
	toStage: leadStageEnum("to_stage").notNull(),
	actorType: actorTypeEnum("actor_type").notNull(),
	actorId: text("actor_id"),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Bevi Proposals (estado do FECHAMENTO real — passo 5 "Contratar")
// Guarda só o necessário pra retomar a proposta entre turnos (web↔WhatsApp) e
// pro back office acompanhar. LGPD-mínimo: NÃO armazena CPF — só os IDs Bevi e o
// snapshot da oferta escolhida. O ofertaId expira em 30min (offerExpiresAt) →
// re-simular antes do choose_offer.
export const beviProposals = pgTable(
	"bevi_proposals",
	{
		id: uuid().defaultRandom().primaryKey(),
		conversationId: uuid("conversation_id")
			.notNull()
			.references(() => conversations.id, { onDelete: "cascade" }),
		leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
		// Cliente unificado (FIX-41) — denormaliza p/ consulta direta por
		// telefone/CPF ("buscar tudo que o cliente já fez"). Nullable até resolver.
		contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
		// IDs da API de Parceiro
		proposalId: text("proposal_id").notNull(),
		simulationSessionId: text("simulation_session_id"),
		ofertaId: text("oferta_id"),
		offerExpiresAt: timestamp("offer_expires_at", { withTimezone: true }),
		// Snapshot da oferta escolhida (pro card/back office, sem re-simular)
		segmento: varchar("segmento", { length: 30 }),
		administradora: varchar("administradora", { length: 60 }),
		grupo: varchar("grupo", { length: 30 }),
		creditValue: numeric("credit_value", { precision: 12, scale: 2 }),
		monthlyPayment: numeric("monthly_payment", { precision: 12, scale: 2 }),
		// FIX-39: prazo REAL (meses) da oferta — a API nova (2026-06-12) passou a
		// trazê-lo. Nullable: shape antigo não tinha e a API pode voltar atrás.
		termMonths: integer("term_months"),
		// Artefatos de fechamento
		consortiumProposalLink: text("consortium_proposal_link"),
		documentsLinkPersonal: text("documents_link_personal"),
		documentsLinkAddress: text("documents_link_address"),
		proposalStatus: varchar("proposal_status", { length: 60 }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("bevi_proposals_conversation_id_idx").on(table.conversationId),
		index("bevi_proposals_proposal_id_idx").on(table.proposalId),
	],
);

export type CampaignMentionPriority = "low" | "medium" | "high";

export type PersonaCampaign = {
	id: string;
	title: string;
	body: string;
	startsAt: string | null;
	endsAt: string | null;
	enabled: boolean;
	mentionPriority: CampaignMentionPriority;
};

export type PersonaHandoffTrigger = {
	id: string;
	condition: string;
	enabled: boolean;
};

export type PersonaForbiddenTopic = {
	id: string;
	topic: string;
	responseWhenAsked: string;
	enabled: boolean;
};

// Few-shot example shown to the model to ground the persona's voice.
// Anthropic recommends 3-5 examples wrapped in <example> tags — they
// outperform free-text descriptions for tone steering.
//
// As condições `when*` filtram dinamicamente quais exemplos vão pro prompt
// em cada turno (selectExamplesForTurn). Ausente/vazio = sempre aplica.
// `enabled !== false` é tratado como ativo (default true por omissão pra
// compat com exemplos legados); `origin` ausente = "manual".
export type PersonaExample = {
	id: string;
	context?: string | null;
	userMessage: string;
	assistantResponse: string;

	whenExpertise?: ExpertiseLevel[];
	whenCategory?: Category[];
	whenChannel?: "web" | "whatsapp";
	whenIntent?: UserIntent[];

	tags?: string[];

	enabled?: boolean;
	origin?: "manual" | "diagnosis";
	sourceConversationId?: string | null;
};

// `version` increments on every admin update — used by the agent cache to
// invalidate without explicit pub/sub.
export const personas = pgTable(
	"personas",
	{
		id: text("id").primaryKey(),
		displayName: text("display_name").notNull(),
		role: text("role").default("specialist").notNull(),
		category: text("category"),
		// Sub-niche within category. NULL = generalist (fallback). Free-form text;
		// the analyzer is anchored to active values per category at call time.
		expertise: text("expertise"),
		voiceTone: text("voice_tone").notNull(),
		examples: jsonb("examples").$type<PersonaExample[]>().default([]).notNull(),
		// Per-persona temperature kept in DB for tuning, hidden from admin UI.
		// Claude only exposes temperature (no topP/penalty), so this is the only sampling lever.
		temperature: real("temperature").default(0.7).notNull(),
		activeCampaigns: jsonb("active_campaigns").$type<PersonaCampaign[]>().default([]).notNull(),
		handoffTriggers: jsonb("handoff_triggers")
			.$type<PersonaHandoffTrigger[]>()
			.default([])
			.notNull(),
		forbiddenTopics: jsonb("forbidden_topics")
			.$type<PersonaForbiddenTopic[]>()
			.default([])
			.notNull(),
		activeTools: jsonb("active_tools").$type<string[]>().default([]).notNull(),
		isActive: boolean("is_active").default(true).notNull(),
		version: integer("version").default(1).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		check("personas_role_check", sql`${table.role} IN ('concierge', 'specialist')`),
		check(
			"personas_category_check",
			sql`${table.category} IS NULL OR ${table.category} IN ('imovel', 'auto', 'moto', 'servicos')`,
		),
		check(
			"personas_specialist_has_category",
			sql`${table.role} = 'concierge' OR ${table.category} IS NOT NULL`,
		),
		check(
			"personas_temperature_check",
			sql`${table.temperature} >= 0 AND ${table.temperature} <= 1`,
		),
	],
);

// Lead Insights (AI-generated insights cache, keyed by lead OR conversation)
export const leadInsights = pgTable(
	"lead_insights",
	{
		id: uuid().defaultRandom().primaryKey(),
		leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
		conversationId: uuid("conversation_id").references(() => conversations.id, {
			onDelete: "cascade",
		}),
		insightType: insightTypeEnum("insight_type").notNull(),
		content: text().notNull(),
		generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
		model: varchar("model", { length: 100 }),
	},
	(table) => [
		index("lead_insights_lead_id_idx").on(table.leadId),
		index("lead_insights_conversation_id_idx").on(table.conversationId),
		check(
			"lead_insights_owner_check",
			sql`(${table.leadId} IS NOT NULL) <> (${table.conversationId} IS NOT NULL)`,
		),
	],
);

// Conversation Evaluations (LLM-as-judge scoring per conversation)
// Stores the most-recent score; re-evaluations replace prior rows by querying ordered desc.
export type EvalDimensionPayload = { score: number; reasoning: string };

export type EvalFlagsPayload = {
	hallucination: boolean;
	missedHandoff: boolean;
	incompleteDiscovery: boolean;
	lowEngagement: boolean;
};

export type EvalDimensionsPayload = {
	engajamento: EvalDimensionPayload;
	discovery: EvalDimensionPayload;
	continuidade: EvalDimensionPayload;
	naturalidade: EvalDimensionPayload;
	assertividade: EvalDimensionPayload;
	conversao: EvalDimensionPayload;
};

export const conversationEvaluations = pgTable(
	"conversation_evaluations",
	{
		id: uuid().defaultRandom().primaryKey(),
		conversationId: uuid("conversation_id")
			.notNull()
			.references(() => conversations.id, { onDelete: "cascade" }),
		personaId: text("persona_id"),
		personaVersion: integer("persona_version"),
		rubricVersion: text("rubric_version").notNull(),
		judgeModel: varchar("judge_model", { length: 100 }).notNull(),
		overallScore: numeric("overall_score", { precision: 3, scale: 2 }),
		dimensions: jsonb().$type<EvalDimensionsPayload>(),
		flags: jsonb().$type<EvalFlagsPayload>(),
		topIssues: jsonb("top_issues").$type<string[]>(),
		topStrengths: jsonb("top_strengths").$type<string[]>(),
		tokensInput: integer("tokens_input"),
		tokensOutput: integer("tokens_output"),
		evaluatedUntilMessageId: uuid("evaluated_until_message_id").references(() => messages.id),
		evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).defaultNow().notNull(),
		error: text(),
	},
	(table) => [
		index("conversation_evaluations_conversation_id_evaluated_at_idx").on(
			table.conversationId,
			table.evaluatedAt.desc(),
		),
		check(
			"conversation_evaluations_overall_score_check",
			sql`${table.overallScore} IS NULL OR (${table.overallScore} >= 0 AND ${table.overallScore} <= 1)`,
		),
	],
);

// Memory Events (audit trail da camada de memória Letta)
// Ver ADR 2026-05-16-aja-agora-letta-sidecar-integration.
export const memoryEvents = pgTable(
	"memory_events",
	{
		id: uuid().defaultRandom().primaryKey(),
		conversationId: uuid("conversation_id").references(() => conversations.id, {
			onDelete: "set null",
		}),
		lettaAgentId: text("letta_agent_id"),
		eventType: memoryEventTypeEnum("event_type").notNull(),
		payload: jsonb().$type<Record<string, unknown>>(),
		latencyMs: integer("latency_ms"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("memory_events_conversation_id_idx").on(table.conversationId),
		index("memory_events_letta_agent_id_idx").on(table.lettaAgentId),
		index("memory_events_created_at_idx").on(table.createdAt.desc()),
	],
);

// Memory Identities — re-home da memória cross-channel do Letta pro Postgres
// (FIX-81 / ADR 2026-06-25-remocao-letta-postgres, Opção B).
//
// 1 linha por identidade (web anon-cookie / phone / email). O `block` jsonb é o
// `HumanMemoryBlock` que antes vivia serializado num memory_block do Letta —
// agora nativo no banco que o app já opera. Chave de negócio: (namespace, kind,
// value), espelhando `UserIdentity`. `reconciled_from` guarda a chave canônica
// da identidade de origem quando um cookie web é reconciliado num phone
// (continuidade web → WhatsApp). Archival semântico (pgvector) é fase 2 do ADR.
export const memoryIdentities = pgTable(
	"memory_identities",
	{
		id: uuid().defaultRandom().primaryKey(),
		namespace: varchar("namespace", { length: 120 }).notNull(),
		kind: varchar("kind", { length: 20 }).notNull(), // phone | email | anon-cookie
		value: varchar("value", { length: 200 }).notNull(),
		block: jsonb().$type<HumanMemoryBlock>().notNull(),
		reconciledFrom: text("reconciled_from"),
		lastInteractionAt: timestamp("last_interaction_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("memory_identities_key_idx").on(table.namespace, table.kind, table.value),
	],
);

// ─── Mesa de operação (transbordo humano + agente copiloto) ──────────────────
// Spec de negócio: docs/visao/mesa-de-operacao.md. A "mesa" é fornecida pela Bevi
// hoje, mas é da administradora (Q-K5) — modelo faseado, fonte abstraída.

// Administradora — entidade interna (dossiê de operação). NÃO é fonte de
// grupos/ofertas (Bevi fonte única); só alimenta o copiloto. Casa por nome/código
// com beviProposals.administradora (varchar hoje).
export const administradoras = pgTable(
	"administradoras",
	{
		id: uuid().defaultRandom().primaryKey(),
		nome: varchar("nome", { length: 80 }).notNull().unique(),
		slug: varchar("slug", { length: 80 }).notNull().unique(),
		// match opcional com o identificador da administradora vindo da Bevi
		codigoBevi: varchar("codigo_bevi", { length: 60 }),
		isActive: boolean("is_active").default(true).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [index("administradoras_nome_idx").on(table.nome)],
);

// Documento da administradora — manual de contratação (PDF). Binário no object
// storage (storageKey); textoExtraido injetado no system prompt do copiloto.
export const administradoraDocs = pgTable(
	"administradora_docs",
	{
		id: uuid().defaultRandom().primaryKey(),
		administradoraId: uuid("administradora_id")
			.notNull()
			.references(() => administradoras.id, { onDelete: "cascade" }),
		titulo: varchar("titulo", { length: 160 }).notNull(),
		tipo: administradoraDocTipoEnum("tipo").default("manual").notNull(),
		// chave no object storage (MinIO local / S3 prod) do PDF original
		storageKey: text("storage_key").notNull(),
		// texto extraído do PDF — contexto do copiloto (nullable até a extração rodar)
		textoExtraido: text("texto_extraido"),
		versao: integer("versao").default(1).notNull(),
		isActive: boolean("is_active").default(true).notNull(),
		uploadedBy: text("uploaded_by").references(() => user.id),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [index("administradora_docs_administradora_id_idx").on(table.administradoraId)],
);

// Atendente de mesa — cadastro SIMPLES (nome + whatsapp, SEM login). Distinto do
// user role=attendant (handoff de chat). whatsapp = chave de roteamento do copiloto.
export const mesaAttendants = pgTable(
	"mesa_attendants",
	{
		id: uuid().defaultRandom().primaryKey(),
		nome: varchar("nome", { length: 100 }).notNull(),
		// E.164 sem '+' (ex.: 5562999998888) — chave única de roteamento WhatsApp
		whatsapp: varchar("whatsapp", { length: 32 }).notNull().unique(),
		isActive: boolean("is_active").default(true).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [index("mesa_attendants_whatsapp_idx").on(table.whatsapp)],
);

// Transbordo — registro de um caso enviado do kanban pra um atendente de mesa.
export const mesaHandoffs = pgTable(
	"mesa_handoffs",
	{
		id: uuid().defaultRandom().primaryKey(),
		leadId: uuid("lead_id")
			.notNull()
			.references(() => leads.id, { onDelete: "cascade" }),
		conversationId: uuid("conversation_id").references(() => conversations.id, {
			onDelete: "set null",
		}),
		// a cota/oferta escolhida que define a administradora do dossiê
		beviProposalId: uuid("bevi_proposal_id").references(() => beviProposals.id, {
			onDelete: "set null",
		}),
		// FIX-125 (D16): nullable = estado "sem dono". O transbordo nasce sem dono no
		// broadcast; o 1º atendente que clica "Vou atender" assume via claim atômico
		// (UPDATE ... WHERE mesa_attendant_id IS NULL). Espelha conversations.handedOffUserId.
		mesaAttendantId: uuid("mesa_attendant_id").references(() => mesaAttendants.id),
		administradoraId: uuid("administradora_id").references(() => administradoras.id, {
			onDelete: "set null",
		}),
		status: mesaHandoffStatusEnum("status").default("aberto").notNull(),
		// admin (user) que disparou o transbordo
		createdBy: text("created_by").references(() => user.id),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		closedAt: timestamp("closed_at", { withTimezone: true }),
	},
	(table) => [
		index("mesa_handoffs_lead_id_idx").on(table.leadId),
		index("mesa_handoffs_mesa_attendant_id_idx").on(table.mesaAttendantId),
		index("mesa_handoffs_status_idx").on(table.status),
	],
);

// Conversa copiloto ↔ atendente (orientação de contratação no WhatsApp do atendente).
export const mesaCopilotMessages = pgTable(
	"mesa_copilot_messages",
	{
		id: uuid().defaultRandom().primaryKey(),
		mesaHandoffId: uuid("mesa_handoff_id")
			.notNull()
			.references(() => mesaHandoffs.id, { onDelete: "cascade" }),
		role: mesaCopilotRoleEnum("role").notNull(),
		content: text().notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [index("mesa_copilot_messages_handoff_id_idx").on(table.mesaHandoffId)],
);

// ─── Documentos do cliente (S3 nosso = fonte da verdade) ─────────────────────
// FIX-82: o documento do cliente (RG/CNH/comprovante) é um ATIVO NOSSO,
// independente do destino (Bevi Trilho A/B ou mesa manual) — bucket dedicado
// (SSE-KMS), nunca o de administradora-docs. `status` descreve o ativo guardado;
// `dispatchStatus`/`dispatchTarget` descrevem o envio best-effort ao destino
// (FIX-84) — falha de despacho NUNCA apaga/perde o documento guardado.
export const clientDocuments = pgTable(
	"client_documents",
	{
		id: uuid().defaultRandom().primaryKey(),
		conversationId: uuid("conversation_id")
			.notNull()
			.references(() => conversations.id, { onDelete: "cascade" }),
		// Nullable: o lead/contato pode ainda não existir no momento da coleta.
		leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
		contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
		slot: clientDocumentSlotEnum("slot").notNull(),
		s3Bucket: text("s3_bucket").notNull(),
		s3Key: text("s3_key").notNull(),
		filename: text("filename").notNull(),
		mimeType: text("mime_type").notNull(),
		sizeBytes: integer("size_bytes").notNull(),
		status: clientDocumentStatusEnum("status").default("stored").notNull(),
		dispatchStatus: clientDocumentDispatchStatusEnum("dispatch_status")
			.default("pending")
			.notNull(),
		dispatchTarget: clientDocumentDispatchTargetEnum("dispatch_target"),
		dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
		// sectionId/documentId da Bevi quando efetivamente enviado (bevi_a/b).
		beviRef: jsonb("bevi_ref").$type<Record<string, unknown>>(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("client_documents_lead_id_idx").on(table.leadId),
		index("client_documents_conversation_id_idx").on(table.conversationId),
	],
);

// Audit trail de acesso (FIX-83) — PII de identidade exige log de quem baixou e
// quando, na mesma linha de leadEvents/memoryEvents (append-only, nunca editado).
export const clientDocumentDownloads = pgTable(
	"client_document_downloads",
	{
		id: uuid().defaultRandom().primaryKey(),
		clientDocumentId: uuid("client_document_id")
			.notNull()
			.references(() => clientDocuments.id, { onDelete: "cascade" }),
		downloadedBy: text("downloaded_by")
			.notNull()
			.references(() => user.id),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [index("client_document_downloads_client_document_id_idx").on(table.clientDocumentId)],
);

// ─── WhatsApp Message Templates (Meta oficial) ───────────────────────────────
// Design: docs/design/specs/2026-07-02-whatsapp-templates-meta-design.md.

// Um componente de template no vocabulário da Cloud API da Meta (o array que a
// Meta espera em `components` tanto na CRIAÇÃO quanto no ENVIO). Tipado frouxo
// de propósito: HEADER/BODY/FOOTER/BUTTONS têm formas distintas (texto,
// exemplos de placeholder, botões) e a Meta evolui o shape — travar cada
// variante aqui seria fricção sem ganho (não há consumer SQL que valide).
export type WhatsappTemplateComponent = {
	type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
	format?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
	text?: string;
	example?: Record<string, unknown>;
	buttons?: Array<Record<string, unknown>>;
};

// Template registrado na Meta, com status acompanhável até APPROVED e vínculo
// de USO por chave lógica (`usageKey`, ex: `confirmacao_contratacao`). O código
// dispara pela chave; o admin liga a chave ao template Meta aprovado — copy e
// aprovação ficam desacopladas de deploy (spec §Abordagens consideradas).
export const whatsappTemplates = pgTable(
	"whatsapp_templates",
	{
		id: uuid().defaultRandom().primaryKey(),
		// Chave lógica do ponto de disparo. Nullable: um template pode existir
		// (cadastrado/aprovado) sem estar vinculado a um uso ainda. UNIQUE quando
		// setado (unique index — o Postgres trata NULLs como distintos, então
		// vários templates sem chave coexistem, mas cada chave aponta pra um só).
		usageKey: text("usage_key"),
		// Nome do template na Meta (ex `aja_confirmacao_v1`) — obrigatório.
		metaName: text("meta_name").notNull(),
		language: text("language").default("pt_BR").notNull(),
		category: whatsappTemplateCategoryEnum("category"),
		// Componentes HEADER/BODY/FOOTER/BUTTONS com placeholders (shape da Meta).
		components: jsonb().$type<WhatsappTemplateComponent[]>(),
		// Corpo denormalizado pra preview rápido no admin sem parsear components.
		bodyPreview: text("body_preview"),
		status: whatsappTemplateStatusEnum("status").default("DRAFT").notNull(),
		// ID do template retornado pela Meta na submissão (chave de reconciliação
		// no webhook message_template_status_update).
		metaTemplateId: text("meta_template_id"),
		rejectionReason: text("rejection_reason"),
		submittedAt: timestamp("submitted_at", { withTimezone: true }),
		approvedAt: timestamp("approved_at", { withTimezone: true }),
		lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		// UNIQUE parcial-por-natureza: NULLs distintos ⇒ "único quando setado".
		uniqueIndex("whatsapp_templates_usage_key_idx").on(table.usageKey),
		index("whatsapp_templates_meta_template_id_idx").on(table.metaTemplateId),
		index("whatsapp_templates_status_idx").on(table.status),
	],
);

// Fila de mensagens business-initiated (janela de 24h FECHADA) pendentes de um
// template aprovado. Ao template do `usageKey` virar APPROVED (webhook/poll), o
// dispatcher esvazia a fila. Garante que nenhuma confirmação se perca (spec §6).
export const whatsappOutboundQueue = pgTable(
	"whatsapp_outbound_queue",
	{
		id: uuid().defaultRandom().primaryKey(),
		// Destino E.164 sem '+' (ex.: 5562999998888), mesmo formato do restante do canal.
		to: text("to").notNull(),
		usageKey: text("usage_key").notNull(),
		// Valores dos placeholders do template (mapeados em componentsFromParams no
		// envio). Frouxo de propósito — cada uso tem seu conjunto de variáveis.
		params: jsonb().$type<Record<string, unknown>>(),
		status: whatsappOutboundStatusEnum("status").default("pending").notNull(),
		attempts: integer("attempts").default(0).notNull(),
		lastError: text("last_error"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		sentAt: timestamp("sent_at", { withTimezone: true }),
	},
	(table) => [
		index("whatsapp_outbound_queue_usage_key_idx").on(table.usageKey),
		index("whatsapp_outbound_queue_status_idx").on(table.status),
	],
);

// ─── Relations ───────────────────────────────────────────────────────────────

// Better Auth relations
export const userRelations = relations(user, ({ one, many }) => ({
	sessions: many(session),
	accounts: many(account),
	invitedByUser: one(user, {
		fields: [user.invitedBy],
		references: [user.id],
		relationName: "userInvites",
	}),
	invitedAttendants: many(user, { relationName: "userInvites" }),
	handedOffConversations: many(conversations),
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id],
	}),
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id],
	}),
}));

// Application relations
export const contactsRelations = relations(contacts, ({ many }) => ({
	conversations: many(conversations),
	leads: many(leads),
	beviProposals: many(beviProposals),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
	messages: many(messages),
	leads: many(leads),
	insights: many(leadInsights),
	evaluations: many(conversationEvaluations),
	beviProposals: many(beviProposals),
	contact: one(contacts, {
		fields: [conversations.contactId],
		references: [contacts.id],
	}),
	handedOffUser: one(user, {
		fields: [conversations.handedOffUserId],
		references: [user.id],
	}),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
	conversation: one(conversations, {
		fields: [messages.conversationId],
		references: [conversations.id],
	}),
	artifacts: many(artifacts),
}));

export const artifactsRelations = relations(artifacts, ({ one }) => ({
	message: one(messages, {
		fields: [artifacts.messageId],
		references: [messages.id],
	}),
}));

export const leadsRelations = relations(leads, ({ one, many }) => ({
	conversation: one(conversations, {
		fields: [leads.conversationId],
		references: [conversations.id],
	}),
	contact: one(contacts, {
		fields: [leads.contactId],
		references: [contacts.id],
	}),
	events: many(leadEvents),
	insights: many(leadInsights),
}));

export const leadEventsRelations = relations(leadEvents, ({ one }) => ({
	lead: one(leads, {
		fields: [leadEvents.leadId],
		references: [leads.id],
	}),
}));

export const beviProposalsRelations = relations(beviProposals, ({ one }) => ({
	conversation: one(conversations, {
		fields: [beviProposals.conversationId],
		references: [conversations.id],
	}),
	lead: one(leads, {
		fields: [beviProposals.leadId],
		references: [leads.id],
	}),
	contact: one(contacts, {
		fields: [beviProposals.contactId],
		references: [contacts.id],
	}),
}));

export const leadInsightsRelations = relations(leadInsights, ({ one }) => ({
	lead: one(leads, {
		fields: [leadInsights.leadId],
		references: [leads.id],
	}),
	conversation: one(conversations, {
		fields: [leadInsights.conversationId],
		references: [conversations.id],
	}),
}));

export const conversationEvaluationsRelations = relations(conversationEvaluations, ({ one }) => ({
	conversation: one(conversations, {
		fields: [conversationEvaluations.conversationId],
		references: [conversations.id],
	}),
	evaluatedUntilMessage: one(messages, {
		fields: [conversationEvaluations.evaluatedUntilMessageId],
		references: [messages.id],
	}),
}));

export const memoryEventsRelations = relations(memoryEvents, ({ one }) => ({
	conversation: one(conversations, {
		fields: [memoryEvents.conversationId],
		references: [conversations.id],
	}),
}));

// Mesa de operação relations
export const administradorasRelations = relations(administradoras, ({ many }) => ({
	docs: many(administradoraDocs),
	handoffs: many(mesaHandoffs),
}));

export const administradoraDocsRelations = relations(administradoraDocs, ({ one }) => ({
	administradora: one(administradoras, {
		fields: [administradoraDocs.administradoraId],
		references: [administradoras.id],
	}),
	uploadedByUser: one(user, {
		fields: [administradoraDocs.uploadedBy],
		references: [user.id],
	}),
}));

export const mesaAttendantsRelations = relations(mesaAttendants, ({ many }) => ({
	handoffs: many(mesaHandoffs),
}));

export const mesaHandoffsRelations = relations(mesaHandoffs, ({ one, many }) => ({
	lead: one(leads, { fields: [mesaHandoffs.leadId], references: [leads.id] }),
	conversation: one(conversations, {
		fields: [mesaHandoffs.conversationId],
		references: [conversations.id],
	}),
	beviProposal: one(beviProposals, {
		fields: [mesaHandoffs.beviProposalId],
		references: [beviProposals.id],
	}),
	mesaAttendant: one(mesaAttendants, {
		fields: [mesaHandoffs.mesaAttendantId],
		references: [mesaAttendants.id],
	}),
	administradora: one(administradoras, {
		fields: [mesaHandoffs.administradoraId],
		references: [administradoras.id],
	}),
	createdByUser: one(user, {
		fields: [mesaHandoffs.createdBy],
		references: [user.id],
	}),
	copilotMessages: many(mesaCopilotMessages),
}));

export const mesaCopilotMessagesRelations = relations(mesaCopilotMessages, ({ one }) => ({
	handoff: one(mesaHandoffs, {
		fields: [mesaCopilotMessages.mesaHandoffId],
		references: [mesaHandoffs.id],
	}),
}));

export const clientDocumentsRelations = relations(clientDocuments, ({ one, many }) => ({
	conversation: one(conversations, {
		fields: [clientDocuments.conversationId],
		references: [conversations.id],
	}),
	lead: one(leads, {
		fields: [clientDocuments.leadId],
		references: [leads.id],
	}),
	contact: one(contacts, {
		fields: [clientDocuments.contactId],
		references: [contacts.id],
	}),
	downloads: many(clientDocumentDownloads),
}));

export const clientDocumentDownloadsRelations = relations(clientDocumentDownloads, ({ one }) => ({
	document: one(clientDocuments, {
		fields: [clientDocumentDownloads.clientDocumentId],
		references: [clientDocuments.id],
	}),
	downloadedByUser: one(user, {
		fields: [clientDocumentDownloads.downloadedBy],
		references: [user.id],
	}),
}));
