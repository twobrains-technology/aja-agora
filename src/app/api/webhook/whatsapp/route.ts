import { createHmac } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { updateLastInboundAt } from "@/app/actions/whatsapp";
import { parseCtwaReferral } from "@/lib/attribution/referral";
import { recordWhatsAppVisit } from "@/lib/attribution/visit-store";
import { markAsRead } from "@/lib/whatsapp/api";
import { receberMidiaDoCliente } from "@/lib/whatsapp/midia-do-cliente";
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
		const { registrarStatusDaCampainha } = await import("@/lib/mesa/registrar-status-da-campainha");
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

			// Até 2026-08-15 a linha acima era TUDO o que acontecia com um status.
			//
			// Por isso o incidente da conversa `75f77efd` foi lido como desatenção
			// da mesa: a notificação do handoff levou 42 min para ser `delivered` e
			// 17h24 para ser `read`, e esse fato existia só como texto solto no
			// CloudWatch. Agora, quando o status pertence a uma notificação de
			// handoff, ele vira estado consultável e sinal. Fire-and-forget: a Meta
			// re-tenta webhook que não responde 200, e observabilidade não pode
			// provocar reenvio em loop.
			void registrarStatusDaCampainha(status);
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

			// Click-to-WhatsApp: a Meta manda a origem do anúncio SÓ aqui, junto da
			// primeira mensagem depois do clique. Não há segunda chance — se não
			// gravarmos agora, a conversa fica sem origem pra sempre e a campanha
			// de CTWA vira gasto sem leitura. Com `await` de propósito: o
			// processador cria a conversa logo abaixo e precisa achar esta visita.
			const referral = parseCtwaReferral(message.referral);
			if (referral) {
				console.log(
					`[whatsapp] Veio de anúncio | ad: ${referral.sourceId ?? "?"} | ctwa_clid: ${referral.ctwaClid ? "sim" : "não"}`,
				);
				await recordWhatsAppVisit(from, referral);
			}

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

				// Mídia inbound (foto do RG, comprovante, PDF, áudio) — um caminho só.
				//
				// `receberMidiaDoCliente` faz aqui a MESMA pergunta que o texto faz no
				// processor: quem responde este cliente agora? Havendo atendimento
				// humano, o arquivo vai para o atendente; senão, segue para o KYC do
				// agente. Antes eram dois handlers disparados lado a lado, nenhum dos
				// dois perguntava isso, e o documento sumia no meio do atendimento
				// (prod, 2026-08-18). Async best-effort, mantém o 200 imediato como
				// todo o resto do webhook.
				case "image":
				case "document":
				case "audio":
				// Vídeo e figurinha caíam no `default` — mesmo sumiço do documento, só
				// que por outro botão: o do vídeo fica ao lado do de áudio, e cliente
				// em atendimento grava o documento em vídeo sem pensar duas vezes.
				case "video":
				case "sticker": {
					const media =
						msgType === "image"
							? message.image
							: msgType === "document"
								? message.document
								: msgType === "audio"
									? message.audio
									: msgType === "video"
										? message.video
										: message.sticker;
					const mediaId = media?.id;
					if (mediaId) {
						receberMidiaDoCliente({
							from,
							mediaId,
							tipo: msgType,
							filename: message.document?.filename,
							caption: media?.caption,
						}).catch((err) => console.error("[whatsapp] Media inbound error:", err));
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
