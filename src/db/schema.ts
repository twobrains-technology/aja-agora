import { relations } from "drizzle-orm";
import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

// Enums
export const messageRoleEnum = pgEnum("message_role", ["user", "assistant", "system"]);

export const artifactTypeEnum = pgEnum("artifact_type", [
	"group_card",
	"comparison_table",
	"simulation_result",
	"recommendation_card",
	"lead_form",
]);

// Conversations
export const channelEnum = pgEnum("channel", ["web", "whatsapp"]);

export const conversationStatusEnum = pgEnum("conversation_status", ["active", "handed_off", "closed"]);

export const conversations = pgTable("conversations", {
	id: uuid().defaultRandom().primaryKey(),
	waId: varchar("wa_id", { length: 32 }),
	channel: channelEnum().default("web").notNull(),
	status: conversationStatusEnum().default("active").notNull(),
	handedOffTo: varchar("handed_off_to", { length: 32 }),
	agentName: varchar("agent_name", { length: 100 }),
	contactName: varchar("contact_name", { length: 100 }),
	metadata: jsonb().$type<Record<string, unknown>>(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("conversations_wa_id_idx").on(table.waId),
	index("conversations_handed_off_to_idx").on(table.handedOffTo),
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
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Relations
export const conversationsRelations = relations(conversations, ({ many }) => ({
	messages: many(messages),
	leads: many(leads),
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

export const leadsRelations = relations(leads, ({ one }) => ({
	conversation: one(conversations, {
		fields: [leads.conversationId],
		references: [conversations.id],
	}),
}));
