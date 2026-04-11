import {
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Enums
export const messageRoleEnum = pgEnum("message_role", [
	"user",
	"assistant",
	"system",
]);

export const artifactTypeEnum = pgEnum("artifact_type", [
	"group_card",
	"comparison_table",
	"simulation_result",
	"recommendation_card",
	"lead_form",
]);

// Conversations
export const conversations = pgTable("conversations", {
	id: uuid().defaultRandom().primaryKey(),
	metadata: jsonb().$type<Record<string, unknown>>(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

// Messages
export const messages = pgTable("messages", {
	id: uuid().defaultRandom().primaryKey(),
	conversationId: uuid("conversation_id")
		.notNull()
		.references(() => conversations.id, { onDelete: "cascade" }),
	role: messageRoleEnum().notNull(),
	content: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

// Artifacts
export const artifacts = pgTable("artifacts", {
	id: uuid().defaultRandom().primaryKey(),
	messageId: uuid("message_id")
		.notNull()
		.references(() => messages.id, { onDelete: "cascade" }),
	type: artifactTypeEnum().notNull(),
	payload: jsonb().notNull().$type<Record<string, unknown>>(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
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
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
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
