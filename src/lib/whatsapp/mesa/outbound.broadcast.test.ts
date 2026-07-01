// FIX-124 — Camada 1 (unit, roda em test:unit). O transbordo faz BROADCAST a TODOS os
// atendentes de mesa com botão interativo "Vou atender" (não single-cast texto plano).
// Mocka a lista de atendentes e a API do WhatsApp — 100% determinístico, sem DB.

import { beforeEach, describe, expect, it, vi } from "vitest";

const sendReplyButtons = vi.fn(async () => ({ messageId: "sim-1" }));
const sendTextMessage = vi.fn(async () => ({ messageId: "sim-1" }));
const getMesaAttendantList = vi.fn();

vi.mock("@/lib/whatsapp/api", () => ({
	sendReplyButtons: (...args: unknown[]) => sendReplyButtons(...args),
	sendTextMessage: (...args: unknown[]) => sendTextMessage(...args),
}));
vi.mock("./routing", () => ({
	getMesaAttendantList: (...args: unknown[]) => getMesaAttendantList(...args),
}));

describe("FIX-124 — broadcast do transbordo (unit)", () => {
	beforeEach(() => {
		sendReplyButtons.mockClear();
		sendTextMessage.mockClear();
		getMesaAttendantList.mockReset();
	});

	const source = {
		lead: { name: "Maria Cliente", phone: "5562990000000" },
		proposal: {
			segmento: "imovel",
			administradora: "Canopus",
			grupo: "1234",
			creditValue: "200000.00",
			monthlyPayment: "1200.00",
			termMonths: 180,
			consortiumProposalLink: "https://bevi/x",
		},
	};

	it("envia sendReplyButtons a TODOS os atendentes ativos (1 por atendente)", async () => {
		getMesaAttendantList.mockResolvedValue([
			{ id: "a1", nome: "Ana", whatsapp: "5562911110001" },
			{ id: "a2", nome: "Bruno", whatsapp: "5562911110002" },
			{ id: "a3", nome: "Célia", whatsapp: "5562911110003" },
		]);
		const { broadcastCaseToAttendants } = await import("./outbound");

		await broadcastCaseToAttendants("handoff-xyz", source);

		expect(getMesaAttendantList).toHaveBeenCalledTimes(1);
		expect(sendReplyButtons).toHaveBeenCalledTimes(3);
		// NÃO usa single-cast de texto plano (herança do FIX-64)
		expect(sendTextMessage).not.toHaveBeenCalled();

		const phones = sendReplyButtons.mock.calls.map((c) => c[0]);
		expect(phones).toEqual(["5562911110001", "5562911110002", "5562911110003"]);
	});

	it("cada botão é 'Vou atender' e o id carrega o handoffId (pro claim)", async () => {
		getMesaAttendantList.mockResolvedValue([{ id: "a1", nome: "Ana", whatsapp: "5562911110001" }]);
		const { broadcastCaseToAttendants } = await import("./outbound");

		await broadcastCaseToAttendants("handoff-xyz", source);

		const [, body, buttons] = sendReplyButtons.mock.calls[0] as [
			string,
			string,
			Array<{ id: string; title: string }>,
		];
		expect(buttons).toHaveLength(1);
		expect(buttons[0].title).toBe("Vou atender");
		expect(buttons[0].id).toContain("handoff-xyz");
		// o corpo é o dossiê do caso (cliente/cota), sem PII sensível
		expect(body).toContain("Maria Cliente");
		expect(body).not.toContain("CPF:");
	});

	it("best-effort por destinatário: falha de um NÃO derruba os demais", async () => {
		getMesaAttendantList.mockResolvedValue([
			{ id: "a1", nome: "Ana", whatsapp: "5562911110001" },
			{ id: "a2", nome: "Bruno", whatsapp: "5562911110002" },
		]);
		sendReplyButtons.mockRejectedValueOnce(new Error("meta 500"));
		const { broadcastCaseToAttendants } = await import("./outbound");

		const res = await broadcastCaseToAttendants("handoff-xyz", source);
		expect(sendReplyButtons).toHaveBeenCalledTimes(2);
		expect(res.sent).toBe(1);
		expect(res.failed).toBe(1);
	});
});
