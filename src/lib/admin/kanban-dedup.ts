// FIX-45 — dedup do kanban por CONTATO (função pura, testável).
// O mesmo cliente em web + WhatsApp vira UM card; leads anônimos (sem contactId)
// ficam individuais. O representante do grupo é a raia mais avançada (depois o
// mais recente) — é o lead que o admin arrasta. Cada card ganha `channels[]`.

import { STAGE_ORDER } from "./lead-stages";

export interface DedupableLead {
	id: string;
	contactId?: string | null;
	stage: string;
	updatedAt: string | Date;
	conversation?: { channel?: string | null } | null;
}

export function dedupLeadsByContact<L extends DedupableLead>(
	leads: L[],
): Array<L & { channels: string[] }> {
	const stageRank = (s: string) => STAGE_ORDER.indexOf(s as (typeof STAGE_ORDER)[number]);
	const byContact = new Map<string, L[]>();
	const standalone: L[] = [];

	for (const lead of leads) {
		if (lead.contactId) {
			const arr = byContact.get(lead.contactId) ?? [];
			arr.push(lead);
			byContact.set(lead.contactId, arr);
		} else {
			standalone.push(lead);
		}
	}

	const cards: Array<L & { channels: string[] }> = [];

	for (const group of byContact.values()) {
		const rep = [...group].sort(
			(a, b) =>
				stageRank(b.stage) - stageRank(a.stage) ||
				new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
		)[0];
		const channels = [
			...new Set(group.map((l) => l.conversation?.channel).filter(Boolean) as string[]),
		];
		cards.push({ ...rep, channels });
	}
	for (const lead of standalone) {
		const channels = lead.conversation?.channel ? [lead.conversation.channel] : [];
		cards.push({ ...lead, channels });
	}

	return cards;
}
