// O aviso do caso novo pro atendente não pode depender de ninguém clicar.
//
// Reportado por Kairo (2026-07-30): proposta fechada no WhatsApp não chegou ao
// atendente da mesa. Fora da janela de 24h a Meta só entrega Message Template
// aprovado, e o runtime resolve o template pela `usageKey` no banco. Enquanto
// essa linha dependia de um cadastro manual no admin, cada ambiente novo (e o
// próximo reset de base) voltava a ficar mudo em silêncio.
//
// Dois invariantes, as duas metades do mesmo problema:
//   1. a linha `mesa_novo_caso` chega pela migration, em qualquer ambiente;
//   2. estando ela em análise, o envio pergunta o status à Meta antes de
//      desistir — a promoção pra APPROVED não pode depender só do webhook.
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	listTemplates: vi.fn().mockResolvedValue([]),
	flushOutboundQueue: vi.fn().mockResolvedValue({ sent: 0, failed: 0 }),
}));

vi.mock("./api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./api")>();
	return { ...actual, listTemplates: mocks.listTemplates };
});
vi.mock("./template-dispatch", () => ({ flushOutboundQueue: mocks.flushOutboundQueue }));

import { db } from "@/db";
import { whatsappTemplates } from "@/db/schema";
import {
	MESA_NOVO_CASO_TEMPLATE_ID,
	MESA_NOVO_CASO_TEMPLATE_NAME,
	MESA_NOVO_CASO_USAGE_KEY,
} from "./mesa/notify";
import { reconciliarSePendente } from "./template-sync";

const RUN = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("test_sentinel");
const describeIfDb = RUN ? describe : describe.skip;

async function linhaDaMesa() {
	const [row] = await db
		.select()
		.from(whatsappTemplates)
		.where(eq(whatsappTemplates.usageKey, MESA_NOVO_CASO_USAGE_KEY))
		.limit(1);
	return row ?? null;
}

describeIfDb("template da mesa não depende de cadastro manual", () => {
	it("a migration entregou a linha `mesa_novo_caso` ligada ao template da Meta", async () => {
		const row = await linhaDaMesa();
		expect(row, "sem esta linha o atendente fica sem aviso fora da janela de 24h").not.toBeNull();
		expect(row?.metaName).toBe(MESA_NOVO_CASO_TEMPLATE_NAME);
		expect(row?.metaTemplateId).toBe(MESA_NOVO_CASO_TEMPLATE_ID);
		expect(row?.language).toBe("pt_BR");
		expect(row?.category).toBe("UTILITY");
	});

	it("o corpo tem exatamente uma variável — é o que o disparo preenche", async () => {
		const row = await linhaDaMesa();
		const body = (row?.components ?? []).find((c) => c.type === "BODY");
		const indices = [...(body?.text ?? "").matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => m[1]);
		expect(indices, `corpo: ${body?.text}`).toEqual(["1"]);
	});

	it("o texto que o atendente lê está em português correto, com acento", async () => {
		const row = await linhaDaMesa();
		const texto = (row?.components ?? []).map((c) => c.text ?? "").join(" ");
		expect(texto).toContain("está aguardando atendimento");
		expect(texto).toContain("sequência");
		expect(texto).toContain("operação");
	});
});

describeIfDb("reconciliação de status sob demanda", () => {
	let criados: string[] = [];

	async function comStatus(
		status: "PENDING" | "APPROVED" | "REJECTED" | "PAUSED",
		lastSyncedAt?: Date,
	): Promise<string> {
		const usageKey = `teste_reconciliacao_${crypto.randomUUID().slice(0, 8)}`;
		const [row] = await db
			.insert(whatsappTemplates)
			.values({
				usageKey,
				metaName: `t_${usageKey}`,
				language: "pt_BR",
				status,
				...(lastSyncedAt ? { lastSyncedAt } : {}),
			})
			.returning({ id: whatsappTemplates.id, usageKey: whatsappTemplates.usageKey });
		criados.push(row.id);
		return row.usageKey as string;
	}

	beforeEach(() => {
		mocks.listTemplates.mockClear();
		mocks.listTemplates.mockResolvedValue([]);
	});

	afterEach(async () => {
		for (const id of criados)
			await db.delete(whatsappTemplates).where(eq(whatsappTemplates.id, id));
		criados = [];
	});

	it("template em análise e nunca sincronizado → vai perguntar à Meta", async () => {
		const usageKey = await comStatus("PENDING");
		await expect(reconciliarSePendente(usageKey)).resolves.toBe(true);
		expect(mocks.listTemplates).toHaveBeenCalled();
	});

	it("template já aprovado → não gasta chamada", async () => {
		const usageKey = await comStatus("APPROVED");
		await expect(reconciliarSePendente(usageKey)).resolves.toBe(false);
		expect(mocks.listTemplates).not.toHaveBeenCalled();
	});

	it("sincronizado há pouco → segura a mão (throttle)", async () => {
		const usageKey = await comStatus("PENDING", new Date(Date.now() - 30_000));
		await expect(reconciliarSePendente(usageKey)).resolves.toBe(false);
		expect(mocks.listTemplates).not.toHaveBeenCalled();
	});

	it("sincronizado há muito tempo → tenta de novo", async () => {
		const usageKey = await comStatus("PENDING", new Date(Date.now() - 60 * 60 * 1000));
		await expect(reconciliarSePendente(usageKey)).resolves.toBe(true);
	});

	it("Meta fora do ar não derruba o envio", async () => {
		mocks.listTemplates.mockRejectedValueOnce(new Error("Graph 503"));
		const usageKey = await comStatus("PENDING");
		await expect(reconciliarSePendente(usageKey)).resolves.toBe(false);
	});

	it("chave inexistente é silêncio, não erro", async () => {
		await expect(reconciliarSePendente("nao_existe_essa_chave")).resolves.toBe(false);
		expect(mocks.listTemplates).not.toHaveBeenCalled();
	});
});
