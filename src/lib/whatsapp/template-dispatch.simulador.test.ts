import { describe, expect, it, vi } from "vitest";

/**
 * Bug QA 2026-07-03 (rodada qa-dono-produto): o Passo 5.2 (confirmOffer →
 * assinatura + documento + Parabéns) NÃO renderizava no simulador. Causa: o
 * simulador não chama updateLastInboundAt (só o webhook real, route.ts:108), então
 * conversations.lastInboundAt fica null → isWindowOpen retorna SEMPRE fechada → o
 * resolveAndSend enfileirava as mensagens como template pendente em vez de enviar.
 * A saída do simulador é interceptada pelo simulator-bus e NUNCA vai pra Meta, então
 * a regra de janela/template não se aplica: waId simulado sempre free-texta.
 */
vi.mock("./window", () => ({
	// janela SEMPRE fechada — o cenário exato do simulador (lastInboundAt null)
	isWindowOpen: vi.fn().mockResolvedValue({ open: false, expiresAt: null }),
}));
vi.mock("./api", () => ({ sendTemplate: vi.fn() }));

import { resolveAndSend } from "./template-dispatch";
import { isWindowOpen } from "./window";

describe("resolveAndSend — waId simulado pula template (fidelidade do simulador)", () => {
	it("SIM-<uuid> com janela fechada → free-text (NÃO enfileira template)", async () => {
		const freeTextFallback = vi.fn().mockResolvedValue(undefined);
		const r = await resolveAndSend({
			to: "SIM-b5d97919-366a-4907-ad9c-5bb447ff8562",
			conversationId: "conv-1",
			usageKey: "confirmacao_contratacao",
			freeTextFallback,
		});
		expect(freeTextFallback).toHaveBeenCalledTimes(1);
		expect(r.channel).toBe("free_text");
		// bypass ANTES da janela — nem chega a consultar isWindowOpen
		expect(isWindowOpen).not.toHaveBeenCalled();
	});

	it("waId REAL com janela fechada → NÃO free-texta direto (segue pro fluxo de template)", async () => {
		const freeTextFallback = vi.fn().mockResolvedValue(undefined);
		// número real: cai no fluxo normal (isWindowOpen consultado); com o mock
		// fechado e sem template aprovado, o resultado NÃO é free_text.
		const r = await resolveAndSend({
			to: "5562992496793",
			conversationId: "conv-2",
			usageKey: "confirmacao_contratacao",
			freeTextFallback,
		}).catch(() => ({ channel: "erro-esperado-sem-db" as const }));
		expect(r.channel).not.toBe("free_text");
	});
});
