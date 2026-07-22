import { createHmac } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { updateLastInboundAt } from "@/app/actions/whatsapp";
import { markAsRead } from "@/lib/whatsapp/api";
import { withConversationLock } from "@/lib/whatsapp/conversation-lock";
import { handleDocumentInbound } from "@/lib/whatsapp/document-inbound";
import { claimInboundMessage } from "@/lib/whatsapp/once";
import { processInteractiveReply, processTextMessage } from "@/lib/whatsapp/processor";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN ?? "aja-agora-webhook-2026";

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
	// Lido em runtime (não em module-load) pra respeitar overrides de ambiente/teste
	// depois do import — sem WHATSAPP_APP_SECRET a verificação é pulada (dev/test).
	const appSecret = process.env.WHATSAPP_APP_SECRET;
	const rawBody = await req.text();

	if (appSecret) {
		const signature = req.headers.get("x-hub-signature-256");
		if (!signature) {
			console.warn("[whatsapp] Missing X-Hub-Signature-256 header");
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}
		const expectedSig = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
		if (signature !== expectedSig) {
			console.warn("[whatsapp] Invalid signature — request rejected");
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}
	}

	const body = JSON.parse(rawBody);
	const entry = body?.entry?.[0];
	const changes = entry?.changes?.[0];
	const value = changes?.value;

	// ---- Template status updates (message_template_status_update) ----
	// FIX-202: a Meta notifica aprovação/rejeição/pausa dos Message Templates por
	// aqui (não em `statuses`, que é entrega de mensagem). Reflete no
	// whatsappTemplates e, ao aprovar, esvazia a fila de confirmações (FIX-201).
	// Template desconhecido localmente é logado e ignorado (sem linha órfã).
	if (changes?.field === "message_template_status_update" && value) {
		const { applyTemplateStatusUpdate, parseTemplateStatusChange } = await import(
			"@/lib/whatsapp/template-sync"
		);
		applyTemplateStatusUpdate(parseTemplateStatusChange(value)).catch((err) =>
			console.error("[whatsapp] template status update failed:", err),
		);
		return NextResponse.json({ status: "ok" });
	}

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

			// IDEMPOTÊNCIA (obrigatória): a Meta REENTREGA webhook — ela re-tenta até
			// receber 200 e, mesmo com 200, pode repetir a entrega. Sem isto a MESMA
			// mensagem vira dois turnos (dois balões, dois gates, metadata
			// sobrescrito). `message.id` é único por mensagem; quem reivindicar
			// primeiro processa, a reentrega cai fora aqui. Ver src/lib/whatsapp/once.ts.
			if (message.id && !(await claimInboundMessage(message.id))) {
				console.log(`[whatsapp] Reentrega ignorada (já processada): ${message.id}`);
				continue;
			}

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

				// FIX-122 (D13): mídia inbound (Passo 6 KYC). A copy convida "me manda
				// a foto do RG/CNH aqui mesmo" — antes a imagem caía no default e era
				// dropada em silêncio. Agora baixa da Graph API e sobe pro MESMO destino
				// do web (uploadContractDocument). Async best-effort, mantém o 200
				// imediato como todo o resto do webhook.
				case "image":
				case "document": {
					const media = msgType === "image" ? message.image : message.document;
					const mediaId = media?.id;
					if (mediaId) {
						// Serializado como os demais inbounds: RG frente + verso chegam
						// em sequência e os dois escrevem `documentSlotsSent` no mesmo
						// metadata (lost update se rodarem em paralelo).
						withConversationLock(from, () =>
							handleDocumentInbound({
								from,
								mediaId,
								filename: message.document?.filename,
							}),
						).catch((err) => console.error("[whatsapp] Document inbound error:", err));
					} else {
						console.warn(`[whatsapp] ${msgType} inbound sem media id — ignorado`);
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
