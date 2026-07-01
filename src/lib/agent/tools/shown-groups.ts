// FIX-179 — rastreia quais grupos (id + administradora) já foram REALMENTE
// exibidos em tela pro usuário nesta conversa, via artifacts persistidos
// (comparison_table/group_card/recommendation_card/simulation_result).
//
// Usado pela trava de simulate_quota/get_group_details/present_decision_prompt
// (ver buildConsorcioTools em ai-sdk.ts): essas tools só podem operar sobre um
// grupo que já passou por um desses artifacts — nunca um grupo que só existe
// no discovery cache (visto pela LLM mas nunca renderizado pro usuário).
import { eq } from "drizzle-orm";
import { artifacts as artifactsTable, messages as messagesTable } from "@/db/schema";

export type ShownGroups = {
	ids: Set<string>;
	administradoras: Set<string>;
};

export function emptyShownGroups(): ShownGroups {
	return { ids: new Set(), administradoras: new Set() };
}

type Extracted = { ids: string[]; administradoras: string[] };

function fromSingle(payload: Record<string, unknown>, idKey: "id" | "groupId"): Extracted {
	const ids: string[] = [];
	const administradoras: string[] = [];
	const id = payload[idKey];
	if (typeof id === "string" && id.length > 0) ids.push(id);
	const admin = payload.administradora;
	if (typeof admin === "string" && admin.length > 0) administradoras.push(admin);
	return { ids, administradoras };
}

/** Extrai id(s)/administradora(s) exibidos do payload de UM artifact, pelo tipo. */
export function extractShownFromPayload(type: string, payload: unknown): Extracted {
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
		return { ids: [], administradoras: [] };
	}
	const p = payload as Record<string, unknown>;

	if (type === "comparison_table") {
		if (!Array.isArray(p.groups)) return { ids: [], administradoras: [] };
		const ids: string[] = [];
		const administradoras: string[] = [];
		for (const g of p.groups) {
			if (!g || typeof g !== "object") continue;
			const extracted = fromSingle(g as Record<string, unknown>, "id");
			ids.push(...extracted.ids);
			administradoras.push(...extracted.administradoras);
		}
		return { ids, administradoras };
	}

	if (type === "group_card" || type === "recommendation_card") {
		return fromSingle(p, "id");
	}

	if (type === "simulation_result") {
		return fromSingle(p, "groupId");
	}

	return { ids: [], administradoras: [] };
}

/** Carrega tudo que já foi exibido nesta conversa (todas as mensagens/turnos). */
export async function loadShownGroups(conversationId: string): Promise<ShownGroups> {
	const { db } = await import("@/db");
	const rows = await db
		.select({ type: artifactsTable.type, payload: artifactsTable.payload })
		.from(artifactsTable)
		.innerJoin(messagesTable, eq(artifactsTable.messageId, messagesTable.id))
		.where(eq(messagesTable.conversationId, conversationId));

	const shown = emptyShownGroups();
	for (const row of rows) {
		const extracted = extractShownFromPayload(row.type, row.payload);
		for (const id of extracted.ids) shown.ids.add(id);
		for (const admin of extracted.administradoras) shown.administradoras.add(admin);
	}
	return shown;
}
