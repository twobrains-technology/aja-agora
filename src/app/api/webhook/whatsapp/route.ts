import { createHmac } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { markAsRead } from "@/lib/whatsapp/api";
import { processInteractiveReply, processTextMessage } from "@/lib/whatsapp/processor";
import { updateLastInboundAt } from "@/app/actions/whatsapp";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN ?? "aja-agora-webhook-2026";
const APP_SECRET = process.env.WHATSAPP_APP_SECRET;

/**
 * GET — Meta webhook verification (hub.challenge handshake).
 */
export async function GET(req: NextRequest) {
	const params = req.nextUrl.searchParams;
	const mode = params.get("hub.mode");
	const token = params.get("hub.verify_token");
	const challenge = params.get("hub.challenge");

	if (mode === "subscribe" && token === VERIFY_TOKEN) {
		console.log("[whatsapp] Webhook verified ✓");
		return new Response(challenge, { status: 200 });
	}

	console.warn("[whatsapp] Verification failed — token mismatch");
	return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/**
 * POST — Incoming messages and status updates from WhatsApp Cloud API.
 * Returns 200 immediately — AI processing runs async.
 */
export async function POST(req: NextRequest) {
	// ---- Signature verification ----
	const rawBody = await req.text();

	if (APP_SECRET) {
		const signature = req.headers.get("x-hub-signature-256");
		if (!signature) {
			console.warn("[whatsapp] Missing X-Hub-Signature-256 header");
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}
		const expectedSig = `sha256=${createHmac("sha256", APP_SECRET).update(rawBody).digest("hex")}`;
		if (signature !== expectedSig) {
			console.warn("[whatsapp] Invalid signature — request rejected");
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}
	}

	const body = JSON.parse(rawBody);
	const entry = body?.entry?.[0];
	const changes = entry?.changes?.[0];
	const value = changes?.value;

	// ---- Status updates (sent, delivered, read) ----
	if (value?.statuses) {
		for (const status of value.statuses) {
			const level = status.status === "failed" ? "error" : "log";
			const msg = `[whatsapp] Status: ${status.status} | msg: ${status.id} | to: ${status.recipient_id}`;
			if (level === "error") {
				const errCode = status.errors?.[0]?.code;
				const errTitle = status.errors?.[0]?.title;
				console.error(`${msg} | error: ${errCode} ${errTitle}`);
			} else {
				console.log(msg);
			}
		}
		return NextResponse.json({ status: "ok" });
	}

	// ---- Incoming messages ----
	if (value?.messages) {
		// Extract contact name from payload
		const contacts = value.contacts;
		const contactName = contacts?.[0]?.profile?.name;

		for (const message of value.messages) {
			const from = message.from;
			const msgType = message.type;

			console.log(
				`[whatsapp] Message from ${from} (${contactName ?? "unknown"}) | type: ${msgType}`,
			);

			// Mark as read so the customer's blue checks update; typing indicator
			// is fired later in the processor only on the AI path.
			markAsRead(message.id).catch(() => {});

			// FIX-86: Atualiza lastInboundAt ao receber mensagem do cliente.
			// Isso abre/reabre a janela de 24h para texto livre.
			updateLastInboundAt(from, message.id).catch((err) =>
				console.error("[whatsapp] Update lastInboundAt failed:", err),
			);

			switch (msgType) {
				case "text": {
					const text = message.text?.body;
					if (text) {
						console.log(`[whatsapp] Text: "${text}"`);
						processTextMessage(from, text, contactName, message.id).catch((err) =>
							console.error("[whatsapp] Processor error:", err),
						);
					}
					break;
				}

				case "interactive": {
					const interactive = message.interactive;
					if (interactive?.type === "button_reply") {
						const reply = interactive.button_reply;
						console.log(`[whatsapp] Button reply: ${reply.id} — "${reply.title}"`);
						processInteractiveReply(from, reply.id, reply.title, contactName, message.id).catch(
							(err) => console.error("[whatsapp] Interactive processor error:", err),
						);
					} else if (interactive?.type === "list_reply") {
						const reply = interactive.list_reply;
						console.log(`[whatsapp] List reply: ${reply.id} — "${reply.title}"`);
						processInteractiveReply(from, reply.id, reply.title, contactName, message.id).catch(
							(err) => console.error("[whatsapp] Interactive processor error:", err),
						);
					}
					break;
				}

				default:
					console.log(`[whatsapp] Unhandled type: ${msgType}`);
			}
		}
	}

	// Always return 200 immediately — Meta retries on non-2xx
	return NextResponse.json({ status: "ok" });
}
