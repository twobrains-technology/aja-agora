// O caso do atendente NÃO pode sumir do quadro dele.
//
// Achado no smoke (2026-08-10): a mesa externa abria o pipeline e via as três
// raias certas e NENHUM card — com o handoff dela ativo no banco, apontando pra
// um lead em `em_atendimento`.
//
// A causa é a ordem das operações. O kanban deduplica por CONTATO (FIX-45) e
// elege como representativo o lead MAIS AVANÇADO no funil. O contato do caso
// tinha dois leads: o do atendimento (`em_atendimento`, índice 6) e um antigo
// dado como `perdido` (índice 9 — o último da ordem). O `perdido` ganhava a
// eleição, então:
//
//   1. o card ia parar numa raia que a mesa externa não enxerga; e
//   2. o id do card passava a ser o do lead perdido, que não está entre os
//      leads do handoff dela — e o filtro de dono descartava o card.
//
// Duas maneiras de sumir com o mesmo caso. A correção é recortar PRIMEIRO os
// leads do atendente e só então deduplicar: dentro do mundo dele, o
// representativo é o lead que ele de fato atende.

import { describe, expect, it } from "vitest";
import { cardsDaMesaExterna } from "./mesa-externa-cards";

type Lead = Parameters<typeof cardsDaMesaExterna>[0][number];

function lead(over: Partial<Lead> & { id: string; stage: string }): Lead {
	return {
		contactId: null,
		updatedAt: "2026-08-10T12:00:00.000Z",
		conversation: { channel: "whatsapp" },
		...over,
	} as Lead;
}

describe("cards que a mesa externa vê", () => {
	it("o caso dela aparece mesmo com um lead PERDIDO no mesmo contato", () => {
		const cards = cardsDaMesaExterna(
			[
				lead({
					id: "lead-perdido",
					stage: "perdido",
					contactId: "contato-1",
					updatedAt: "2026-08-10T13:00:00.000Z",
				}),
				lead({ id: "lead-do-caso", stage: "em_atendimento", contactId: "contato-1" }),
			],
			["lead-do-caso"],
		);

		expect(cards).toHaveLength(1);
		expect(cards[0].id).toBe("lead-do-caso");
		expect(cards[0].stage).toBe("em_atendimento");
	});

	it("não devolve lead de outro atendente", () => {
		const cards = cardsDaMesaExterna(
			[
				lead({ id: "meu", stage: "em_atendimento" }),
				lead({ id: "do-colega", stage: "em_atendimento" }),
			],
			["meu"],
		);

		expect(cards.map((c) => c.id)).toEqual(["meu"]);
	});

	it("sem nenhum caso, devolve vazio (nunca o funil inteiro)", () => {
		const cards = cardsDaMesaExterna([lead({ id: "de-outro", stage: "em_atendimento" })], []);
		expect(cards).toEqual([]);
	});

	it("dois casos dela em contatos diferentes viram dois cards", () => {
		const cards = cardsDaMesaExterna(
			[
				lead({ id: "caso-a", stage: "em_atendimento", contactId: "c1" }),
				lead({ id: "caso-b", stage: "aguardando_pagamento", contactId: "c2" }),
			],
			["caso-a", "caso-b"],
		);

		expect(cards.map((c) => c.id).sort()).toEqual(["caso-a", "caso-b"]);
	});

	it("dois leads DELA no mesmo contato ainda viram UM card — o mais avançado", () => {
		const cards = cardsDaMesaExterna(
			[
				lead({ id: "antigo", stage: "em_atendimento", contactId: "c1" }),
				lead({ id: "atual", stage: "aguardando_pagamento", contactId: "c1" }),
			],
			["antigo", "atual"],
		);

		expect(cards).toHaveLength(1);
		expect(cards[0].id).toBe("atual");
	});

	it("o caso fechado como GANHO continua visível — ela precisa ver o que fechou", () => {
		const cards = cardsDaMesaExterna(
			[lead({ id: "ganhei", stage: "fechado_ganho", contactId: "c1" })],
			["ganhei"],
		);

		expect(cards.map((c) => c.stage)).toEqual(["fechado_ganho"]);
	});
});
