// QA autônomo Frente 3 (2026-07-01) — FIX-173: outbound da mesa (copiloto, claim,
// broadcast) chamava sendTextMessage/sendReplyButtons DIRETO de "../api", sem nunca
// espelhar pro simulator-bus (publishToAttendant) — diferente do chat de vendas
// (proxy.ts's sendToAttendant), que sempre espelha. Efeito: o painel dev
// /admin/simulator/attendant nunca mostrava nada da mesa (broadcast/copiloto/claim),
// bloqueando qualquer E2E de TELA real desses fluxos. notifyMesaAttendant(Buttons)
// fecha o gap: sempre publica no bus; só pula a chamada real à Meta API quando o
// telefone é sintético (SIM-, convenção de teste — isSimulatedWaId).
import { afterEach, describe, expect, it, vi } from "vitest";

const sendTextMessage = vi.fn(async () => ({ messageId: "meta-1" }));
const sendReplyButtons = vi.fn(async () => ({ messageId: "meta-1" }));
// Mocka pelo alias (@/lib/whatsapp/api) — é assim que notify.ts importa a api real,
// e é a convenção que a maioria dos testes da mesa já usa (ver FIX-173).
vi.mock("@/lib/whatsapp/api", () => ({
	sendTextMessage: (...a: unknown[]) => sendTextMessage(...a),
	sendReplyButtons: (...a: unknown[]) => sendReplyButtons(...a),
}));

import { subscribeToAttendant } from "../simulator-bus";
import { notifyMesaAttendant, notifyMesaAttendantButtons } from "./notify";

describe("notifyMesaAttendant — espelha pro simulador dev + Meta real conforme o telefone", () => {
	afterEach(() => {
		sendTextMessage.mockClear();
		sendReplyButtons.mockClear();
	});

	it("telefone REAL: chama a Meta API E publica no bus do simulador", async () => {
		const phone = "5562988880001";
		const received: unknown[] = [];
		const unsub = subscribeToAttendant(phone, (m) => received.push(m));

		await notifyMesaAttendant(phone, "Você assumiu o caso");

		expect(sendTextMessage).toHaveBeenCalledWith(phone, "Você assumiu o caso");
		expect(received).toHaveLength(1);
		unsub();
	});

	it("telefone SIMULADO (SIM-): NÃO chama a Meta API, só publica no bus", async () => {
		const phone = "SIM-ATT-teste-1";
		const received: unknown[] = [];
		const unsub = subscribeToAttendant(phone, (m) => received.push(m));

		await notifyMesaAttendant(phone, "Você assumiu o caso");

		expect(sendTextMessage).not.toHaveBeenCalled();
		expect(received).toHaveLength(1);
		unsub();
	});

	it("botões: telefone SIMULADO recebe o payload interactive no bus, sem chamar a Meta API", async () => {
		const phone = "SIM-ATT-teste-2";
		const received: Array<{ interactive?: unknown }> = [];
		const unsub = subscribeToAttendant(phone, (m) => received.push(m));

		await notifyMesaAttendantButtons(phone, "Novo caso na mesa", [
			{ id: "mesa_claim:abc", title: "Vou atender" },
		]);

		expect(sendReplyButtons).not.toHaveBeenCalled();
		expect(received).toHaveLength(1);
		expect(received[0].interactive).toMatchObject({
			type: "button",
			action: { buttons: [{ reply: { id: "mesa_claim:abc", title: "Vou atender" } }] },
		});
		unsub();
	});

	it("botões: telefone REAL chama sendReplyButtons (comportamento de produção inalterado)", async () => {
		const phone = "5562988880002";
		await notifyMesaAttendantButtons(phone, "Novo caso na mesa", [
			{ id: "mesa_claim:abc", title: "Vou atender" },
		]);
		expect(sendReplyButtons).toHaveBeenCalledWith(phone, "Novo caso na mesa", [
			{ id: "mesa_claim:abc", title: "Vou atender" },
		]);
	});
});
