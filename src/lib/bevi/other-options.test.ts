// "OUTRAS OPÇÕES" É A MESMA BUSCA, SEM A CARTA EM FOCO (L45/P177/P178/P185).
//
// Dois defeitos medidos:
//  1. o filtro mudava — ia só `creditMin`/`creditMax`, então quem tinha buscado
//     por PARCELA recebia cartas de outro orçamento (FIX-382);
//  2. a carta recomendada/recusada voltava como "outra opção" sempre que os
//     números do snapshot divergiam dela, porque a exclusão era só pela chave de
//     equivalência.

import { afterEach, describe, expect, it } from "vitest";
import { __setDiscoveryAdapterFactoryForTests } from "@/lib/adapters";
import type { GroupSummary, SearchGroupsParams } from "@/lib/adapters/types";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { buildOtherOptions, paramsDasOutrasOpcoes } from "./other-options";

const CARTA_EM_FOCO: GroupSummary = {
	id: "cota-em-foco",
	administradora: "ITAÚ",
	category: "auto",
	creditValue: 92_902,
	monthlyPayment: 1_450,
	adminFeePercent: 18,
	termMonths: 100,
	totalParticipants: 1_200,
	availableSlots: 9,
};

const OUTRA_CARTA: GroupSummary = {
	...CARTA_EM_FOCO,
	id: "cota-outra",
	administradora: "CANOPUS",
	creditValue: 88_000,
	monthlyPayment: 1_380,
	termMonths: 96,
};

/** Adapter de fixture na fronteira: devolve as cartas e GUARDA os parâmetros da
 * busca — é por eles que se prova que o filtro é o mesmo. */
function adapterDeFixture(cartas: GroupSummary[]) {
	const buscas: SearchGroupsParams[] = [];
	__setDiscoveryAdapterFactoryForTests(() => ({
		searchGroups: async (params: SearchGroupsParams) => {
			buscas.push(params);
			return cartas;
		},
		simulateQuota: async () => {
			throw new Error("não usado aqui");
		},
		getGroupDetails: async () => {
			throw new Error("não usado aqui");
		},
		getRates: async () => [],
	}));
	return buscas;
}

afterEach(() => {
	__setDiscoveryAdapterFactoryForTests(null);
});

describe("paramsDasOutrasOpcoes — o mesmo recorte da busca", () => {
	it("busca por parcela mantém a parcela (não vira busca por valor)", () => {
		const meta = {
			currentCategory: "auto",
			qualifyAnswers: { parcelaAlvo: 900 },
		} as unknown as ConversationMetadata;

		expect(paramsDasOutrasOpcoes(meta)).toEqual({ category: "auto", parcelaAlvo: 900 });
	});

	it("busca por valor mantém faixa e valor do bem", () => {
		const meta = {
			currentCategory: "auto",
			qualifyAnswers: { creditMin: 72_000, creditMax: 80_000, valorDoBemAlvo: 80_000 },
		} as unknown as ConversationMetadata;

		expect(paramsDasOutrasOpcoes(meta)).toEqual({
			category: "auto",
			creditMin: 72_000,
			creditMax: 80_000,
		});
	});
});

describe("buildOtherOptions", () => {
	it("a busca leva a parcela alvo, não só a faixa de crédito", async () => {
		const buscas = adapterDeFixture([OUTRA_CARTA]);
		const meta = {
			currentCategory: "auto",
			qualifyAnswers: { parcelaAlvo: 900 },
			recommendedOffer: { ...CARTA_EM_FOCO, groupId: CARTA_EM_FOCO.id },
		} as unknown as ConversationMetadata;

		await buildOtherOptions("conv-outras", meta);

		expect(buscas[0]).toEqual({ category: "auto", parcelaAlvo: 900 });
	});

	it("a carta recomendada NÃO volta como outra opção, mesmo com números divergentes", async () => {
		adapterDeFixture([CARTA_EM_FOCO, OUTRA_CARTA]);
		const meta = {
			currentCategory: "auto",
			qualifyAnswers: { creditMin: 72_000, creditMax: 92_902 },
			// O snapshot em foco divergiu da carta (é o que a administradora devolveu
			// no fecho, e o que o dial atualiza): a chave de equivalência não casa mais
			// com a cota da tela. O `groupId` — identidade EXATA, gravada pelo clique no
			// card — é o que a mantém fora de "outras opções".
			recommendedOffer: {
				...CARTA_EM_FOCO,
				creditValue: 95_000,
				monthlyPayment: 1_500,
				groupId: CARTA_EM_FOCO.id,
			},
		} as unknown as ConversationMetadata;

		const outras = await buildOtherOptions("conv-outras", meta);

		expect(outras.groups.map((g) => g.id)).toEqual([OUTRA_CARTA.id]);
	});
});
