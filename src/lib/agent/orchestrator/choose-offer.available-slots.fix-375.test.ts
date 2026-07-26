// FIX-375 — segunda ocorrência da lacuna do FIX-374, achada ao vivo na MESMA
// campanha (persona "carro, decidido", conversa bb277bd9): mesmo depois de
// `discovery.ts` passar a propagar `availableSlots` no snapshot inicial do
// reveal, `buildScarcityCard` continuava vendo `recommendedOffer` sem o
// campo — porque `advanceFunnelNode` RECONSTRÓI `recommendedOffer` do zero
// sempre que o cliente NOMEIA a administradora ("Bora fechar com o Itaú",
// exatamente a frase de um cliente decidido), usando `ChosenOffer`
// (`resolveAdministradoraMentionForConversation` → `listShownOffers` →
// `pickOffer`), e `pickOffer` tinha a MESMA omissão do FIX-374: copia
// administradora/creditValue/termMonths/monthlyPayment/avgBidValue do
// payload persistido, mas nunca `availableSlots` — mesmo esse campo estando
// presente nos artifacts reais (`recommendation-payload.ts` grava
// `out.availableSlots = group.availableSlots` no `recommendation_card`/
// `group_card`). Confirmado via query direta: `recommendedOffer` da conversa
// bb277bd9 tinha `origem: "mencao"` e nenhuma chave `availableSlots`, mesmo
// com o FIX-374 já aplicado.
import { describe, expect, it } from "vitest";
import { listShownOffers } from "./choose-offer";

describe("FIX-375 — listShownOffers/pickOffer propaga availableSlots real do artifact", () => {
	it("recommendation_card com availableSlots real sobrevive no ChosenOffer", () => {
		const rows = [
			{
				type: "recommendation_card",
				payload: {
					id: "grupo-itau-1",
					administradora: "ITAÚ",
					creditValue: 71_043,
					termMonths: 49,
					monthlyPayment: 1_727.07,
					avgBidValue: 49_801.14,
					availableSlots: 5,
				},
			},
		];

		const [offer] = listShownOffers(rows);

		expect(offer.availableSlots).toBe(5);
	});

	it("group_card sem availableSlots (dado upstream ausente) mantém undefined — nunca fabrica", () => {
		const rows = [
			{
				type: "group_card",
				payload: {
					id: "grupo-tradicao-1",
					administradora: "TRADIÇÃO",
					creditValue: 31_539,
					termMonths: 61,
					monthlyPayment: 699.88,
				},
			},
		];

		const [offer] = listShownOffers(rows);

		expect(offer.availableSlots).toBeUndefined();
	});

	it("comparison_table (grupos dentro de payload.groups) também propaga availableSlots", () => {
		const rows = [
			{
				type: "comparison_table",
				payload: {
					groups: [
						{ id: "grupo-bb-1", administradora: "BANCO DO BRASIL", availableSlots: 3 },
						{ id: "grupo-ancora-1", administradora: "ÂNCORA", availableSlots: 0 },
					],
				},
			},
		];

		const offers = listShownOffers(rows);

		expect(offers.find((o) => o.groupId === "grupo-bb-1")?.availableSlots).toBe(3);
		expect(offers.find((o) => o.groupId === "grupo-ancora-1")?.availableSlots).toBe(0);
	});
});
