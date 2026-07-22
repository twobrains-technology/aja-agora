// Camada 1 (integração, DB real) — FIX-201: resolução de envio por janela + fila.
//
// Bug-alvo: a confirmação de contratação é enviada como TEXTO LIVRE direto pro
// celular do cliente (sendContractSummary/closingPresentation). Fora da janela de
// 24h (caso web→WhatsApp), a Meta BLOQUEIA texto livre business-initiated — a
// confirmação some. Falta uma camada única que decida COMO enviar (texto livre na
// janela; template fora dela; fila quando o template ainda não foi aprovado) e uma
// fila que garanta a entrega ao aprovar.
//
// Estratégia: DB real (Postgres do workspace, migrado) + `sendTemplate`/
// `sendTextMessage` mockados (nunca batemos na Graph). `isWindowOpen` roda REAL
// contra uma `conversations` com `lastInboundAt` controlado.
// Ver docs/design/specs/2026-07-02-whatsapp-templates-meta-design.md.

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	sendTemplate: vi.fn(),
	sendTextMessage: vi.fn(),
}));

vi.mock("./api", () => ({
	sendTemplate: mocks.sendTemplate,
	sendTextMessage: mocks.sendTextMessage,
}));

import { db } from "@/db";
import { conversations, whatsappOutboundQueue, whatsappTemplates } from "@/db/schema";
import { flushOutboundQueue, resolveAndSend } from "./template-dispatch";

// Gate: só roda com DB real (o sentinel do vitest.setup NÃO conta). No host sem
// Postgres migrado o bloco inteiro é pulado; no container do gate ele executa.
const RUN = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("test_sentinel");

const created = { convIds: [] as string[], usageKeys: [] as string[] };

/** usageKey aleatório rastreado pra cleanup — evita colisão no unique index. */
function randomKey(): string {
	const k = `uk-${crypto.randomUUID()}`;
	created.usageKeys.push(k);
	return k;
}

async function makeConversation(open: boolean): Promise<string> {
	const [row] = await db
		.insert(conversations)
		.values({ waId: `TEST-${crypto.randomUUID()}`, lastInboundAt: open ? new Date() : null })
		.returning({ id: conversations.id });
	created.convIds.push(row.id);
	return row.id;
}

async function makeTemplate(usageKey: string, status: "APPROVED" | "PENDING" | "DRAFT") {
	await db.insert(whatsappTemplates).values({
		usageKey,
		metaName: `tmpl_${usageKey}`,
		language: "pt_BR",
		status,
		components: [{ type: "BODY", text: "Olá {{1}}" }],
	});
}

beforeEach(() => {
	mocks.sendTemplate.mockReset().mockResolvedValue({ messageId: "wamid.TMPL" });
	mocks.sendTextMessage.mockReset().mockResolvedValue({ messageId: "wamid.TXT" });
});

afterEach(async () => {
	for (const uk of created.usageKeys) {
		await db.delete(whatsappOutboundQueue).where(eq(whatsappOutboundQueue.usageKey, uk));
		await db.delete(whatsappTemplates).where(eq(whatsappTemplates.usageKey, uk));
	}
	for (const id of created.convIds) {
		await db.delete(conversations).where(eq(conversations.id, id));
	}
	created.convIds = [];
	created.usageKeys = [];
	vi.restoreAllMocks();
});

describe.skipIf(!RUN)("FIX-201 — resolveAndSend (janela decide o canal)", () => {
	it("janela ABERTA → executa freeTextFallback, não toca template nem fila", async () => {
		const conversationId = await makeConversation(true);
		const uk = randomKey();
		await makeTemplate(uk, "APPROVED"); // mesmo aprovado, janela aberta manda texto livre
		const fallback = vi.fn().mockResolvedValue(undefined);

		const res = await resolveAndSend({
			to: "5562999990000",
			conversationId,
			usageKey: uk,
			params: { body: ["ANCORA"] },
			freeTextFallback: fallback,
		});

		expect(fallback).toHaveBeenCalledTimes(1);
		expect(mocks.sendTemplate).not.toHaveBeenCalled();
		expect(res.channel).toBe("free_text");
		const q = await db
			.select()
			.from(whatsappOutboundQueue)
			.where(eq(whatsappOutboundQueue.usageKey, uk));
		expect(q).toHaveLength(0);
	});

	it("janela FECHADA + template APPROVED → sendTemplate com componentes mapeados, sem freeText", async () => {
		const conversationId = await makeConversation(false);
		const uk = randomKey();
		await makeTemplate(uk, "APPROVED");
		const fallback = vi.fn();

		const res = await resolveAndSend({
			to: "5562988887777",
			conversationId,
			usageKey: uk,
			params: { body: ["ANCORA"] },
			freeTextFallback: fallback,
		});

		expect(fallback).not.toHaveBeenCalled();
		expect(mocks.sendTemplate).toHaveBeenCalledTimes(1);
		const [to, name, lang, components] = mocks.sendTemplate.mock.calls[0];
		expect(to).toBe("5562988887777");
		expect(name).toBe(`tmpl_${uk}`);
		expect(lang).toBe("pt_BR");
		expect(components).toEqual([{ type: "body", parameters: [{ type: "text", text: "ANCORA" }] }]);
		expect(res.channel).toBe("template");
	});

	it("janela FECHADA + template PENDING → enfileira pending + alerta admin, não envia", async () => {
		const conversationId = await makeConversation(false);
		const uk = randomKey();
		await makeTemplate(uk, "PENDING");
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const fallback = vi.fn();

		const res = await resolveAndSend({
			to: "5562977776666",
			conversationId,
			usageKey: uk,
			params: { body: ["X"] },
			freeTextFallback: fallback,
		});

		expect(fallback).not.toHaveBeenCalled();
		expect(mocks.sendTemplate).not.toHaveBeenCalled();
		expect(res.channel).toBe("queued");
		const q = await db
			.select()
			.from(whatsappOutboundQueue)
			.where(eq(whatsappOutboundQueue.usageKey, uk));
		expect(q).toHaveLength(1);
		expect(q[0].status).toBe("pending");
		expect(q[0].to).toBe("5562977776666");
		expect(q[0].params).toEqual({ body: ["X"] });
		expect(warnSpy).toHaveBeenCalled(); // alerta admin = log estruturado claro
	});

	it("janela FECHADA + usageKey sem template cadastrado → enfileira (nada se perde)", async () => {
		const conversationId = await makeConversation(false);
		const uk = randomKey(); // nenhum template inserido
		const res = await resolveAndSend({
			to: "5562900001111",
			conversationId,
			usageKey: uk,
			params: { body: ["X"] },
			freeTextFallback: vi.fn(),
		});
		expect(res.channel).toBe("queued");
		const q = await db
			.select()
			.from(whatsappOutboundQueue)
			.where(eq(whatsappOutboundQueue.usageKey, uk));
		expect(q).toHaveLength(1);
	});
});

describe.skipIf(!RUN)("FIX-201 — flushOutboundQueue (entrega garantida ao aprovar)", () => {
	it("envia todas as pendentes do usageKey e marca sent", async () => {
		const uk = randomKey();
		await makeTemplate(uk, "APPROVED");
		await db.insert(whatsappOutboundQueue).values([
			{ to: "5562111112222", usageKey: uk, params: { body: ["A"] }, status: "pending" },
			{ to: "5562333334444", usageKey: uk, params: { body: ["B"] }, status: "pending" },
		]);

		const res = await flushOutboundQueue(uk);

		expect(res.sent).toBe(2);
		expect(mocks.sendTemplate).toHaveBeenCalledTimes(2);
		const rows = await db
			.select()
			.from(whatsappOutboundQueue)
			.where(eq(whatsappOutboundQueue.usageKey, uk));
		expect(rows.every((r) => r.status === "sent")).toBe(true);
		expect(rows.every((r) => r.sentAt != null)).toBe(true);
	});

	it("em falha: mantém pending, incrementa attempts e guarda lastError (nunca marca sent)", async () => {
		const uk = randomKey();
		await makeTemplate(uk, "APPROVED");
		await db
			.insert(whatsappOutboundQueue)
			.values({ to: "5562555556666", usageKey: uk, params: { body: ["A"] }, status: "pending" });
		mocks.sendTemplate.mockResolvedValue({ error: "meta 400 invalid param" });

		const res = await flushOutboundQueue(uk);

		expect(res.sent).toBe(0);
		expect(res.failed).toBe(1);
		const [row] = await db
			.select()
			.from(whatsappOutboundQueue)
			.where(eq(whatsappOutboundQueue.usageKey, uk));
		expect(row.status).toBe("pending");
		expect(row.attempts).toBe(1);
		expect(row.lastError).toContain("meta 400");
	});

	it("é idempotente — rodar 2x não reenvia as já sent", async () => {
		const uk = randomKey();
		await makeTemplate(uk, "APPROVED");
		await db
			.insert(whatsappOutboundQueue)
			.values({ to: "5562777778888", usageKey: uk, params: { body: ["A"] }, status: "pending" });

		await flushOutboundQueue(uk);
		await flushOutboundQueue(uk);

		expect(mocks.sendTemplate).toHaveBeenCalledTimes(1);
	});
});
