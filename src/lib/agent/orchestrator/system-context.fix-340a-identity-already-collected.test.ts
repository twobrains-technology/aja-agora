// FIX-340(a) (bloco-c-whatsapp-invariantes) — dossiê auto-whatsapp t8-10: com
// `identityCollected=true`, `captureIdentifyText` (WhatsApp) devolve
// handled:false e o texto cai livre no LLM sem NENHUM fato dizendo que a
// identidade já foi coletada. O modelo fabricou uma desculpa que não existe
// em código nenhum: "Desculpa, Madalena — aqui no chat não consigo ver os
// dados anteriores. Preciso que você confirme o CPF de novo."
//
// Fix: `buildSystemContext` ganha o parâmetro `identityAlreadyCollected` —
// mesmo padrão de `mentionedOffer`/`exactnessFacts` (FIX-258/DESAMARRA):
// entrega o FATO, a fala continua do modelo.
import { describe, expect, it } from "vitest";
import { buildSystemContext, looksLikeIdentityResendComplaint } from "./system-context";

describe("FIX-340(a) — buildSystemContext injeta o fato 'identidade já coletada'", () => {
	it("sem identityAlreadyCollected (ou false) NÃO adiciona nada — comportamento anterior intacto", () => {
		const out = buildSystemContext({ knownName: null, newlyExtractedExperience: null, meta: {} });
		expect(out.find((m) => /identidade/i.test(m.content))).toBeUndefined();
	});

	it("com identityAlreadyCollected=true, adiciona um system block com o FATO (não uma frase scriptada)", () => {
		const out = buildSystemContext({
			knownName: null,
			newlyExtractedExperience: null,
			meta: {},
			identityAlreadyCollected: true,
		});
		const block = out.find((m) => /identidade/i.test(m.content));
		expect(block).toBeDefined();
		expect(block?.role).toBe("system");
	});

	it("o bloco proíbe explicitamente a alegação falsa de limitação técnica", () => {
		const out = buildSystemContext({
			knownName: null,
			newlyExtractedExperience: null,
			meta: {},
			identityAlreadyCollected: true,
		});
		const block = out.find((m) => /identidade/i.test(m.content));
		expect(block?.content).toMatch(/n[ãa]o existe nenhuma limita[çc][ãa]o t[ée]cnica/i);
	});

	it("convive com os outros blocos (knownName) sem sobrescrever", () => {
		const out = buildSystemContext({
			knownName: "Madalena",
			newlyExtractedExperience: null,
			meta: {},
			identityAlreadyCollected: true,
		});
		expect(out.some((m) => m.content.includes("Madalena"))).toBe(true);
		expect(out.some((m) => /identidade/i.test(m.content))).toBe(true);
	});
});

describe("FIX-340(a) — looksLikeIdentityResendComplaint detecta a reclamação em texto livre", () => {
	it("detecta 'eu já te mandei meu CPF' (dossiê auto-whatsapp t9, literal)", () => {
		expect(looksLikeIdentityResendComplaint("eu já te mandei meu CPF")).toBe(true);
	});

	it("detecta variações (já enviei, já passei, já dei)", () => {
		expect(looksLikeIdentityResendComplaint("já enviei o CPF pra vocês")).toBe(true);
		expect(looksLikeIdentityResendComplaint("já passei meus dados")).toBe(true);
		expect(looksLikeIdentityResendComplaint("já dei meu CPF antes")).toBe(true);
	});

	it("NÃO detecta texto sem a reclamação (zero falso-positivo)", () => {
		expect(looksLikeIdentityResendComplaint("quero ver outras opções")).toBe(false);
		expect(looksLikeIdentityResendComplaint("já fiz consórcio antes")).toBe(false);
	});
});
