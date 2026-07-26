// FIX-367 (bloco-i, investigação): o card de escassez pós-reveal
// (buildScarcityCard) resolve o grupo via `meta.recommendedOffer` — mas esse
// snapshot (RecommendedOfferSnapshot) NUNCA carregou `availableSlots`, mesmo
// quando a oferta real da Bevi trouxe o dado no reveal (recommendation_card/
// group_card). Resultado: `coerceScarcityPayload` sempre recebia um grupo sem
// `availableSlots` e o card ficava IMPOSSÍVEL de renderizar com número real —
// não por falta de dado da Bevi (teoria "c" do fix doc), mas por o código
// nunca propagar o dado que a Bevi já tinha devolvido (teoria "b" real).
import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { buildScarcityCard } from "./server-cards";

const baseOffer: NonNullable<ConversationMetadata["recommendedOffer"]> = {
	administradora: "ITAÚ",
	creditValue: 81_973,
	termMonths: 80,
	monthlyPayment: 1_200,
	groupId: "6a0ca9c83e68cce9b61d3617",
};

describe("FIX-367 — buildScarcityCard propaga availableSlots real do snapshot ancorado", () => {
	it("grupo ancorado COM availableSlots real no snapshot → card mostra o número real", () => {
		const meta: ConversationMetadata = {
			recommendedOffer: { ...baseOffer, availableSlots: 1 },
		} as ConversationMetadata;

		const card = buildScarcityCard(meta);

		expect(card).not.toBeNull();
		expect(card?.payload.availableSlots).toBe(1);
		expect(card?.payload.groupCode).toBe(baseOffer.groupId);
	});

	// FIX-369 (rodada 2, root cause real do "0/3 personas nunca viram o card"):
	// antes deste fix, esta linha era `expect(card).not.toBeNull()` — o server
	// emitia (persistia + mandava no stream) um card `scarcity` SEM número real,
	// que o componente React (`Scarcity`, scarcity.tsx) sempre renderizava como
	// `null` na tela. Card "existia" tecnicamente, mas nunca aparecia — 0/3
	// personas viram, mesmo com a cascata determinística disparando certinho.
	// Agora `buildScarcityCard` espelha a MESMA condição do componente e não
	// emite nada — nunca fabrica, e também nunca emite o que não vai renderizar.
	it("grupo ancorado SEM availableSlots no snapshot → null (nunca fabrica, nunca emite card fantasma)", () => {
		const meta: ConversationMetadata = {
			recommendedOffer: { ...baseOffer },
		} as ConversationMetadata;

		expect(buildScarcityCard(meta)).toBeNull();
	});

	it("sem groupId ancorado → null (comportamento existente, intacto)", () => {
		const meta: ConversationMetadata = {
			recommendedOffer: { ...baseOffer, groupId: undefined },
		} as ConversationMetadata;

		expect(buildScarcityCard(meta)).toBeNull();
	});
});
