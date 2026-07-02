// Mesa de operação — outbound pro atendente COM espelho pro simulador dev (FIX-173).
//
// Espelha o padrão do sendToAttendant do chat de vendas (proxy.ts): toda mensagem
// que vai pro WhatsApp de um atendente TAMBÉM é publicada no simulator-bus, pra que
// /admin/simulator/attendant renderize sem precisar de um segundo número real. A
// chamada real à Meta API só é pulada quando o telefone é sintético (convenção
// SIM-, mesma de isSimulatedWaId) — atendente real de produção continua recebendo
// no WhatsApp de verdade, como sempre.
import { sendReplyButtons, sendTextMessage } from "@/lib/whatsapp/api";
import { isSimulatedWaId, publishToAttendant } from "../simulator-bus";

export async function notifyMesaAttendant(phone: string, text: string): Promise<void> {
	if (!isSimulatedWaId(phone)) {
		await sendTextMessage(phone, text);
	}
	publishToAttendant(phone, text);
}

export async function notifyMesaAttendantButtons(
	phone: string,
	text: string,
	buttons: Array<{ id: string; title: string }>,
): Promise<{ messageId?: string; error?: string }> {
	const interactive = {
		type: "button",
		body: { text },
		action: { buttons: buttons.slice(0, 3).map((b) => ({ type: "reply", reply: b })) },
	};
	const result = isSimulatedWaId(phone)
		? { messageId: `sim-${crypto.randomUUID()}` }
		: await sendReplyButtons(phone, text, buttons);
	publishToAttendant(phone, text, { interactive });
	return result;
}
