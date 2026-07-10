// Camada 1 (estrutural) — FIX-235 (handoff agente-vendas-consorcio, 2026-07-09
// — D8): fecho pro WhatsApp. Ao aceitar a oferta (offer-confirm, self-service
// já criou a proposta real normalmente — isto NÃO muda), dispara UMA mensagem
// pedindo o "oi" (template HSM por usageKey — a janela de 24h costuma estar
// fechada nesse momento) e aciona a mesa (dispatchAutoTransbordo) NA HORA, em
// vez de esperar o worker assíncrono de status da Bevi (que pode levar dias).

import { describe, expect, it, vi } from "vitest";
import { FECHO_PEDIR_OI_USAGE_KEY, sendFechoPedirOi } from "./fecho-pedir-oi";

describe("FIX-235 — sendFechoPedirOi via resolveAndSend + dispatchAutoTransbordo", () => {
	it("chama resolveAndSend com o usageKey fecho_pedir_oi e o celular DDI 55", async () => {
		const resolveSpy = vi.fn(async (a: { freeTextFallback: () => Promise<void> | void }) => {
			await a.freeTextFallback();
			return { channel: "free_text" as const };
		});
		const sendText = vi.fn().mockResolvedValue({ ok: true });
		const dispatchAutoTransbordo = vi.fn().mockResolvedValue({ created: true, handoffId: "h1" });

		const res = await sendFechoPedirOi("conv-fix235", {
			loadIdentityImpl: async () => ({ cpf: "52998224725", celular: "62999887766" }),
			getLeadIdImpl: async () => "lead-1",
			sendTextImpl: sendText,
			whatsappConfigured: () => true,
			// biome-ignore lint/suspicious/noExplicitAny: spy de teste
			resolveAndSendImpl: resolveSpy as any,
			dispatchAutoTransbordoImpl: dispatchAutoTransbordo,
		});

		expect(res.sent).toBe(true);
		expect(FECHO_PEDIR_OI_USAGE_KEY).toBe("fecho_pedir_oi");
		expect(resolveSpy).toHaveBeenCalledTimes(1);
		const arg = resolveSpy.mock.calls[0][0] as {
			usageKey: string;
			to: string;
			conversationId: string;
		};
		expect(arg.usageKey).toBe("fecho_pedir_oi");
		expect(arg.to).toBe("5562999887766");
		expect(arg.conversationId).toBe("conv-fix235");
		// janela aberta → freeTextFallback pede o "oi" também (defesa em profundidade)
		expect(sendText).toHaveBeenCalledTimes(1);
		expect(sendText.mock.calls[0][1]).toMatch(/["“]oi["”]/);
		// mesa acionada NA HORA (não espera o worker assíncrono)
		expect(dispatchAutoTransbordo).toHaveBeenCalledWith("lead-1");
	});

	it("sem identidade (celular ausente) → não envia, não quebra, marca pending-equivalente (best-effort)", async () => {
		const resolveSpy = vi.fn();
		const dispatchAutoTransbordo = vi.fn();

		const res = await sendFechoPedirOi("conv-sem-identidade", {
			loadIdentityImpl: async () => null,
			getLeadIdImpl: async () => "lead-1",
			sendTextImpl: vi.fn(),
			whatsappConfigured: () => true,
			// biome-ignore lint/suspicious/noExplicitAny: spy de teste
			resolveAndSendImpl: resolveSpy as any,
			dispatchAutoTransbordoImpl: dispatchAutoTransbordo,
		});

		expect(res.sent).toBe(false);
		expect(resolveSpy).not.toHaveBeenCalled();
		expect(dispatchAutoTransbordo).not.toHaveBeenCalled();
	});

	it("janela fechada + template não aprovado → resolveAndSend enfileira; sendFechoPedirOi NÃO lança (comportamento seguro)", async () => {
		const resolveSpy = vi.fn().mockResolvedValue({ channel: "queued", queueId: "q1" });
		const dispatchAutoTransbordo = vi.fn().mockResolvedValue({ created: true });

		const res = await sendFechoPedirOi("conv-fila", {
			loadIdentityImpl: async () => ({ cpf: "52998224725", celular: "62999887766" }),
			getLeadIdImpl: async () => "lead-2",
			sendTextImpl: vi.fn(),
			whatsappConfigured: () => true,
			// biome-ignore lint/suspicious/noExplicitAny: spy de teste
			resolveAndSendImpl: resolveSpy as any,
			dispatchAutoTransbordoImpl: dispatchAutoTransbordo,
		});

		expect(res.sent).toBe(true);
		expect(dispatchAutoTransbordo).toHaveBeenCalledWith("lead-2");
	});

	it("sem leadId resolvido → não chama dispatchAutoTransbordo, mas ainda envia a mensagem", async () => {
		const resolveSpy = vi.fn().mockResolvedValue({ channel: "template" });
		const dispatchAutoTransbordo = vi.fn();

		const res = await sendFechoPedirOi("conv-sem-lead", {
			loadIdentityImpl: async () => ({ cpf: "52998224725", celular: "62999887766" }),
			getLeadIdImpl: async () => null,
			sendTextImpl: vi.fn(),
			whatsappConfigured: () => true,
			// biome-ignore lint/suspicious/noExplicitAny: spy de teste
			resolveAndSendImpl: resolveSpy as any,
			dispatchAutoTransbordoImpl: dispatchAutoTransbordo,
		});

		expect(res.sent).toBe(true);
		expect(dispatchAutoTransbordo).not.toHaveBeenCalled();
	});

	it("dispatchAutoTransbordo falhando NÃO derruba o envio da mensagem (best-effort)", async () => {
		const resolveSpy = vi.fn().mockResolvedValue({ channel: "free_text" });
		const dispatchAutoTransbordo = vi.fn().mockRejectedValue(new Error("mesa fora do ar"));

		const res = await sendFechoPedirOi("conv-mesa-falha", {
			loadIdentityImpl: async () => ({ cpf: "52998224725", celular: "62999887766" }),
			getLeadIdImpl: async () => "lead-3",
			sendTextImpl: vi.fn(),
			whatsappConfigured: () => true,
			// biome-ignore lint/suspicious/noExplicitAny: spy de teste
			resolveAndSendImpl: resolveSpy as any,
			dispatchAutoTransbordoImpl: dispatchAutoTransbordo,
		});

		expect(res.sent).toBe(true);
	});
});
