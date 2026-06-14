// Camada 1 (unit, puro) — FIX-45: dedup do kanban por contato.

import { describe, expect, it } from "vitest";
import { type DedupableLead, dedupLeadsByContact } from "./kanban-dedup";

const lead = (over: Partial<DedupableLead> & { id: string }): DedupableLead => ({
	contactId: null,
	stage: "novo",
	updatedAt: "2026-06-14T00:00:00Z",
	conversation: { channel: "web" },
	...over,
});

describe("dedupLeadsByContact", () => {
	it("mesmo contato em web + WhatsApp vira UM card com 2 canais", () => {
		const cards = dedupLeadsByContact([
			lead({ id: "a", contactId: "c1", conversation: { channel: "web" }, stage: "qualificado" }),
			lead({ id: "b", contactId: "c1", conversation: { channel: "whatsapp" }, stage: "engajado" }),
		]);
		expect(cards.length).toBe(1);
		expect([...cards[0].channels].sort()).toEqual(["web", "whatsapp"]);
	});

	it("representante = raia mais avançada", () => {
		const cards = dedupLeadsByContact([
			lead({ id: "a", contactId: "c1", stage: "engajado" }),
			lead({ id: "b", contactId: "c1", stage: "proposta_enviada" }),
		]);
		expect(cards[0].id).toBe("b");
		expect(cards[0].stage).toBe("proposta_enviada");
	});

	it("leads anônimos (sem contactId) ficam individuais", () => {
		const cards = dedupLeadsByContact([
			lead({ id: "a", contactId: null }),
			lead({ id: "b", contactId: null }),
		]);
		expect(cards.length).toBe(2);
		expect(cards.every((c) => c.channels.length === 1)).toBe(true);
	});

	it("mistura: 1 contato deduplicado + 1 anônimo = 2 cards", () => {
		const cards = dedupLeadsByContact([
			lead({ id: "a", contactId: "c1" }),
			lead({ id: "b", contactId: "c1" }),
			lead({ id: "c", contactId: null }),
		]);
		expect(cards.length).toBe(2);
	});
});
