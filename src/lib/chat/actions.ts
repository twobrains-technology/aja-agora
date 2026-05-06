import type { Category, ExperiencePrev } from "@/lib/agent/personas";

/**
 * Single source of truth for all client → server actions in the chat.
 * Used by both `provider.tsx` (sendAction) and `/api/chat/route.ts` (handler).
 *
 * Adding a new action: extend this union — both call sites get it for free.
 */
export type ChatAction =
	| { kind: "gate"; gate: "experience"; value: ExperiencePrev; label: string }
	| { kind: "gate"; gate: "consent"; value: "yes" | "more"; label: string }
	| {
			kind: "gate";
			gate: "credit";
			value: { credit: number; monthlyBudget: number };
			label: string;
	  }
	| { kind: "gate"; gate: "timeframe"; value: { prazoMeses: number }; label: string }
	| { kind: "gate"; gate: "lance"; value: "yes" | "maybe" | "no"; label: string }
	| { kind: "category"; category: Category }
	| {
			kind: "select-group";
			groupId: string;
			administradora: string;
			creditValue: number;
			termMonths: number;
			label: string;
	  }
	| { kind: "interest"; administradora: string; label: string };
