// FIX-300 (P6, loop-de-goal r10) — o `present_topic_picker` aceitava
// `topics: string[]` 100% livre; o Qwen chamou a tool no gate `decision` com
// chips "a"/"b" fabricados, e o Zod validou porque qualquer string passa. Este
// teste prova que o schema agora REJEITA qualquer id fora do catálogo
// canônico — sonda adversarial: labels arbitrárias nunca mais viram card.

import { describe, expect, it } from "vitest";
import { CANONICAL_TOPIC_IDS } from "@/lib/agent/orchestrator/topic-catalog";
import { topicPickerSchema } from "./ai-sdk";

describe("FIX-300 — present_topic_picker.topics é enum canônico, não string livre", () => {
	it("aceita 2-5 ids do catálogo canônico", () => {
		const result = topicPickerSchema.safeParse({
			topics: CANONICAL_TOPIC_IDS.slice(0, 2),
			includeBackButton: true,
		});
		expect(result.success).toBe(true);
	});

	it("REJEITA labels arbitrárias fabricadas pelo modelo ('a'/'b') — sonda adversarial do print alucinado", () => {
		const result = topicPickerSchema.safeParse({
			topics: ["a", "b"],
			includeBackButton: true,
		});
		expect(result.success).toBe(false);
	});

	it("REJEITA texto livre plausível fora do catálogo (ex.: 'quanto custa a taxa?')", () => {
		const result = topicPickerSchema.safeParse({
			topics: ["quanto custa a taxa?", "outra dúvida qualquer"],
			includeBackButton: true,
		});
		expect(result.success).toBe(false);
	});

	it("REJEITA mistura de 1 id válido + 1 fabricado", () => {
		const result = topicPickerSchema.safeParse({
			topics: [CANONICAL_TOPIC_IDS[0], "topico-inventado"],
		});
		expect(result.success).toBe(false);
	});
});
