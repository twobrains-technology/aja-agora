/**
 * WhatsApp Cloud API client.
 * Handles all outbound messaging via Meta Graph API v21.0.
 *
 * Quando `to` é um waId simulado (SIM-<uuid>), interceptamos antes de bater na
 * Meta API e publicamos o equivalente no `simulator-bus` pra que o painel
 * /admin/simulator/whatsapp renderize. Isso garante que o caminho de código do
 * agente seja o MESMO pra conversa real e simulada — só a saída externa muda.
 */
import { isSimulatedWaId, publishToClient } from "./simulator-bus";

const GRAPH_API = "https://graph.facebook.com/v21.0";

function getConfig() {
	const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
	const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
	if (!accessToken || !phoneNumberId) {
		throw new Error("WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID must be set");
	}
	return { accessToken, phoneNumberId };
}

async function callApi(
	phoneNumberId: string,
	accessToken: string,
	payload: Record<string, unknown>,
): Promise<{ messageId?: string; error?: string }> {
	const url = `${GRAPH_API}/${phoneNumberId}/messages`;
	try {
		const res = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				messaging_product: "whatsapp",
				...payload,
			}),
		});

		if (!res.ok) {
			const error = await res.text();
			console.error(`[whatsapp-api] Send failed (${res.status}):`, error);
			return { error };
		}

		const data = await res.json();
		const messageId = data.messages?.[0]?.id;
		if (messageId) console.log("[whatsapp-api] Sent:", messageId);
		return { messageId };
	} catch (err) {
		console.error("[whatsapp-api] Send error:", err);
		return { error: String(err) };
	}
}

function simulatedAck(): { messageId: string } {
	return { messageId: `sim-${crypto.randomUUID()}` };
}

export async function sendTextMessage(to: string, text: string) {
	if (isSimulatedWaId(to)) {
		publishToClient(to, { type: "text", text });
		return simulatedAck();
	}
	const { accessToken, phoneNumberId } = getConfig();
	return callApi(phoneNumberId, accessToken, {
		to,
		type: "text",
		text: { body: text },
	});
}

export async function sendReplyButtons(
	to: string,
	body: string,
	buttons: Array<{ id: string; title: string }>,
) {
	if (isSimulatedWaId(to)) {
		publishToClient(to, {
			type: "interactive",
			interactive: {
				type: "button",
				body: { text: body },
				action: {
					buttons: buttons.slice(0, 3).map((b) => ({
						type: "reply",
						reply: { id: b.id, title: b.title.slice(0, 20) },
					})),
				},
			},
		});
		return simulatedAck();
	}
	const { accessToken, phoneNumberId } = getConfig();
	return callApi(phoneNumberId, accessToken, {
		to,
		type: "interactive",
		interactive: {
			type: "button",
			body: { text: body },
			action: {
				buttons: buttons.slice(0, 3).map((b) => ({
					type: "reply",
					reply: { id: b.id, title: b.title.slice(0, 20) },
				})),
			},
		},
	});
}

export async function sendListMessage(
	to: string,
	body: string,
	buttonText: string,
	sections: Array<{
		title: string;
		rows: Array<{ id: string; title: string; description?: string }>;
	}>,
) {
	const listPayload = {
		type: "list" as const,
		body: { text: body },
		action: {
			button: buttonText.slice(0, 20),
			sections: sections.map((s) => ({
				title: s.title.slice(0, 24),
				rows: s.rows.slice(0, 10).map((r) => ({
					id: r.id,
					title: r.title.slice(0, 24),
					description: r.description?.slice(0, 72),
				})),
			})),
		},
	};
	if (isSimulatedWaId(to)) {
		publishToClient(to, { type: "interactive", interactive: listPayload });
		return simulatedAck();
	}
	const { accessToken, phoneNumberId } = getConfig();
	return callApi(phoneNumberId, accessToken, {
		to,
		type: "interactive",
		interactive: listPayload,
	});
}

export async function sendInteractiveMessage(
	to: string,
	interactive: Record<string, unknown>,
): Promise<void> {
	if (isSimulatedWaId(to)) {
		publishToClient(to, { type: "interactive", interactive });
		return;
	}
	const { accessToken, phoneNumberId } = getConfig();
	await callApi(phoneNumberId, accessToken, {
		to,
		type: "interactive",
		interactive,
	});
}

export async function markAsRead(messageId: string) {
	// `messageId` é do Meta — pra conversa simulada não temos esse id (no-op).
	if (messageId.startsWith("sim-")) return simulatedAck();
	const { accessToken, phoneNumberId } = getConfig();
	return callApi(phoneNumberId, accessToken, {
		status: "read",
		message_id: messageId,
	});
}

export async function sendTypingIndicator(messageId: string) {
	// Mesma lógica do markAsRead. Pra cliente simulado, o typing é publicado
	// diretamente pelo processor via `publishToClient(waId, {type:"typing"})`.
	if (messageId.startsWith("sim-")) return simulatedAck();
	const { accessToken, phoneNumberId } = getConfig();
	return callApi(phoneNumberId, accessToken, {
		status: "read",
		message_id: messageId,
		typing_indicator: { type: "text" },
	});
}
