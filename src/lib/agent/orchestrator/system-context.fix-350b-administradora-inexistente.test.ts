// FIX-350(b) (P1.5, veredito rodada 4) — quando o usuário pede uma
// administradora que NÃO está entre as ofertas reais da conversa ("me mostra
// a Bradesco" / "e a Caixa?"), o agente responde de 3 jeitos ruins e
// inconsistentes (3/8 dossiês): desconversa com um não-sequitur
// (`auto-whatsapp` t8, `servicos-web` t8), promete simular e não cumpre
// (`imovel-web` t8), ou (nos 5/8 corretos) redireciona pra lista real.
//
// O guard (`isHallucinatedAdministradoraClaim`, FIX-342/345) já impede a
// MENTIRA (o modelo nunca inventa que a Bradesco é uma oferta real) — mas
// ninguém ensina o agente a responder BEM. Isso é CONVERSA (como falar), e
// conversa é do modelo (CLAUDE.md, "Não engesse o agente"): o servidor deve
// só entregar o FATO no contexto ("a Bradesco não está entre as opções; as
// reais são X, Y") e deixar o modelo redigir — mesmo padrão de
// `exactnessFacts`/`identityAlreadyCollected` (DESAMARRA 2026-07-13).
import { describe, expect, it } from "vitest";
import { buildSystemContext } from "./system-context";

describe("FIX-350(b) — buildSystemContext injeta o fato 'administradora pedida não existe'", () => {
	it("sem unavailableAdministradoraFacts (ou null) NÃO adiciona nada — comportamento anterior intacto", () => {
		const out = buildSystemContext({ knownName: null, newlyExtractedExperience: null, meta: {} });
		expect(out.find((m) => /bradesco|n[ãa]o est[áa] entre as op/i.test(m.content))).toBeUndefined();
	});

	it("com o fato presente, adiciona um system block com o FATO real (não uma frase scriptada)", () => {
		const out = buildSystemContext({
			knownName: null,
			newlyExtractedExperience: null,
			meta: {},
			unavailableAdministradoraFacts: { requested: "Bradesco", realOffers: ["ITAÚ", "ÂNCORA"] },
		});
		const block = out.find((m) => /bradesco/i.test(m.content));
		expect(block).toBeDefined();
		expect(block?.role).toBe("system");
		expect(block?.content).toMatch(/it[aá][uú]/i);
		expect(block?.content).toMatch(/[âa]ncora/i);
	});

	it("o bloco proíbe explicitamente inventar a oferta E prometer o que não vai entregar", () => {
		const out = buildSystemContext({
			knownName: null,
			newlyExtractedExperience: null,
			meta: {},
			unavailableAdministradoraFacts: { requested: "Bradesco", realOffers: ["ITAÚ", "ÂNCORA"] },
		});
		const block = out.find((m) => /bradesco/i.test(m.content));
		expect(block?.content).toMatch(/n[ãa]o (existe|est[áa])/i);
		expect(block?.content).toMatch(/prometa|promessa/i);
	});

	it("o bloco instrui redirecionar pra lista real, nunca desconversar", () => {
		const out = buildSystemContext({
			knownName: null,
			newlyExtractedExperience: null,
			meta: {},
			unavailableAdministradoraFacts: { requested: "Caixa", realOffers: ["Rodobens"] },
		});
		const block = out.find((m) => /caixa/i.test(m.content));
		expect(block?.content).toMatch(/rodobens/i);
		expect(block?.content).toMatch(/redirecion|real/i);
	});

	it("convive com os outros blocos (knownName) sem sobrescrever", () => {
		const out = buildSystemContext({
			knownName: "Bruno",
			newlyExtractedExperience: null,
			meta: {},
			unavailableAdministradoraFacts: { requested: "Bradesco", realOffers: ["ÂNCORA"] },
		});
		expect(out.some((m) => m.content.includes("Bruno"))).toBe(true);
		expect(out.some((m) => /bradesco/i.test(m.content))).toBe(true);
	});
});
