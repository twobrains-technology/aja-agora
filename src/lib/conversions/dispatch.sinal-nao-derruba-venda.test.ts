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

	it("uma falha comercial não revive nem envia evento legado", async () => {
		linhas.pendentes = [evento("v1", "qualified_lead"), evento("legacy", "proposta_criada")];
		atualizacoes.length = 0;
		enviarParaMeta
			.mockReset()
			.mockResolvedValue({ ok: false, erro: "HTTP 400: parâmetro inválido" });
		const { despacharConversoesPendentes } = await import("./dispatch");
		await despacharConversoesPendentes();
		expect(enviarParaMeta).toHaveBeenCalledTimes(1);
		expect(atualizacoes).toContainEqual({ id: "v1", status: "failed" });
		expect(atualizacoes).toContainEqual({ id: "legados", status: "skipped" });
	});
});
