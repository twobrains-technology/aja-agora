// FIX-374 — achado ao vivo na campanha vendedor-matador (persona "moto, com
// pressa", gate contract): mesmo com FIX-372 (rede de segurança do card de
// escassez) corretamente disparando a condição (`gate === "contract"`,
// `hasLance !== "so_parcela"`), o card NUNCA aparecia porque
// `buildScarcityCard` (server-cards.ts) lê `meta.recommendedOffer.availableSlots`
// e esse campo nunca era escrito — o snapshot montado no reveal
// (`discoveryNode`) copiava administradora/creditValue/termMonths/
// monthlyPayment/groupId/avgBidValue de `best` (o grupo real ranqueado), mas
// esquecia `availableSlots`, mesmo esse campo existindo em `RevealGroupLike`
// desde o FIX-367 (que documentou a intenção mas nunca atualizou este
// write-site). Confirmado via query direta no Postgres: `recommendedOffer`
// persistido em duas conversas reais de hoje (Itaú R$81.973, Tradição
// R$31.539) não tinha a chave `availableSlots` — não é dado ausente da Bevi
// (os artifacts `recommendation_card`/`group_card` da MESMA conversa tinham o
// valor real), é o código que não propaga.
import { describe, expect, it } from "vitest";
import { buildRecommendedOfferSnapshot } from "./discovery";

describe("FIX-374 — recommendedOffer carrega availableSlots real do grupo ranqueado", () => {
	it("propaga availableSlots real de `best` pro snapshot ancorado", () => {
		const best = {
			id: "grupo-real-1",
			administradora: "Itaú",
			creditValue: 81_973,
			termMonths: 49,
			monthlyPayment: 1_992.78,
			avgBidValue: 57_463,
			availableSlots: 5,
		};

		const snapshot = buildRecommendedOfferSnapshot(best, "auto");

		expect(snapshot.availableSlots).toBe(5);
	});

	it("grupo real sem availableSlots (dado upstream ausente) não fabrica número — undefined sobrevive", () => {
		const best = {
			id: "grupo-real-2",
			administradora: "Tradição",
			creditValue: 31_539,
			termMonths: 61,
			monthlyPayment: 699.88,
		};

		const snapshot = buildRecommendedOfferSnapshot(best, "moto");

		expect(snapshot.availableSlots).toBeUndefined();
	});

	it("mantém os demais campos já cobertos (regressão do comportamento existente)", () => {
		const best = {
			id: "grupo-real-3",
			administradora: "Rodobens",
			creditValue: 50_000,
			termMonths: 80,
			monthlyPayment: 900,
			avgBidValue: 12_000,
			availableSlots: 3,
		};

		const snapshot = buildRecommendedOfferSnapshot(best, "imovel");

		expect(snapshot).toEqual({
			administradora: "Rodobens",
			category: "imovel",
			creditValue: 50_000,
			termMonths: 80,
			monthlyPayment: 900,
			groupId: "grupo-real-3",
			avgBidValue: 12_000,
			availableSlots: 3,
		});
	});
});
