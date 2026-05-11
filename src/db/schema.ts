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
	serial,
	text,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";

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
		waId: varchar("wa_id", { length: 32 }),
		channel: channelEnum().default("web").notNull(),
		status: conversationStatusEnum().default("active").notNull(),
		handedOffUserId: text("handed_off_user_id").references(() => user.id),
		contactName: varchar("contact_name", { length: 100 }),
		metadata: jsonb().$type<Record<string, unknown>>(),
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
	(table) => [
		index("messages_conversation_persona_idx").on(table.conversationId, table.personaId),
	],
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
export type PersonaExample = {
	id: string;
	context?: string | null;
	userMessage: string;
	assistantResponse: string;
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
			sql`${table.category} IS NULL OR ${table.category} IN ('imovel', 'auto', 'servicos')`,
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

export const personaVersions = pgTable(
	"persona_versions",
	{
		id: serial("id").primaryKey(),
		personaId: text("persona_id")
			.notNull()
			.references(() => personas.id, { onDelete: "cascade" }),
		version: integer("version").notNull(),
		snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
		changedBy: text("changed_by").references((): AnyPgColumn => user.id),
		changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [index("persona_versions_persona_id_idx").on(table.personaId)],
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
}));

export const leadEventsRelations = relations(leadEvents, ({ one }) => ({
	lead: one(leads, {
		fields: [leadEvents.leadId],
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

export const personasRelations = relations(personas, ({ many }) => ({
	versions: many(personaVersions),
}));

export const personaVersionsRelations = relations(personaVersions, ({ one }) => ({
	persona: one(personas, {
		fields: [personaVersions.personaId],
		references: [personas.id],
	}),
	changedByUser: one(user, {
		fields: [personaVersions.changedBy],
		references: [user.id],
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
