import { describe, expect, it, vi } from "vitest";

const enviarParaMeta = vi.hoisted(() => vi.fn());
vi.mock("./meta-capi", async (importOriginal) => ({
	...(await importOriginal<typeof import("./meta-capi")>()),
	enviarParaMeta,
}));
vi.mock("./config", () => ({
	getConversionsConfig: () => ({
		enabled: true,
		pixelId: "1360432072874656",
		accessToken: "tok",
		apiVersion: "v21.0",
		testEventCode: null,
	}),
	motivoParaNaoEnviar: () => null,
}));

const linhas = vi.hoisted(() => ({ pendentes: [] as Array<Record<string, unknown>> }));
const atualizacoes = vi.hoisted(() => [] as Array<{ id: string; status: string }>);
vi.mock("@/db", () => ({
	db: {
		select: () => ({
			from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => linhas.pendentes }) }) }),
		}),
		update: () => ({
			set: (valores: Record<string, unknown>) => ({
				where: (cond: { __id?: string }) => {
					atualizacoes.push({
						id: String(cond?.__id ?? "lote"),
						status: String(valores.status ?? ""),
					});
					return { returning: async () => [] };
				},
			}),
		}),
	},
}));
vi.mock("drizzle-orm", async (importOriginal) => ({
	...(await importOriginal<typeof import("drizzle-orm")>()),
	eq: (_: unknown, value: unknown) => ({ __id: value }),
	inArray: () => ({ __id: "legados" }),
}));

function evento(id: string, eventName: string) {
	return {
		id,
		eventName,
		eventKey: `${id}:${eventName}`,
		occurredAt: new Date(),
		value: eventName === "purchase" ? "150000.00" : null,
		currency: "BRL",
		hashedEmail: null,
		hashedPhone: "a".repeat(64),
		externalId: null,
		fbc: null,
		fbp: null,
		ctwaClid: null,
		actionSource: "website",
		contentId: null,
		campaignId: null,
		adsetId: null,
		adId: null,
		previousStage: null,
		currentStage: null,
		proposalId: null,
		saleId: null,
	};
}

describe("dispatch do contrato Meta CAPI V2", () => {
	it("isola definitivamente ChatOpened/legado e envia somente marcos V2", async () => {
		linhas.pendentes = [evento("v1", "purchase"), evento("legacy", "chat_iniciado")];
		atualizacoes.length = 0;
		enviarParaMeta.mockReset().mockResolvedValue({ ok: true });
		const { despacharConversoesPendentes } = await import("./dispatch");
		const result = await despacharConversoesPendentes();
		expect(enviarParaMeta).toHaveBeenCalledTimes(1);
		expect(enviarParaMeta.mock.calls[0][0]).toEqual([
			expect.objectContaining({ eventName: "purchase" }),
		]);
		expect(atualizacoes).toContainEqual({ id: "legados", status: "skipped" });
		expect(atualizacoes).toContainEqual({ id: "v1", status: "sent" });
		expect(result.enviados).toBe(1);
	});

	// Medido em 15/09/2026 ao validar o TEST87230: um único evento sem nenhum
	// parâmetro de correspondência fez a Meta recusar o lote INTEIRO com
	// `error_subcode 2804050` ("não adicionou dados de parâmetros do cliente
	// suficientes"). Os seis marcos bons caíram junto — inclusive o Purchase.
	// A Meta valida o lote como um todo: um evento impossível de casar não é um
	// evento a menos, é o lote a menos.
	it("evento sem nenhum identificador não embarca — senão leva o Purchase junto", async () => {
		const orfao = { ...evento("orfao", "lead"), hashedPhone: null, fbc: null, fbp: null };
		linhas.pendentes = [evento("v1", "purchase"), orfao];
		atualizacoes.length = 0;
		enviarParaMeta.mockReset().mockResolvedValue({ ok: true });
		const { despacharConversoesPendentes } = await import("./dispatch");

		const resultado = await despacharConversoesPendentes();

		expect(enviarParaMeta.mock.calls[0][0]).toEqual([
			expect.objectContaining({ eventName: "purchase" }),
		]);
		expect(atualizacoes).toContainEqual({ id: "v1", status: "sent" });
		expect(resultado.enviados).toBe(1);
	});

	// O marco legado sai na mesma leva enquanto a flag do V2 não vira. A régua
	// do despacho é ter nome que a Meta entende, e `proposta_criada` tem
	// (`InitiateCheckout`) — travá-lo aqui deixaria a conta sem sinal nenhum
	// entre o deploy e o aceite do Growth, que é justamente quando a campanha
	// ativa mais precisa ser alimentada. Quem fica de fora é `chat_iniciado`,
	// coberto no teste acima, porque é ele que produz os HTTP 400.
	it("uma falha comercial marca o lote inteiro como failed, sem reviver nada", async () => {
		linhas.pendentes = [evento("v1", "qualified_lead"), evento("legacy", "proposta_criada")];
		atualizacoes.length = 0;
		enviarParaMeta
			.mockReset()
			.mockResolvedValue({ ok: false, erro: "HTTP 400: parâmetro inválido" });
		const { despacharConversoesPendentes } = await import("./dispatch");
		await despacharConversoesPendentes();
		expect(enviarParaMeta).toHaveBeenCalledTimes(1);
		expect(atualizacoes).toContainEqual({ id: "v1", status: "failed" });
		expect(atualizacoes).toContainEqual({ id: "legacy", status: "failed" });
		expect(atualizacoes).not.toContainEqual({ id: "legados", status: "skipped" });
	});
});
