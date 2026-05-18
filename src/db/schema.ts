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
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import type { Category, ExpertiseLevel } from "@/lib/agent/personas";
import type { UserIntent } from "@/lib/agent/qualify-state";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const messageRoleEnum = pgEnum("message_role", ["user", "assistant", "system"]);

export const artifactTypeEnum = pgEnum("artifact_type", [
	"group_card",
	"comparison_table",
	"simulation_result",
	"recommendation_card",
	"lead_form",
]);

export const channelEnum = pgEnum("channel", ["web", "whatsapp"]);

export const conversationStatusEnum = pgEnum("conversation_status", [
	"active",
	"handed_off",
	"closed",
]);

export const leadStageEnum = pgEnum("lead_stage", [
	"novo",
	"engajado",
	"qualificado",
	"em_negociacao",
	"proposta_enviada",
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

// ─── Funnel Automations Enums ────────────────────────────────────────────────

export const whatsappTemplateStatusEnum = pgEnum("whatsapp_template_status", [
	"DRAFT", // criado local, ainda não submetido
	"PENDING", // submetido, aguardando review da Meta
	"APPROVED",
	"REJECTED",
	"PAUSED",
	"DISABLED",
]);

export const whatsappTemplateCategoryEnum = pgEnum("whatsapp_template_category", [
	"UTILITY",
	"MARKETING",
	"AUTHENTICATION",
]);

export const automationTriggerTypeEnum = pgEnum("automation_trigger_type", [
	"stage_changed",
	"idle_in_stage",
	"chat_event",
]);

export const automationRunStatusEnum = pgEnum("automation_run_status", [
	"pending",
	"running",
	"completed",
	"failed",
	"cancelled",
]);

export const automationNodeStatusEnum = pgEnum("automation_node_status", [
	"pending",
	"running",
	"completed",
	"failed",
	"skipped",
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

// Conversations
export const conversations = pgTable(
	"conversations",
	{
		id: uuid().defaultRandom().primaryKey(),
		waId: varchar("wa_id", { length: 50 }),
		channel: channelEnum().default("web").notNull(),
		status: conversationStatusEnum().default("active").notNull(),
		handedOffUserId: text("handed_off_user_id").references(() => user.id),
		contactName: varchar("contact_name", { length: 100 }),
		metadata: jsonb().$type<Record<string, unknown>>(),
		isSimulated: boolean("is_simulated").default(false).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("conversations_wa_id_idx").on(table.waId),
		index("conversations_handed_off_user_id_idx").on(table.handedOffUserId),
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
export const artifacts = pgTable("artifacts", {
	id: uuid().defaultRandom().primaryKey(),
	messageId: uuid("message_id")
		.notNull()
		.references(() => messages.id, { onDelete: "cascade" }),
	type: artifactTypeEnum().notNull(),
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
		name: text(),
		phone: text(),
		email: text(),
		stage: leadStageEnum("stage").default("novo").notNull(),
		creditValue: numeric("credit_value", { precision: 12, scale: 2 }),
		isSimulated: boolean("is_simulated").default(false).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [index("leads_created_at_idx").on(table.createdAt)],
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

// Lead Notes — anotações livres no lead (manual ou via action.add_note).
export const leadNotes = pgTable(
	"lead_notes",
	{
		id: uuid().defaultRandom().primaryKey(),
		leadId: uuid("lead_id")
			.notNull()
			.references(() => leads.id, { onDelete: "cascade" }),
		body: text().notNull(),
		// "admin" (manual) | "automation" (via action.add_note) | "system"
		source: text().default("admin").notNull(),
		automationRunId: uuid("automation_run_id"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [index("lead_notes_lead_id_idx").on(table.leadId, table.createdAt.desc())],
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

// ─── Funnel Automations ─────────────────────────────────────────────────────

export type WhatsAppTemplateButton =
	| { type: "QUICK_REPLY"; text: string }
	| { type: "URL"; text: string; url: string; example?: string[] }
	| { type: "PHONE_NUMBER"; text: string; phone_number: string };

// Catálogo local de message templates da Meta. Espelha o estado real via
// webhook `message_template_status_update` + sync sob demanda.
export const whatsappTemplates = pgTable(
	"whatsapp_templates",
	{
		id: uuid().defaultRandom().primaryKey(),
		// Nome enviado à Meta (snake_case, único por WABA). PKey lógica.
		name: varchar({ length: 512 }).notNull().unique(),
		category: whatsappTemplateCategoryEnum().default("UTILITY").notNull(),
		language: varchar({ length: 16 }).default("pt_BR").notNull(),
		bodyText: text("body_text").notNull(),
		headerType: varchar("header_type", { length: 16 }), // TEXT | IMAGE | VIDEO | DOCUMENT | NULL
		headerValue: text("header_value"),
		footerText: text("footer_text"),
		buttons: jsonb().$type<WhatsAppTemplateButton[]>().default([]).notNull(),
		// Quantos placeholders {{n}} o body tem. Validado no save vs bodyText.
		placeholdersCount: integer("placeholders_count").default(0).notNull(),
		metaTemplateId: text("meta_template_id"),
		metaStatus: whatsappTemplateStatusEnum("meta_status").default("DRAFT").notNull(),
		metaRejectionReason: text("meta_rejection_reason"),
		submittedAt: timestamp("submitted_at", { withTimezone: true }),
		approvedAt: timestamp("approved_at", { withTimezone: true }),
		createdBy: text("created_by").references(() => user.id),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("whatsapp_templates_meta_status_idx").on(table.metaStatus),
		index("whatsapp_templates_name_idx").on(table.name),
	],
);

// Estruturas do grafo da automação. JSON livre validado por Zod na app layer
// (src/lib/automation/schema.ts). Mantemos jsonb simples no DB pra evolução
// sem migration. Veja AutomationGraph em src/lib/automation/schema.ts.
export type AutomationGraphNode = {
	id: string;
	type: string; // ex: "trigger.stage_changed", "action.send_whatsapp"
	config: Record<string, unknown>;
	// Coordenadas pro React Flow renderizar — opcionais; AI Builder pode omitir.
	position?: { x: number; y: number };
};

export type AutomationGraphEdge = {
	id: string;
	source: string; // nodeId
	target: string; // nodeId
	// Pra branches condicionais ("true" / "false") ou rótulos custom.
	label?: string;
};

export type AutomationGraph = {
	nodes: AutomationGraphNode[];
	edges: AutomationGraphEdge[];
};

export const automations = pgTable(
	"automations",
	{
		id: uuid().defaultRandom().primaryKey(),
		name: varchar({ length: 200 }).notNull(),
		description: text(),
		triggerType: automationTriggerTypeEnum("trigger_type").notNull(),
		// Config específica do trigger. Ex: { fromStages: [...], toStages: [...] }
		triggerConfig: jsonb("trigger_config").$type<Record<string, unknown>>().notNull(),
		graph: jsonb().$type<AutomationGraph>().notNull(),
		enabled: boolean().default(false).notNull(),
		// Incrementa a cada save — usado pra optimistic locking no editor e
		// pra invalidar runs em andamento de versões antigas se necessário.
		version: integer().default(1).notNull(),
		createdBy: text("created_by").references(() => user.id),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [index("automations_enabled_trigger_type_idx").on(table.enabled, table.triggerType)],
);

// Cada disparo de uma automação pra um lead específico. O dedup_key garante
// que (automation, lead, lead_event) não dispare duas vezes — idempotência.
export const automationRuns = pgTable(
	"automation_runs",
	{
		id: uuid().defaultRandom().primaryKey(),
		automationId: uuid("automation_id")
			.notNull()
			.references(() => automations.id, { onDelete: "cascade" }),
		automationVersion: integer("automation_version").notNull(),
		leadId: uuid("lead_id")
			.notNull()
			.references(() => leads.id, { onDelete: "cascade" }),
		// Trigger event que originou o run. NULL pra idle_in_stage (gerado por cron).
		leadEventId: uuid("lead_event_id").references(() => leadEvents.id, {
			onDelete: "set null",
		}),
		// Chave única que combina automation + lead + trigger pra idempotência.
		// Ex: "stage:<auto-id>:<lead-id>:<lead-event-id>" ou
		//     "idle:<auto-id>:<lead-id>:<stage>:<window-start-iso>"
		dedupKey: text("dedup_key").notNull().unique(),
		status: automationRunStatusEnum().default("pending").notNull(),
		currentNodeId: text("current_node_id"),
		stepCount: integer("step_count").default(0).notNull(),
		startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		errorMessage: text("error_message"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("automation_runs_automation_status_idx").on(table.automationId, table.status),
		index("automation_runs_lead_id_idx").on(table.leadId),
		index("automation_runs_status_idx").on(table.status),
	],
);

// Audit por nó. Permite timeline na UI de Runs e debug de falhas.
export const automationNodeExecutions = pgTable(
	"automation_node_executions",
	{
		id: uuid().defaultRandom().primaryKey(),
		runId: uuid("run_id")
			.notNull()
			.references(() => automationRuns.id, { onDelete: "cascade" }),
		nodeId: text("node_id").notNull(),
		nodeType: text("node_type").notNull(),
		status: automationNodeStatusEnum().notNull(),
		startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		// Resultado do nó — ex: { messageId: "...", channel: "whatsapp" } pra
		// send_whatsapp; { branch: "true" } pra condition; etc.
		output: jsonb().$type<Record<string, unknown>>(),
		errorMessage: text("error_message"),
	},
	(table) => [index("automation_node_executions_run_id_idx").on(table.runId)],
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
export const conversationsRelations = relations(conversations, ({ one, many }) => ({
	messages: many(messages),
	leads: many(leads),
	insights: many(leadInsights),
	evaluations: many(conversationEvaluations),
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
	events: many(leadEvents),
	insights: many(leadInsights),
	notes: many(leadNotes),
}));

export const leadEventsRelations = relations(leadEvents, ({ one }) => ({
	lead: one(leads, {
		fields: [leadEvents.leadId],
		references: [leads.id],
	}),
}));

export const leadNotesRelations = relations(leadNotes, ({ one }) => ({
	lead: one(leads, {
		fields: [leadNotes.leadId],
		references: [leads.id],
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

export const whatsappTemplatesRelations = relations(whatsappTemplates, ({ one }) => ({
	creator: one(user, {
		fields: [whatsappTemplates.createdBy],
		references: [user.id],
	}),
}));

export const automationsRelations = relations(automations, ({ many, one }) => ({
	runs: many(automationRuns),
	creator: one(user, {
		fields: [automations.createdBy],
		references: [user.id],
	}),
}));

export const automationRunsRelations = relations(automationRuns, ({ one, many }) => ({
	automation: one(automations, {
		fields: [automationRuns.automationId],
		references: [automations.id],
	}),
	lead: one(leads, {
		fields: [automationRuns.leadId],
		references: [leads.id],
	}),
	triggerEvent: one(leadEvents, {
		fields: [automationRuns.leadEventId],
		references: [leadEvents.id],
	}),
	nodeExecutions: many(automationNodeExecutions),
}));

export const automationNodeExecutionsRelations = relations(automationNodeExecutions, ({ one }) => ({
	run: one(automationRuns, {
		fields: [automationNodeExecutions.runId],
		references: [automationRuns.id],
	}),
}));
