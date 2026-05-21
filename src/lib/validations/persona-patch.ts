import { z } from "zod";
import {
	personaExampleSchema,
	personaForbiddenTopicSchema,
	personaHandoffTriggerSchema,
} from "./persona";

const baseFields = {
	rationale: z.string().min(1).max(280),
	personaVersionSeen: z.number().int().nonnegative(),
};

export const personaPatchSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("voiceTone"),
		before: z.string().min(1).max(2000),
		after: z.string().min(1).max(2000),
		...baseFields,
	}),
	z.object({
		kind: z.literal("example.add"),
		after: personaExampleSchema,
		...baseFields,
	}),
	z.object({
		kind: z.literal("example.remove"),
		targetId: z.string().min(1),
		...baseFields,
	}),
	z.object({
		kind: z.literal("forbiddenTopic.add"),
		after: personaForbiddenTopicSchema,
		...baseFields,
	}),
	z.object({
		kind: z.literal("forbiddenTopic.remove"),
		targetId: z.string().min(1),
		...baseFields,
	}),
	z.object({
		kind: z.literal("handoffTrigger.add"),
		after: personaHandoffTriggerSchema,
		...baseFields,
	}),
	z.object({
		kind: z.literal("handoffTrigger.remove"),
		targetId: z.string().min(1),
		...baseFields,
	}),
]);

export type PersonaPatch = z.infer<typeof personaPatchSchema>;
export type PersonaPatchKind = PersonaPatch["kind"];
