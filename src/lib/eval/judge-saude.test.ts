import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: { insert: () => ({ values: async () => {} }) } }));

import {
	__resetGenerateObjectImplForTests,
	__setGenerateObjectImplForTests,
	detalheDoErroDoJuiz,
	JUDGE_MAX_OUTPUT_TOKENS,
	judgeConversation,
	resumoDaCoberturaDoJuiz,
	sondarJuiz,
} from "./judge";

afterEach(() => __resetGenerateObjectImplForTests());

describe("sondarJuiz", () => {
	it("falha à vista com a mensagem pedida", async () => {
		const r = await sondarJuiz(async () => {
			throw new Error("Bad Request");
		}, "claude-x");
		expect(r).toEqual({
			ok: false,
			mensagem:
				"JUIZ INDISPONÍVEL: modelo claude-x recusado pelo gateway (Bad Request). Defina JUDGE_MODEL com um modelo servido.",
		});
	});
	it("ok quando a chamada passa", async () => {
		expect(await sondarJuiz(async () => undefined)).toEqual({ ok: true });
	});
});

describe("resumoDaCoberturaDoJuiz", () => {
	it("parcial não é morto", () => {
		const r = resumoDaCoberturaDoJuiz({ julgados: 1, tentados: 3, falhas: ["a", "b"] });
		expect(r).toEqual({ linha: "JUIZ: 1 de 3 cenários com nota (2 falhas: a, b)", morto: false });
	});
	it("N=0 com M>0 é JUIZ MORTO", () => {
		const r = resumoDaCoberturaDoJuiz({ julgados: 0, tentados: 2, falhas: ["a", "b"] });
		expect(r.morto).toBe(true);
		expect(r.linha).toContain("JUIZ MORTO");
	});
	it("M=0 não é morto", () => {
		expect(resumoDaCoberturaDoJuiz({ julgados: 0, tentados: 0, falhas: [] }).morto).toBe(false);
	});
});

describe("robustez do juiz a transcript longo", () => {
	it("passa maxOutputTokens e põe finishReason/uso no JudgeError", async () => {
		let visto: unknown;
		__setGenerateObjectImplForTests((async (opts: { maxOutputTokens?: number }) => {
			visto = opts.maxOutputTokens;
			throw Object.assign(new Error("No object generated"), {
				finishReason: "length",
				usage: { outputTokens: 4096 },
			});
		}) as never);
		vi.useFakeTimers();
		const p = judgeConversation({
			transcript: "t",
			personas: [],
			signals: {
				replyRate: 1,
				qualifyCoverage: 0.5,
				qualifyMissing: [],
				numbersInTextFlagged: [],
				dropOffGate: null,
				conversionStage: "qualificado",
				hasLead: true,
				personaSegments: [],
				propostas: 0,
				contratoFechado: false,
				repeticoesDoAgente: 0,
				alertas: [],
			} as never,
		});
		const assercao = expect(p).rejects.toThrow(/finishReason=length.*outputTokens/);
		await vi.runAllTimersAsync();
		await assercao;
		vi.useRealTimers();
		expect(visto).toBe(JUDGE_MAX_OUTPUT_TOKENS);
		expect(detalheDoErroDoJuiz(new Error("x"))).toBe("x");
	});
});
