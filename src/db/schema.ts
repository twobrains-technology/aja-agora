import { relations } from "drizzle-orm";
import { boolean, index, jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid, varchar, type AnyPgColumn } from "drizzle-orm/pg-core";

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

export const conversationStatusEnum = pgEnum("conversation_status", ["active", "handed_off", "closed"]);

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
export const conversations = pgTable("conversations", {
	id: uuid().defaultRandom().primaryKey(),
	waId: varchar("wa_id", { length: 32 }),
	channel: channelEnum().default("web").notNull(),
	status: conversationStatusEnum().default("active").notNull(),
	handedOffUserId: text("handed_off_user_id").references(() => user.id),
	contactName: varchar("contact_name", { length: 100 }),
	metadata: jsonb().$type<Record<string, unknown>>(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("conversations_wa_id_idx").on(table.waId),
	index("conversations_handed_off_user_id_idx").on(table.handedOffUserId),
]);

// Messages
export const messages = pgTable("messages", {
	id: uuid().defaultRandom().primaryKey(),
	conversationId: uuid("conversation_id")
		.notNull()
		.references(() => conversations.id, { onDelete: "cascade" }),
	role: messageRoleEnum().notNull(),
	content: text().notNull(),
	channel: channelEnum().default("web").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

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
export const leads = pgTable("leads", {
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
}, (table) => [
	index("leads_created_at_idx").on(table.createdAt),
]);

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

// Lead Insights (AI-generated insights cache)
export const leadInsights = pgTable("lead_insights", {
	id: uuid().defaultRandom().primaryKey(),
	leadId: uuid("lead_id")
		.notNull()
		.references(() => leads.id, { onDelete: "cascade" }),
	insightType: insightTypeEnum("insight_type").notNull(),
	content: text().notNull(),
	generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
	model: varchar("model", { length: 100 }),
});

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
}));
