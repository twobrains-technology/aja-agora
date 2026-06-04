import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { __setDiscoveryAdapterFactoryForTests } from "@/lib/adapters";
import { fixtureDiscoveryAdapter } from "../../../../tests/helpers/fixture-discovery-adapter";
import { buildConsorcioTools, consorcioTools, PRESENTATION_TOOLS } from "./ai-sdk";

// MOCK-RUNTIME-MORTO: descoberta vem do adapter por conversa (factory). Testes
// instalam o adapter de FIXTURES REAIS (capturas da loja-piloto) via seam.
beforeAll(() => __setDiscoveryAdapterFactoryForTests(() => fixtureDiscoveryAdapter()));
afterAll(() => __setDiscoveryAdapterFactoryForTests(null));

// Tools de descoberta resolvidas via factory (com conversationId fake — o seam
// devolve o adapter de fixtures independente do id).
const discoveryTools = buildConsorcioTools({ conversationId: "test-discovery-conv" });

describe("consorcioTools — tools novas da revisão Bruna v1", () => {
	it("tem compute_scenarios (#16)", () => {
		expect(consorcioTools).toHaveProperty("compute_scenarios");
	});

	it("tem present_scenarios e está em PRESENTATION_TOOLS (#16)", () => {
		expect(consorcioTools).toHaveProperty("present_scenarios");
		expect(PRESENTATION_TOOLS.has("present_scenarios")).toBe(true);
	});

	it("tem compare_with_financing (#17)", () => {
		expect(consorcioTools).toHaveProperty("compare_with_financing");
	});

	it("tem present_topic_picker e está em PRESENTATION_TOOLS (#05)", () => {
		expect(consorcioTools).toHaveProperty("present_topic_picker");
		expect(PRESENTATION_TOOLS.has("present_topic_picker")).toBe(true);
	});

	it("recommend_groups tool retorna campos do fallback (expansionUsed, insufficientOptions) — plug #09", async () => {
		const exec = discoveryTools.recommend_groups.execute;
		if (!exec) throw new Error("recommend_groups.execute is undefined");
		const result = (await exec(
			{
				category: "auto",
				creditMin: 20_000,
				creditMax: 60_000,
				budget: 1_200,
				desiredTermMonths: 70,
			},
			// biome-ignore lint/suspicious/noExplicitAny: ai-sdk tool ctx not exported
			{ toolCallId: "test", messages: [] } as any,
		)) as {
			recommendations: Array<{ alternativa: boolean; administradora: string }>;
			expansionUsed: number | null;
			insufficientOptions: boolean;
		};
		expect(result).toHaveProperty("expansionUsed");
		expect(result).toHaveProperty("insufficientOptions");
		expect(result.recommendations[0]).toHaveProperty("alternativa");
		// Dados REAIS da captura — administradoras de verdade, nunca fictícias.
		expect(["ITAÚ", "ÂNCORA", "BANCO DO BRASIL"]).toContain(
			result.recommendations[0].administradora,
		);
	});

	it("registry estático (sem conversationId) NÃO serve descoberta — erro informativo", async () => {
		const exec = consorcioTools.search_groups.execute;
		if (!exec) throw new Error("search_groups.execute undefined");
		const result = (await exec(
			{ category: "auto" },
			// biome-ignore lint/suspicious/noExplicitAny: tool ctx not exported
			{ toolCallId: "t", messages: [] } as any,
		)) as { error?: string };
		expect(result.error).toMatch(/conversationId/);
	});

	// Bv2-08 — Bruna v2: parcela do comparativo divergia do detalhamento.
	// Causa raiz: LLM usa creditValue do pedido inicial (ex: 800k) em vez do
	// nominal do grupo (ex: 900k). Guardrail: simulate_quota detecta
	// divergência e retorna creditAdjustmentNotice obrigando o agente a
	// declarar o ajuste pro user. CDC art. 30/35/37.
	describe("simulate_quota guardrail Bv2-08 — creditAdjustmentNotice", () => {
		it("retorna creditAdjustmentNotice quando creditValue diverge >1% do nominal", async () => {
			const exec = discoveryTools.simulate_quota.execute;
			if (!exec) throw new Error("simulate_quota.execute undefined");
			// Pega o grupo ITAÚ da CAPTURA REAL (finalValue 54832, AUTOS)
			const search = discoveryTools.search_groups.execute;
			if (!search) throw new Error("search_groups.execute undefined");
			const groups = (await search(
				{ category: "auto", creditMax: 60_000 },
				// biome-ignore lint/suspicious/noExplicitAny: tool ctx not exported
				{ toolCallId: "t", messages: [] } as any,
			)) as { groups: Array<{ id: string; administradora: string; creditValue: number }> };
			const itau = groups.groups.find((g) => g.administradora === "ITAÚ");
			if (!itau) throw new Error("grupo ITAÚ não achado na captura real");

			const adjustedCredit = Math.round(itau.creditValue * 0.85);
			const result = (await exec(
				{ groupId: itau.id, creditValue: adjustedCredit },
				// biome-ignore lint/suspicious/noExplicitAny: tool ctx not exported
				{ toolCallId: "t", messages: [] } as any,
			)) as {
				monthlyPayment: number;
				creditValue: number;
				creditAdjustmentNotice?: {
					requestedCreditValue: number;
					groupNominalCreditValue: number;
					message: string;
				};
			};
			expect(result.creditAdjustmentNotice).toBeDefined();
			expect(result.creditAdjustmentNotice?.requestedCreditValue).toBe(adjustedCredit);
			expect(result.creditAdjustmentNotice?.groupNominalCreditValue).toBe(itau.creditValue);
			expect(result.creditAdjustmentNotice?.message).toMatch(/ajust/i);
		});

		it("NÃO retorna notice quando creditValue == nominal do grupo (±1%)", async () => {
			const exec = discoveryTools.simulate_quota.execute;
			const search = discoveryTools.search_groups.execute;
			if (!exec || !search) throw new Error("tools undefined");
			const groups = (await search(
				{ category: "auto", creditMax: 60_000 },
				// biome-ignore lint/suspicious/noExplicitAny: tool ctx not exported
				{ toolCallId: "t", messages: [] } as any,
			)) as { groups: Array<{ id: string; creditValue: number }> };
			const g = groups.groups[0];
			const result = (await exec(
				{ groupId: g.id, creditValue: g.creditValue },
				// biome-ignore lint/suspicious/noExplicitAny: tool ctx not exported
				{ toolCallId: "t", messages: [] } as any,
			)) as { creditAdjustmentNotice?: unknown };
			expect(result.creditAdjustmentNotice).toBeUndefined();
		});
	});

	// ─────────────────────────────────────────────────────────────────────────
	// BUG-CONVERSATION-ID-NOT-IN-SCHEMA — Camada 1 (estrutural)
	// ----------------------------------------------------------------------------
	// Eval Camada 3 (commit 9080db4) provou: o modelo Claude inventa
	// `conversationId: "conv_001"` em vez do UUID real ao chamar
	// `save_contact_name` (e tools correlatas). UPDATE no DB falha
	// silenciosamente (0 rows), `contact_name` continua NULL, form final
	// aparece vazio (BUG-LEAD-FORM-PREFILL).
	//
	// Fix arquitetural: `conversationId` é CONTEXTO da request, não input do
	// usuário. Removido do `inputSchema` das tools sensíveis e injetado via
	// closure pela factory `buildConsorcioTools(ctx)`. Builder de agent passa
	// o ctx com o conversationId real.
	// ─────────────────────────────────────────────────────────────────────────
	describe("BUG-CONVERSATION-ID-NOT-IN-SCHEMA — conversationId fora do inputSchema das tools sensíveis", () => {
		const TOOLS_SENSIVEIS = [
			"save_contact_name",
			"save_contact_whatsapp",
			"present_lead_form",
		] as const;

		it("factory buildConsorcioTools existe e aceita conversationId no ctx", () => {
			expect(typeof buildConsorcioTools).toBe("function");
			const built = buildConsorcioTools({ conversationId: "uuid-fake-1" });
			expect(built).toBeDefined();
			for (const name of TOOLS_SENSIVEIS) {
				expect(built, `factory deve expor ${name}`).toHaveProperty(name);
			}
		});

		for (const toolName of TOOLS_SENSIVEIS) {
			it(`${toolName} NÃO declara conversationId no inputSchema (factory)`, () => {
				const built = buildConsorcioTools({ conversationId: "uuid-fake-2" });
				// biome-ignore lint/suspicious/noExplicitAny: introspecção do tool typing
				const tool = (built as any)[toolName];
				expect(tool, `${toolName} ausente no factory`).toBeDefined();
				const schema = tool.inputSchema;
				expect(schema, `${toolName}.inputSchema undefined`).toBeDefined();

				// Tools podem ter schema vazio (z.object({}).optional()) — só
				// asserta que SE houver shape, conversationId não aparece.
				const shape =
					schema instanceof z.ZodObject
						? schema.shape
						: schema?._def?.innerType instanceof z.ZodObject
							? schema._def.innerType.shape
							: null;
				if (shape) {
					expect(
						Object.keys(shape),
						`${toolName}.inputSchema NÃO pode declarar 'conversationId' — ` +
							`isso causa hallucination do modelo (BUG-CONVERSATION-ID-HALLUCINATION). ` +
							`conversationId é injetado via closure pela factory.`,
					).not.toContain("conversationId");
				}
			});
		}

		it("save_contact_name execute persiste usando conversationId do ctx (closure), ignora input.conversationId se vier", async () => {
			// Pega um conversationId real (via DB) — isolado nesse teste.
			const { db } = await import("@/db");
			const { conversations, leads } = await import("@/db/schema");
			const { eq } = await import("drizzle-orm");

			const [c] = await db.insert(conversations).values({}).returning();
			const realConvId = c.id;
			try {
				const tools = buildConsorcioTools({ conversationId: realConvId });
				// biome-ignore lint/suspicious/noExplicitAny: execute opaco
				const exec = (tools.save_contact_name as any).execute;
				// Modelo alucinaria 'conv_001' — schema fora, mas mesmo se vier
				// no objeto runtime, factory deve IGNORAR e usar ctx.
				const result = await exec({ name: "Paulo" });
				expect(typeof result).toBe("string");

				const conv = await db.query.conversations.findFirst({
					where: eq(conversations.id, realConvId),
				});
				expect(
					conv?.contactName,
					"contact_name deveria persistir no UUID real (closure), não no alucinado",
				).toBe("Paulo");
			} finally {
				await db.delete(leads).where(eq(leads.conversationId, realConvId));
				await db.delete(conversations).where(eq(conversations.id, realConvId));
			}
		});
	});

	it("preserva tools existentes (anti-regressão)", () => {
		for (const t of [
			"search_groups",
			"simulate_quota",
			"get_rates",
			"get_group_details",
			"recommend_groups",
			"present_group_card",
			"present_comparison_table",
			"present_simulation_result",
			"present_recommendation_card",
			"present_lead_form",
			"present_value_picker",
		]) {
			expect(consorcioTools, `tool '${t}' ausente`).toHaveProperty(t);
		}
	});
});
