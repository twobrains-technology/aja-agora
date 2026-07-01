import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// FIX-66 — Integration (DB real): roteamento inbound do copiloto de mesa +
// persistência em mesa_copilot_messages. Spec: docs/visao/mesa-de-operacao.md
// §5 + §8 (sem colisão de canal — número de mesa nunca cai em vendas).
//
// Mocka APENAS a borda externa: o LLM (generateMesaCopilotReply) e o envio de
// WhatsApp (sendTextMessage). O DB é REAL (workspace OrbStack) — é o que este
// teste valida: handoff resolvido + msgs persistidas com os papéis certos.
// ============================================================================

const mocks = vi.hoisted(() => ({
	sendTextMock: vi.fn().mockResolvedValue(undefined),
	copilotReplyMock: vi.fn().mockResolvedValue("Beleza! Passo 1: acesse o portal do parceiro."),
}));

// FIX-173: mocka via o alias (@/lib/whatsapp/api), não o caminho relativo — desde
// que handleMesaCopilot passou a notificar via ./notify (que importa a api pelo
// alias), um vi.mock("../api", ...) não intercepta mais (Vitest não dedupa alias
// × relativo pro mesmo arquivo neste projeto — módulos diferentes no grafo).
vi.mock("@/lib/whatsapp/api", () => ({
	sendTextMessage: mocks.sendTextMock,
	sendReplyButtons: vi.fn().mockResolvedValue({ messageId: "sim-1" }),
	sendTypingIndicator: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/agent/mesa-copilot", () => ({
	generateMesaCopilotReply: mocks.copilotReplyMock,
}));

import { db } from "@/db";
import {
	administradoraDocs,
	administradoras,
	beviProposals,
	conversations,
	leads,
	mesaAttendants,
	mesaCopilotMessages,
	mesaHandoffs,
} from "@/db/schema";
import {
	getMesaAttendantList,
	handleMesaCopilot,
	invalidateMesaAttendantCache,
	isMesaAttendantPhone,
} from "./routing";

const MANUAL = "MANUAL CANOPUS-TEST — 1) portal; 2) grupo; 3) CPF; 4) carta; 5) boleto.";

type Seed = {
	administradoraId: string;
	conversationId: string;
	leadId: string;
	beviProposalId: string;
	mesaAttendantId: string;
	mesaHandoffId: string;
	attendantPhone: string;
};

const created: Seed[] = [];

async function seedCase(opts: { withOpenHandoff: boolean }): Promise<Seed> {
	const phone = `55629${Math.floor(100000000 + Math.random() * 800000000)}`;
	const [adm] = await db
		.insert(administradoras)
		.values({
			nome: `Canopus ${randomUUID().slice(0, 8)}`,
			slug: `canopus-${randomUUID().slice(0, 8)}`,
		})
		.returning();
	await db.insert(administradoraDocs).values({
		administradoraId: adm.id,
		titulo: "Manual de contratação",
		tipo: "manual",
		storageKey: `s3://test/${randomUUID()}.pdf`,
		textoExtraido: MANUAL,
		isActive: true,
	});
	const [conv] = await db.insert(conversations).values({ channel: "whatsapp" }).returning();
	const [lead] = await db
		.insert(leads)
		.values({ conversationId: conv.id, name: "Helena Souza", phone: "62999990000" })
		.returning();
	const [prop] = await db
		.insert(beviProposals)
		.values({
			conversationId: conv.id,
			leadId: lead.id,
			proposalId: `prop-${randomUUID().slice(0, 8)}`,
			administradora: adm.nome,
			grupo: "1234",
			creditValue: "80000",
			monthlyPayment: "950",
			termMonths: 80,
		})
		.returning();
	const [att] = await db
		.insert(mesaAttendants)
		.values({ nome: "Operador Teste", whatsapp: phone, isActive: true })
		.returning();
	const [handoff] = await db
		.insert(mesaHandoffs)
		.values({
			leadId: lead.id,
			conversationId: conv.id,
			beviProposalId: prop.id,
			mesaAttendantId: att.id,
			administradoraId: adm.id,
			status: opts.withOpenHandoff ? "aberto" : "concluido",
		})
		.returning();

	const seed: Seed = {
		administradoraId: adm.id,
		conversationId: conv.id,
		leadId: lead.id,
		beviProposalId: prop.id,
		mesaAttendantId: att.id,
		mesaHandoffId: handoff.id,
		attendantPhone: phone,
	};
	created.push(seed);
	invalidateMesaAttendantCache();
	return seed;
}

async function cleanup(seed: Seed) {
	// Ordem: filhos antes dos pais (FKs sem cascade total).
	await db
		.delete(mesaCopilotMessages)
		.where(eq(mesaCopilotMessages.mesaHandoffId, seed.mesaHandoffId));
	await db.delete(mesaHandoffs).where(eq(mesaHandoffs.id, seed.mesaHandoffId));
	await db.delete(mesaAttendants).where(eq(mesaAttendants.id, seed.mesaAttendantId));
	await db.delete(beviProposals).where(eq(beviProposals.id, seed.beviProposalId));
	await db.delete(leads).where(eq(leads.id, seed.leadId));
	await db.delete(conversations).where(eq(conversations.id, seed.conversationId));
	await db.delete(administradoras).where(eq(administradoras.id, seed.administradoraId));
}

beforeEach(() => {
	mocks.sendTextMock.mockClear();
	mocks.copilotReplyMock.mockClear();
	invalidateMesaAttendantCache();
});

afterEach(async () => {
	while (created.length) {
		const seed = created.pop();
		if (seed) await cleanup(seed);
	}
	invalidateMesaAttendantCache();
});

afterAll(async () => {
	// Garante limpeza mesmo se algum teste falhar no meio.
	while (created.length) {
		const seed = created.pop();
		if (seed) await cleanup(seed);
	}
});

describe("FIX-66 isMesaAttendantPhone — consulta a tabela mesa_attendants", () => {
	it("retorna true para WhatsApp de atendente de mesa ativo, false para desconhecido", async () => {
		const seed = await seedCase({ withOpenHandoff: true });
		expect(await isMesaAttendantPhone(seed.attendantPhone)).toBe(true);
		expect(await isMesaAttendantPhone("5511000000000")).toBe(false);
	});

	it("atendente inativo NÃO conta como atendente de mesa", async () => {
		const seed = await seedCase({ withOpenHandoff: true });
		await db
			.update(mesaAttendants)
			.set({ isActive: false })
			.where(eq(mesaAttendants.id, seed.mesaAttendantId));
		invalidateMesaAttendantCache();
		expect(await isMesaAttendantPhone(seed.attendantPhone)).toBe(false);
		const list = await getMesaAttendantList();
		expect(list.some((a) => a.id === seed.mesaAttendantId)).toBe(false);
	});
});

describe("FIX-66 handleMesaCopilot — handoff aberto: persiste e responde", () => {
	it("persiste a msg do atendente (attendant) + a resposta (assistant) e envia por WhatsApp", async () => {
		const seed = await seedCase({ withOpenHandoff: true });

		await handleMesaCopilot(seed.attendantPhone, "Como começo a contratação?");

		const msgs = await db
			.select()
			.from(mesaCopilotMessages)
			.where(eq(mesaCopilotMessages.mesaHandoffId, seed.mesaHandoffId));

		const roles = msgs.map((m) => m.role).sort();
		expect(roles).toEqual(["assistant", "attendant"]);
		const attendantMsg = msgs.find((m) => m.role === "attendant");
		const assistantMsg = msgs.find((m) => m.role === "assistant");
		expect(attendantMsg?.content).toBe("Como começo a contratação?");
		expect(assistantMsg?.content).toBe("Beleza! Passo 1: acesse o portal do parceiro.");

		// Enviou a resposta do copiloto pro WhatsApp do atendente.
		expect(mocks.sendTextMock).toHaveBeenCalledWith(
			seed.attendantPhone,
			"Beleza! Passo 1: acesse o portal do parceiro.",
		);
	});

	it("monta o dossiê do caso (manual da administradora + cota + cliente) e passa ao copiloto", async () => {
		const seed = await seedCase({ withOpenHandoff: true });

		await handleMesaCopilot(seed.attendantPhone, "passo a passo?");

		expect(mocks.copilotReplyMock).toHaveBeenCalledTimes(1);
		const arg = mocks.copilotReplyMock.mock.calls[0][0];
		// Administradora certa + doc com o texto extraído.
		expect(arg.caso.administradoraNome).toMatch(/Canopus/);
		expect(arg.caso.docs.some((d: { textoExtraido: string }) => d.textoExtraido === MANUAL)).toBe(
			true,
		);
		// Cota da proposta Bevi.
		expect(String(arg.caso.grupo)).toBe("1234");
		// Cliente.
		expect(arg.caso.clienteNome).toBe("Helena Souza");
		// Histórico inclui a fala do atendente do turno atual.
		expect(arg.history.at(-1)).toEqual({ role: "attendant", content: "passo a passo?" });
	});

	it("turno seguinte: histórico acumula (não duplica) e mantém ordem cronológica", async () => {
		const seed = await seedCase({ withOpenHandoff: true });

		await handleMesaCopilot(seed.attendantPhone, "primeira dúvida");
		mocks.copilotReplyMock.mockResolvedValueOnce("segunda resposta");
		await handleMesaCopilot(seed.attendantPhone, "segunda dúvida");

		const lastArg = mocks.copilotReplyMock.mock.calls[1][0];
		const contents = lastArg.history.map((h: { content: string }) => h.content);
		expect(contents).toEqual([
			"primeira dúvida",
			"Beleza! Passo 1: acesse o portal do parceiro.",
			"segunda dúvida",
		]);

		const msgs = await db
			.select()
			.from(mesaCopilotMessages)
			.where(eq(mesaCopilotMessages.mesaHandoffId, seed.mesaHandoffId));
		expect(msgs).toHaveLength(4);
	});

	// BUG-copiloto-sem-split-format (QA noturno 2026-06-21): o reply do LLM tem que
	// passar por formatTextForWhatsApp + splitMessage(4096) antes de enviar — igual
	// ao caminho de vendas. WhatsApp rejeita > 4096 chars e não renderiza markdown.
	it("reply longo é dividido em chunks ≤ 4096 ao enviar (WhatsApp não aceita > 4096)", async () => {
		const seed = await seedCase({ withOpenHandoff: true });
		const longReply = `${"Passo a passo bem detalhado da contratação. ".repeat(250)}`;
		expect(longReply.length).toBeGreaterThan(4096);
		mocks.copilotReplyMock.mockResolvedValueOnce(longReply);

		await handleMesaCopilot(seed.attendantPhone, "me explica tudo em detalhe");

		// Enviou em múltiplos chunks, cada um dentro do limite do WhatsApp.
		expect(mocks.sendTextMock.mock.calls.length).toBeGreaterThan(1);
		for (const call of mocks.sendTextMock.mock.calls) {
			expect(call[1].length).toBeLessThanOrEqual(4096);
		}

		// Persistência mantém UMA linha assistant com o reply CRU (histórico fiel).
		const assistantMsgs = (
			await db
				.select()
				.from(mesaCopilotMessages)
				.where(eq(mesaCopilotMessages.mesaHandoffId, seed.mesaHandoffId))
		).filter((m) => m.role === "assistant");
		expect(assistantMsgs).toHaveLength(1);
		expect(assistantMsgs[0].content).toBe(longReply);
	});

	it("markdown do LLM é convertido pro formato WhatsApp ao enviar (sem ## nem **)", async () => {
		const seed = await seedCase({ withOpenHandoff: true });
		mocks.copilotReplyMock.mockResolvedValueOnce(
			"## Primeiro passo\nAcesse o **portal do parceiro** da Canopus.",
		);

		await handleMesaCopilot(seed.attendantPhone, "primeiro passo?");

		const sent = mocks.sendTextMock.mock.calls.map((c) => c[1]).join("\n");
		expect(sent).not.toContain("## ");
		expect(sent).not.toContain("**");
		// O conteúdo (negrito WhatsApp com 1 asterisco) chega ao atendente.
		expect(sent).toMatch(/\*Primeiro passo\*/);
		expect(sent).toMatch(/\*portal do parceiro\*/);
	});
});

describe("FIX-66 handleMesaCopilot — SEM handoff aberto: ack, não chama o LLM, não cai em vendas", () => {
	it("número de mesa sem caso aberto recebe ack e o copiloto NÃO é chamado", async () => {
		const seed = await seedCase({ withOpenHandoff: false });

		await handleMesaCopilot(seed.attendantPhone, "oi, tem algo pra mim?");

		expect(mocks.copilotReplyMock).not.toHaveBeenCalled();
		expect(mocks.sendTextMock).toHaveBeenCalledTimes(1);
		expect(mocks.sendTextMock.mock.calls[0][1].toLowerCase()).toMatch(/nenhum caso|sua mesa/);

		// Nada persistido (não há handoff aberto pra anexar).
		const msgs = await db
			.select()
			.from(mesaCopilotMessages)
			.where(eq(mesaCopilotMessages.mesaHandoffId, seed.mesaHandoffId));
		expect(msgs).toHaveLength(0);
	});
});
