import { describe, expect, it, vi } from "vitest";
import { buildContractSummaryText, sendContractSummary } from "./contract-summary";

// ============================================================================
// docx passo 5 (linha 52): "Mandar por WhatsApp/e-mail o resumo da contratação."
// O lead da jornada tem celular (gate identify, D1) — o resumo vai por WhatsApp
// via sendTextMessage. E-mail fica fora (a jornada não coleta e-mail) — decisão
// registrada em docs/jornada/CONTEXT.md. Sem WhatsApp configurado: loga e marca
// meta.contractSummaryPending=true — NUNCA inventa envio nem quebra o fechamento.
// ============================================================================

const ROW = {
	administradora: "ÂNCORA",
	grupo: "1234",
	creditValue: "60000",
	monthlyPayment: "980.5",
	consortiumProposalLink: "https://assina.example/p1",
} as never;

describe("buildContractSummaryText — resumo da contratação", () => {
	const text = buildContractSummaryText({
		administradora: "ÂNCORA",
		grupo: "1234",
		creditValue: 60_000,
		monthlyPayment: 980.5,
		signatureLink: "https://assina.example/p1",
	});

	it("contém administradora, grupo, carta, parcela e link de assinatura", () => {
		expect(text).toContain("ÂNCORA");
		expect(text).toContain("1234");
		expect(text).toMatch(/60\.000/);
		expect(text).toMatch(/980/);
		expect(text).toContain("https://assina.example/p1");
	});

	it("se identifica como resumo da contratação (docx)", () => {
		expect(text.toLowerCase()).toMatch(/resumo da( sua)? contratação/);
	});
});

describe("sendContractSummary — envio via WhatsApp", () => {
	it("com WhatsApp configurado envia pro celular da identidade (DDI 55)", async () => {
		const sendText = vi.fn().mockResolvedValue({ ok: true });
		const result = await sendContractSummary("conv-1", {
			loadIdentityImpl: async () => ({ cpf: "52998224725", celular: "62999887766" }),
			getProposalImpl: async () => ROW,
			sendTextImpl: sendText,
			whatsappConfigured: () => true,
			persistMetaImpl: vi.fn(),
		});
		expect(result.sent).toBe(true);
		expect(sendText).toHaveBeenCalledTimes(1);
		const [to, text] = sendText.mock.calls[0];
		expect(to).toBe("5562999887766");
		expect(text).toContain("ÂNCORA");
		expect(text).toContain("https://assina.example/p1");
	});

	it("sem WhatsApp configurado: NÃO envia, marca contractSummaryPending e não lança", async () => {
		const sendText = vi.fn();
		const persist = vi.fn();
		const result = await sendContractSummary("conv-2", {
			loadIdentityImpl: async () => ({ cpf: "52998224725", celular: "62999887766" }),
			getProposalImpl: async () => ROW,
			sendTextImpl: sendText,
			whatsappConfigured: () => false,
			persistMetaImpl: persist,
		});
		expect(result.sent).toBe(false);
		expect(sendText).not.toHaveBeenCalled();
		expect(persist).toHaveBeenCalledWith("conv-2", { contractSummaryPending: true });
	});

	it("falha no envio NÃO quebra o fechamento: marca pendente e retorna sent=false", async () => {
		const persist = vi.fn();
		const result = await sendContractSummary("conv-3", {
			loadIdentityImpl: async () => ({ cpf: "52998224725", celular: "62999887766" }),
			getProposalImpl: async () => ROW,
			sendTextImpl: vi.fn().mockRejectedValue(new Error("rate limited")),
			whatsappConfigured: () => true,
			persistMetaImpl: persist,
		});
		expect(result.sent).toBe(false);
		expect(persist).toHaveBeenCalledWith("conv-3", { contractSummaryPending: true });
	});

	it("sem identidade (defensivo): não envia e não lança", async () => {
		const result = await sendContractSummary("conv-4", {
			loadIdentityImpl: async () => null,
			getProposalImpl: async () => ROW,
			sendTextImpl: vi.fn(),
			whatsappConfigured: () => true,
			persistMetaImpl: vi.fn(),
		});
		expect(result.sent).toBe(false);
	});
});
