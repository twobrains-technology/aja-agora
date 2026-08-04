// Registro de conversões de mídia (integration-db).
//
// O que se prova aqui: o marco vira UM sinal, com PII só hasheada, sem contar
// teste interno — e a fila fica parada enquanto a flag está desligada.
//
// Skip se DATABASE_URL ausente.

import { and, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb("registro de conversão de mídia (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let registry: typeof import("./registry");
	let dispatch: typeof import("./dispatch");

	const visitIds: string[] = [];
	const convIds: string[] = [];
	const flagOriginal = process.env.CONVERSIONS_API_ENABLED;

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		registry = await import("./registry");
		dispatch = await import("./dispatch");
	});

	afterEach(() => {
		if (flagOriginal === undefined) delete process.env.CONVERSIONS_API_ENABLED;
		else process.env.CONVERSIONS_API_ENABLED = flagOriginal;
	});

	afterAll(async () => {
		// conversion_events cai por cascade da conversa/lead.
		if (convIds.length > 0) {
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
		if (visitIds.length > 0) {
			await db.delete(schema.visits).where(inArray(schema.visits.id, visitIds));
		}
	});

	async function semearLead(opcoes: {
		simulado?: boolean;
		phone?: string | null;
		email?: string | null;
		creditValue?: string | null;
		origem?: { fbclid?: string; ctwaClid?: string };
	}): Promise<string> {
		let visitId: string | null = null;
		if (opcoes.origem) {
			const [visita] = await db
				.insert(schema.visits)
				.values({
					visitorId: `v-${crypto.randomUUID()}`,
					channel: opcoes.origem.ctwaClid ? "whatsapp" : "web",
					fbclid: opcoes.origem.fbclid ?? null,
					ctwaClid: opcoes.origem.ctwaClid ?? null,
				})
				.returning({ id: schema.visits.id });
			visitIds.push(visita.id);
			visitId = visita.id;
		}

		const [conversa] = await db
			.insert(schema.conversations)
			.values({ channel: "web", visitId, isSimulated: opcoes.simulado ?? false })
			.returning({ id: schema.conversations.id });
		convIds.push(conversa.id);

		const [lead] = await db
			.insert(schema.leads)
			.values({
				conversationId: conversa.id,
				name: "Cliente Teste",
				phone: opcoes.phone === undefined ? "+5511988887777" : opcoes.phone,
				email: opcoes.email === undefined ? "Cliente@Exemplo.COM" : opcoes.email,
				creditValue: opcoes.creditValue === undefined ? "85000.00" : opcoes.creditValue,
				isSimulated: opcoes.simulado ?? false,
			})
			.returning({ id: schema.leads.id });

		return lead.id;
	}

	async function eventosDo(leadId: string) {
		return db
			.select()
			.from(schema.conversionEvents)
			.where(eq(schema.conversionEvents.leadId, leadId));
	}

	describe("registrarConversao", () => {
		it("registra o marco com PII apenas hasheada", async () => {
			const leadId = await semearLead({});

			await registry.registrarConversao({ leadId, eventName: "contrato_fechado" });
			const [evento] = await eventosDo(leadId);

			expect(evento).toMatchObject({
				eventName: "contrato_fechado",
				destination: "meta",
				status: "pending",
				actionSource: "website",
				currency: "BRL",
			});
			// sha256("cliente@exemplo.com") e sha256("5511988887777") — normalizados
			// antes do hash, como a Meta exige.
			expect(evento.hashedEmail).toBe(
				"ad2df71d41942d725885ffc3a9ca7b4b7227b4c324735678c9ee6eb972eb01bb",
			);
			expect(evento.hashedPhone).toBe(
				"fde042094c292fe26c1752aa7760e8090d8dbc01a0f464054c0da6b72d18e8ad",
			);
		});

		it("nunca guarda o telefone nem o e-mail em texto puro", async () => {
			const leadId = await semearLead({});

			await registry.registrarConversao({ leadId, eventName: "lead_qualificado" });
			const [evento] = await eventosDo(leadId);

			const serializado = JSON.stringify(evento);
			expect(serializado).not.toContain("5511988887777");
			expect(serializado).not.toContain("exemplo.com");
		});

		it("é idempotente — o mesmo marco não vira dois sinais", async () => {
			// Transição disparada duas vezes (retry, reentrega, admin clicando de
			// novo) não pode ensinar o algoritmo duas vezes com a mesma venda.
			const leadId = await semearLead({});

			await registry.registrarConversao({ leadId, eventName: "contrato_fechado" });
			await registry.registrarConversao({ leadId, eventName: "contrato_fechado" });

			expect(await eventosDo(leadId)).toHaveLength(1);
		});

		it("registra marcos diferentes do mesmo lead separadamente", async () => {
			const leadId = await semearLead({});

			await registry.registrarConversao({ leadId, eventName: "lead_qualificado" });
			await registry.registrarConversao({ leadId, eventName: "contrato_fechado" });

			expect(await eventosDo(leadId)).toHaveLength(2);
		});

		it("não registra conversão de lead simulado", async () => {
			const leadId = await semearLead({ simulado: true });

			await registry.registrarConversao({ leadId, eventName: "contrato_fechado" });

			expect(await eventosDo(leadId)).toHaveLength(0);
		});

		it("monta o fbc a partir do fbclid da visita", async () => {
			const leadId = await semearLead({ origem: { fbclid: "IwAR0teste" } });

			await registry.registrarConversao({ leadId, eventName: "contrato_fechado" });
			const [evento] = await eventosDo(leadId);

			expect(evento.fbc).toMatch(/^fb\.1\.\d+\.IwAR0teste$/);
		});

		it("marca conversa de Click-to-WhatsApp com o action_source próprio", async () => {
			const leadId = await semearLead({ origem: { ctwaClid: "AfXyZteste" } });

			await registry.registrarConversao({ leadId, eventName: "contrato_fechado" });
			const [evento] = await eventosDo(leadId);

			expect(evento).toMatchObject({
				actionSource: "business_messaging",
				ctwaClid: "AfXyZteste",
			});
		});

		it("registra mesmo sem identificador nenhum — o clique ainda pode casar depois", async () => {
			const leadId = await semearLead({ phone: null, email: null });

			await registry.registrarConversao({ leadId, eventName: "lead_qualificado" });
			const [evento] = await eventosDo(leadId);

			expect(evento).toMatchObject({ hashedEmail: null, hashedPhone: null, status: "pending" });
		});

		it("não explode com lead inexistente", async () => {
			await expect(
				registry.registrarConversao({ leadId: crypto.randomUUID(), eventName: "lead_qualificado" }),
			).resolves.toBeUndefined();
		});
	});

	describe("eventoDoEstagio", () => {
		it("mapeia só os estágios que valem sinal pra mídia", () => {
			expect(registry.eventoDoEstagio("qualificado")).toBe("lead_qualificado");
			expect(registry.eventoDoEstagio("proposta_enviada")).toBe("proposta_criada");
			expect(registry.eventoDoEstagio("fechado_ganho")).toBe("contrato_fechado");
		});

		it("ignora estágio intermediário — evento demais ensina o algoritmo a buscar curioso", () => {
			expect(registry.eventoDoEstagio("novo")).toBeNull();
			expect(registry.eventoDoEstagio("engajado")).toBeNull();
			expect(registry.eventoDoEstagio("perdido")).toBeNull();
		});
	});

	describe("transição de estágio dispara o registro", () => {
		it("registra a conversão quando o lead chega em fechado_ganho", async () => {
			const { transitionLeadStage } = await import("@/lib/admin/lead-transitions");
			const leadId = await semearLead({});

			await transitionLeadStage(leadId, "fechado_ganho", { type: "system" });

			const eventos = await eventosDo(leadId);
			expect(eventos).toHaveLength(1);
			expect(eventos[0].eventName).toBe("contrato_fechado");
		});

		it("não registra nada numa transição que não é marco de mídia", async () => {
			const { transitionLeadStage } = await import("@/lib/admin/lead-transitions");
			const leadId = await semearLead({});

			await transitionLeadStage(leadId, "engajado", { type: "system" });

			expect(await eventosDo(leadId)).toHaveLength(0);
		});
	});

	describe("despacharConversoesPendentes", () => {
		it("não envia nada e diz por quê enquanto a flag está desligada", async () => {
			process.env.CONVERSIONS_API_ENABLED = "false";
			const leadId = await semearLead({});
			await registry.registrarConversao({ leadId, eventName: "contrato_fechado" });

			const resultado = await dispatch.despacharConversoesPendentes();

			expect(resultado).toMatchObject({ enviados: 0, falhas: 0 });
			expect(resultado.desligado).toContain("CONVERSIONS_API_ENABLED");
		});

		it("deixa o evento em pending, e não em skipped, pra poder reenviar depois", async () => {
			// Este é o ponto da decisão: com a flag off o histórico ACUMULA. Marcar
			// como skipped esvaziaria o estoque que existe justamente pra alimentar
			// o algoritmo no dia em que a chave virar.
			process.env.CONVERSIONS_API_ENABLED = "false";
			const leadId = await semearLead({});
			await registry.registrarConversao({ leadId, eventName: "contrato_fechado" });

			await dispatch.despacharConversoesPendentes();

			const [evento] = await eventosDo(leadId);
			expect(evento.status).toBe("pending");
		});

		it("com a flag ligada mas sem credencial, avisa o que falta em vez de tentar", async () => {
			process.env.CONVERSIONS_API_ENABLED = "true";
			const pixelOriginal = process.env.META_PIXEL_ID;
			delete process.env.META_PIXEL_ID;

			const resultado = await dispatch.despacharConversoesPendentes();

			expect(resultado.desligado).toContain("META_PIXEL_ID");

			if (pixelOriginal !== undefined) process.env.META_PIXEL_ID = pixelOriginal;
		});
	});

	describe("marco zero", () => {
		it("apaga as conversões junto com a conversa", async () => {
			// O sinal do funil velho não pode ser reenviado pro algoritmo depois de
			// zerar a base — por isso conversion_events está em TABELAS_LIMPAS e
			// pende da conversa por cascade.
			const leadId = await semearLead({});
			await registry.registrarConversao({ leadId, eventName: "contrato_fechado" });

			const [lead] = await db
				.select({ conversationId: schema.leads.conversationId })
				.from(schema.leads)
				.where(eq(schema.leads.id, leadId));
			await db.delete(schema.conversations).where(eq(schema.conversations.id, lead.conversationId));

			const sobrou = await db
				.select()
				.from(schema.conversionEvents)
				.where(
					and(
						eq(schema.conversionEvents.leadId, leadId),
						eq(schema.conversionEvents.destination, "meta"),
					),
				);
			expect(sobrou).toHaveLength(0);
		});
	});
});
