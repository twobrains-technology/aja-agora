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

// BUG-CONTRACT-SUMMARY-META-WIPE (2026-06-04, E2E real): persistMeta SOBRESCREVE
// o metadata inteiro — o markPending passava só { contractSummaryPending: true }
// e DESTRUÍA identityEnc/qualifyAnswers/revealCompleted da conversa quando o
// envio do resumo falhava (visto ao vivo: #131030 allowlist do sandbox Meta).
// O dublê do teste unitário aceitava patch parcial e escondeu a semântica real.
describe("markPending preserva o metadata (integração com persistMeta REAL)", () => {
	it("falha de envio NÃO destrói identityEnc/qualifyAnswers — só liga a flag", async () => {
		const { db } = await import("@/db");
		const { conversations } = await import("@/db/schema");
		const { eq } = await import("drizzle-orm");
		const { reloadMeta } = await import("@/lib/conversation/meta");
		const { storeIdentity } = await import("@/lib/conversation/identity");
		if (!process.env.IDENTITY_ENC_KEY) {
			process.env.IDENTITY_ENC_KEY = Buffer.alloc(32, 7).toString("base64");
		}
		const [conv] = await db
			.insert(conversations)
			.values({
				channel: "web",
				isSimulated: true,
				metadata: {
					currentCategory: "auto",
					revealCompleted: true,
					qualifyAnswers: { hasLance: "yes", lanceValue: 12_000 },
				},
			})
			.returning();
		try {
			await storeIdentity(conv.id, { cpf: "52998224725", celular: "62999887766" });
			const result = await sendContractSummary(conv.id, {
				getProposalImpl: async () => ROW,
				sendTextImpl: vi.fn().mockRejectedValue(new Error("(#131030) not in allowed list")),
				whatsappConfigured: () => true,
				// persistMetaImpl/loadIdentityImpl/reloadMeta REAIS — é o ponto do teste.
			});
			expect(result.sent).toBe(false);
			const meta = await reloadMeta(conv.id);
			expect(meta.contractSummaryPending, "flag de pendência ligada").toBe(true);
			expect(meta.identityEnc, "identityEnc NÃO pode ser destruído").toBeTruthy();
			expect(meta.qualifyAnswers?.lanceValue, "qualifyAnswers preservado").toBe(12_000);
			expect(meta.revealCompleted, "revealCompleted preservado").toBe(true);
		} finally {
			await db.delete(conversations).where(eq(conversations.id, conv.id));
		}
	});
});
