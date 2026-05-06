/**
 * WhatsApp Cloud API client.
 * Handles all outbound messaging via Meta Graph API v21.0.
 */

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

export async function sendTextMessage(to: string, text: string) {
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
	const { accessToken, phoneNumberId } = getConfig();
	return callApi(phoneNumberId, accessToken, {
		to,
		type: "interactive",
		interactive: {
			type: "list",
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
		},
	});
}

export async function sendInteractiveMessage(
	to: string,
	interactive: Record<string, unknown>,
): Promise<void> {
	const { accessToken, phoneNumberId } = getConfig();
	await callApi(phoneNumberId, accessToken, {
		to,
		type: "interactive",
		interactive,
	});
}

export async function markAsRead(messageId: string) {
	const { accessToken, phoneNumberId } = getConfig();
	return callApi(phoneNumberId, accessToken, {
		status: "read",
		message_id: messageId,
	});
}

export async function sendTypingIndicator(messageId: string) {
	const { accessToken, phoneNumberId } = getConfig();
	return callApi(phoneNumberId, accessToken, {
		status: "read",
		message_id: messageId,
		typing_indicator: { type: "text" },
	});
}
