import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { GroupSummary } from "@/lib/adapters/types";
import { rankGroups, type ScoringInput } from "./recommendation";

const readSource = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf-8");

// ============================================================================
// FIX-193 (refino tela recomendação, 2026-07-01, spec §3.2): tipoOferta é
// critério INVISÍVEL de ranking. O mesmo grupo aparece em >1 modalidade
// (SPECIAL_OFFER + FREE_BID) e hoje pode DUPLICAR. Decisão:
//   (a) dedup por (administradora + grupo) — nunca o mesmo grupo 2x;
//   (b) afinidade de lance no desempate (hasLance → prioriza FREE_BID);
//   (c) tipoOferta/grupo NUNCA vazam pro payload de UI (Camada 1 no
//       recommendation-payload.test.ts + offer-mapper.test.ts).
// Cenário de aceite: §7.5.
// ============================================================================

function g(over: Partial<GroupSummary> & Pick<GroupSummary, "id">): GroupSummary {
	return {
		administradora: "CANOPUS",
		category: "auto",
		creditValue: 300_000,
		monthlyPayment: 3_000,
		adminFeePercent: 15,
		termMonths: 96,
		totalParticipants: 0,
		availableSlots: 0,
		contemplationRate: 0,
		...over,
	};
}

const input: ScoringInput = { budget: 3_500, desiredTermMonths: 96 };

describe("FIX-193 — dedup por (administradora + grupo)", () => {
	it("§7.5 — mesmo grupo em SPECIAL_OFFER e FREE_BID aparece UMA vez", () => {
		const groups = [
			g({ id: "q-special", grupo: "8120", tipoOferta: "SPECIAL_OFFER" }),
			g({ id: "q-freebid", grupo: "8120", tipoOferta: "FREE_BID" }),
			g({
				id: "q-outro",
				administradora: "BANCO DO BRASIL",
				grupo: "1797",
				tipoOferta: "SPECIAL_OFFER",
			}),
		];
		const ranked = rankGroups(groups, input);
		// CANOPUS grupo 8120 colapsa em 1; BB grupo 1797 fica → 2 no total.
		expect(ranked).toHaveLength(2);
		const canopus = ranked.filter((r) => r.group.administradora === "CANOPUS");
		expect(canopus).toHaveLength(1);
	});

	it("administradoras iguais mas GRUPOS diferentes NÃO são deduplicados", () => {
		const groups = [
			g({ id: "q-8120", grupo: "8120", tipoOferta: "SPECIAL_OFFER" }),
			g({ id: "q-8320", grupo: "8320", tipoOferta: "FREE_BID", contemplationRate: 1 }),
		];
		const ranked = rankGroups(groups, input);
		expect(ranked).toHaveLength(2);
	});

	it("desempate: com hasLance, entre modalidades do MESMO grupo (score empatado) sobrevive a FREE_BID", () => {
		// Mesmos números → score empatado; só o tipoOferta difere.
		const groups = [
			g({ id: "q-special", grupo: "8120", tipoOferta: "SPECIAL_OFFER" }),
			g({ id: "q-freebid", grupo: "8120", tipoOferta: "FREE_BID" }),
		];
		const comLance = rankGroups(groups, { ...input, hasLance: true });
		expect(comLance).toHaveLength(1);
		expect(comLance[0].group.id).toBe("q-freebid");
	});

	it("sem hasLance, o desempate NÃO promove FREE_BID (mantém estável / por score)", () => {
		const groups = [
			g({ id: "q-special", grupo: "8120", tipoOferta: "SPECIAL_OFFER" }),
			g({ id: "q-freebid", grupo: "8120", tipoOferta: "FREE_BID" }),
		];
		const semLance = rankGroups(groups, input);
		expect(semLance).toHaveLength(1);
		// score empatado + sem afinidade → mantém o 1º (SPECIAL, ordem de entrada).
		expect(semLance[0].group.id).toBe("q-special");
	});

	it("grupo AUSENTE (shape sem grupo) → não dedupa por grupo (preserva FIX-56)", () => {
		const groups = [
			g({ id: "a", administradora: "Porto", contemplationRate: 8 }),
			g({ id: "b", administradora: "Porto", contemplationRate: 7 }),
		];
		// sem grupo, os dois sobrevivem à dedup-por-grupo (a diversificação FIX-56 só
		// atua com topN finito) — nada é descartado no default sem teto.
		const ranked = rankGroups(groups, input);
		expect(ranked).toHaveLength(2);
	});
});

describe("FIX-193 — hasLance é plumbado do perfil (nunca da LLM)", () => {
	it("o builder deriva hasLance do meta.qualifyAnswers e passa pro buildConsorcioTools", () => {
		const builder = readSource("src/lib/agent/agents/builder.ts");
		expect(builder).toMatch(/hasLance:\s*opts\.meta\?\.qualifyAnswers\?\.hasLance === "yes"/);
	});

	it("recommend_groups repassa hasLance do CONTEXTO pra executeRecommendGroups (não do input)", () => {
		const tools = readSource("src/lib/agent/tools/ai-sdk.ts");
		// FIX-289: a chamada ganhou seedGroups (cache de search_groups do mesmo
		// turno) ao lado de hasLance — ambos seguem vindo do CONTEXTO/closure,
		// nunca do input schema da tool (ver asserção abaixo).
		expect(tools).toMatch(/executeRecommendGroups\(adapter, args, \{ hasLance, seedGroups \}\)/);
		// hasLance NÃO entra no schema da tool (não é input da LLM).
		const recSchema =
			tools.match(/const recommendGroupsSchema = z\.object\(\{[\s\S]*?\n\}\);/)?.[0] ?? "";
		expect(recSchema).not.toContain("hasLance");
	});
});
