import { describe, expect, it } from "vitest";
import { parseCtwaReferral } from "./referral";

describe("parseCtwaReferral", () => {
	// Formato real do payload da Meta Cloud API: `messages[].referral` só aparece
	// na PRIMEIRA mensagem depois do clique no anúncio Click-to-WhatsApp.
	const referralReal = {
		source_url: "https://fb.me/2abcDEF",
		source_id: "120210000000000000",
		source_type: "ad",
		headline: "Compare consórcios em 2 minutos",
		body: "Sem juros, sem corretor",
		media_type: "image",
		ctwa_clid: "AfXyZ0987654321abcdef",
	};

	it("extrai clique, anúncio e origem do referral da Meta", () => {
		expect(parseCtwaReferral(referralReal)).toEqual({
			ctwaClid: "AfXyZ0987654321abcdef",
			sourceId: "120210000000000000",
			sourceUrl: "https://fb.me/2abcDEF",
			sourceType: "ad",
			headline: "Compare consórcios em 2 minutos",
		});
	});

	it("aceita referral sem ctwa_clid — o anúncio ainda identifica o criativo", () => {
		const { ctwa_clid: _omitido, ...semClid } = referralReal;

		expect(parseCtwaReferral(semClid)).toMatchObject({
			ctwaClid: null,
			sourceId: "120210000000000000",
		});
	});

	it("devolve nulo quando a mensagem não veio de anúncio", () => {
		expect(parseCtwaReferral(undefined)).toBeNull();
		expect(parseCtwaReferral(null)).toBeNull();
		expect(parseCtwaReferral({})).toBeNull();
	});

	it("devolve nulo quando o payload não tem nenhum campo aproveitável", () => {
		expect(parseCtwaReferral({ body: "só o texto do anúncio", media_type: "image" })).toBeNull();
	});

	it("ignora payload que não é objeto", () => {
		expect(parseCtwaReferral("ad")).toBeNull();
		expect(parseCtwaReferral(42)).toBeNull();
	});

	it("trunca campo longo — o payload vem de fora", () => {
		const parsed = parseCtwaReferral({ ...referralReal, headline: "a".repeat(900) });

		expect(parsed?.headline).toHaveLength(255);
	});
});
