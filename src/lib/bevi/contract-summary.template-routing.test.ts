// Camada 1 (estrutural) — FIX-203: sendContractSummary roteia por resolveAndSend
// com o usageKey canônico `resumo_contratacao`, usando a copy atual como
// freeTextFallback (texto livre dentro da janela; template fora dela).

import { describe, expect, it, vi } from "vitest";
import { RESUMO_CONTRATACAO_USAGE_KEY, sendContractSummary } from "./contract-summary";

const ROW = {
	administradora: "ÂNCORA",
	grupo: "1234",
	creditValue: "60000",
	monthlyPayment: "980.5",
	consortiumProposalLink: "https://assina.example/p1",
} as never;

describe("FIX-203 — sendContractSummary via resolveAndSend", () => {
	it("chama resolveAndSend com usageKey resumo_contratacao e o celular DDI 55", async () => {
		const resolveSpy = vi.fn(async (a: { freeTextFallback: () => Promise<void> | void }) => {
			await a.freeTextFallback(); // janela aberta
			return { channel: "free_text" as const };
		});
		const sendText = vi.fn().mockResolvedValue({ ok: true });

		const res = await sendContractSummary("conv-fix203", {
			loadIdentityImpl: async () => ({ cpf: "52998224725", celular: "62999887766" }),
			getProposalImpl: async () => ROW,
			sendTextImpl: sendText,
			whatsappConfigured: () => true,
			persistMetaImpl: vi.fn(),
			// biome-ignore lint/suspicious/noExplicitAny: spy de teste
			resolveAndSendImpl: resolveSpy as any,
		});

		expect(res.sent).toBe(true);
		expect(RESUMO_CONTRATACAO_USAGE_KEY).toBe("resumo_contratacao");
		expect(resolveSpy).toHaveBeenCalledTimes(1);
		const arg = resolveSpy.mock.calls[0][0] as {
			usageKey: string;
			to: string;
			conversationId: string;
		};
		expect(arg.usageKey).toBe("resumo_contratacao");
		expect(arg.to).toBe("5562999887766");
		expect(arg.conversationId).toBe("conv-fix203");
		// dentro da janela, o freeTextFallback mandou a copy atual do resumo
		expect(sendText).toHaveBeenCalledTimes(1);
		expect(sendText.mock.calls[0][1]).toContain("ÂNCORA");
	});
});
