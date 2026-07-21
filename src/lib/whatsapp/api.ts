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

// Timeout dos fetches à Graph API (ms). Egress lento pendura a request ~30s e
// vira 502 do gateway — cortamos em 15s e traduzimos o abort num erro claro.
const GRAPH_TIMEOUT_MS = 15_000;

/**
 * `true` quando o erro veio do AbortSignal.timeout estourar (o navegador/Node
 * lança um DOMException `TimeoutError`; alguns runtimes usam `AbortError`).
 */
function isTimeoutError(err: unknown): boolean {
	return err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
}

function getConfig() {
	const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
	const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
	if (!accessToken || !phoneNumberId) {
		throw new Error("WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID must be set");
	}
	return { accessToken, phoneNumberId };
}

// Criar/listar templates é no WABA (WhatsApp Business Account ID), não no
// phone number id — endpoint /{WABA_ID}/message_templates. Mesmo padrão de
// falha-alto do getConfig() quando a env não está setada.
function getWabaConfig() {
	const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
	const wabaId = process.env.WHATSAPP_WABA_ID;
	if (!accessToken || !wabaId) {
		throw new Error("WHATSAPP_ACCESS_TOKEN and WHATSAPP_WABA_ID must be set");
	}
	return { accessToken, wabaId };
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
			signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
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
		if (isTimeoutError(err)) {
			console.error("[whatsapp-api] Send timeout (>15s) ao falar com a Meta");
			return { error: "timeout ao falar com a Meta (>15s)" };
		}
		console.error("[whatsapp-api] Send error:", err);
		return { error: String(err) };
	}
}

function simulatedAck(): { messageId: string } {
	return { messageId: `sim-${crypto.randomUUID()}` };
}

export async function sendTextMessage(to: string, text: string) {
	// Visibilidade de saída (LGPD: telefone mascarado, texto truncado). Sem isto o
	// log só mostrava "Sent: wamid…" e era impossível saber O QUE o bot enviou —
	// inclusive se foi o "me perdi" (bug de prod 2026-07-02).
	const maskedTo = to.length > 6 ? `${to.slice(0, 4)}…${to.slice(-2)}` : to;
	console.log(
		`[whatsapp-out:text] to=${maskedTo} chars=${text.length} text=${JSON.stringify(text.slice(0, 140))}`,
	);
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

/** Envia um DOCUMENTO (a proposta em PDF) por link. A Meta baixa o arquivo da
 * URL, então ela precisa ser pública ou pré-assinada — o caller usa a URL
 * assinada do S3. Na conversa simulada não há Meta pra buscar o arquivo: cai
 * como texto com o link, que é o que dá pra fazer e não finge envio. */
export async function sendDocumentMessage(
	to: string,
	link: string,
	filename: string,
	caption?: string,
) {
	const maskedTo = to.length > 6 ? `${to.slice(0, 4)}…${to.slice(-2)}` : to;
	console.log(`[whatsapp-out:document] to=${maskedTo} filename=${JSON.stringify(filename)}`);
	if (isSimulatedWaId(to)) {
		publishToClient(to, { type: "text", text: `${caption ?? filename}\n${link}` });
		return simulatedAck();
	}
	const { accessToken, phoneNumberId } = getConfig();
	return callApi(phoneNumberId, accessToken, {
		to,
		type: "document",
		document: { link, filename, ...(caption ? { caption } : {}) },
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

/** Devolve o resultado do envio (`error` preenchido = a Meta recusou ou o egress
 * estourou). Antes era `Promise<void>`: o adapter marcava "já enviei" sem olhar
 * o resultado, então um turno em que TODOS os envios falharam era indistinguível
 * de um turno entregue — e nenhuma rede (guard de turno mudo, watchdog) resgatava
 * o cliente, que simplesmente não recebia nada. */
export async function sendInteractiveMessage(
	to: string,
	interactive: Record<string, unknown>,
): Promise<{ messageId?: string; error?: string }> {
	if (isSimulatedWaId(to)) {
		publishToClient(to, { type: "interactive", interactive });
		return simulatedAck();
	}
	const { accessToken, phoneNumberId } = getConfig();
	return callApi(phoneNumberId, accessToken, {
		to,
		type: "interactive",
		interactive,
	});
}

/**
 * FIX-122 (D13) — baixa uma mídia INBOUND do WhatsApp (Graph API, 2 passos):
 *   1) `GET /{media-id}`  → `{ url, mime_type }` (com Bearer)
 *   2) `GET url`          → binário (com Bearer)
 * Retorna os bytes + o mimeType reportado pela Graph. Lança se qualquer passo
 * falhar — o chamador (handleDocumentInbound) responde com erro amigável, nunca
 * silêncio. Mídia inbound só chega de WhatsApp real; o simulador não a produz.
 */
export async function downloadMedia(
	mediaId: string,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
	const { accessToken } = getConfig();
	const authHeaders = { Authorization: `Bearer ${accessToken}` };

	const metaRes = await fetch(`${GRAPH_API}/${mediaId}`, {
		headers: authHeaders,
		signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
	});
	if (!metaRes.ok) {
		throw new Error(`[whatsapp-api] downloadMedia meta failed (${metaRes.status})`);
	}
	const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
	if (!meta.url) throw new Error("[whatsapp-api] downloadMedia: resposta sem url");

	const binRes = await fetch(meta.url, {
		headers: authHeaders,
		signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
	});
	if (!binRes.ok) {
		throw new Error(`[whatsapp-api] downloadMedia binary failed (${binRes.status})`);
	}
	const bytes = new Uint8Array(await binRes.arrayBuffer());
	return { bytes, mimeType: meta.mime_type ?? "application/octet-stream" };
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

/**
 * Envia uma mensagem de template HSM (HTTP-to-SMS) no WhatsApp Business API.
 *
 * Templates HSM são usados para:
 * - Reabrir a janela de 24h quando está fechada
 * - Mensagens não-solicitadas (opt-in requerido)
 * - Notificações programadas
 *
 * O nome do template deve ser aprovado previamente na Meta Business Suite.
 * O idioma e os componentes são enviados via env para flexibilidade.
 *
 * @param to — phone_number_id do WhatsApp (ex.: 5562999998888)
 * @param templateName — nome do template aprovado na Meta
 * @param languageCode — código de idioma do template (ex.: pt_BR, en_US)
 * @param components — componentes opcionais do template (ex.: buttons, body)
 *
 * @example
 * // Template com componentes (Meta espera um ARRAY de componentes)
 * await sendTemplate(
 *   "5562999998888",
 *   "aja_agora_reabrir_conversa",
 *   "pt_BR",
 *   [
 *     {
 *       type: "button",
 *       sub_type: "quick_reply",
 *       index: "0",
 *       parameters: [{ type: "payload", payload: "reabrir" }],
 *     },
 *   ]
 * );
 *
 * @example
 * // Template simples (sem componentes)
 * await sendTemplate(
 *   "5562999998888",
 *   "aja_agora_boas_vindas",
 *   "pt_BR"
 * );
 */
export async function sendTemplate(
	to: string,
	templateName: string,
	languageCode: string,
	components?: unknown[],
) {
	// Destinatário simulado (SIM-<uuid>): não bate na Meta — só ack sintético.
	// Templates não são renderizados no simulador por agora.
	if (isSimulatedWaId(to)) return simulatedAck();
	const { accessToken, phoneNumberId } = getConfig();
	return callApi(phoneNumberId, accessToken, {
		to,
		type: "template",
		template: {
			name: templateName,
			language: {
				code: languageCode,
			},
			// Meta Cloud API v21: `components` é um ARRAY; omitido quando ausente.
			...(components ? { components } : {}),
		},
	});
}

// ─── Gestão de templates (WABA) ──────────────────────────────────────────────
// Ver docs/design/specs/2026-07-02-whatsapp-templates-meta-design.md.

export type CreateTemplateInput = {
	/** Nome do template na Meta (snake_case, ex `aja_confirmacao_v1`). */
	name: string;
	/** Código de idioma (ex `pt_BR`). */
	language: string;
	/** Categoria declarada (a Meta pode recategorizar). */
	category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
	/** Componentes HEADER/BODY/FOOTER/BUTTONS no shape da Cloud API. */
	components: unknown[];
};

export type CreateTemplateResult = {
	id: string;
	status: string;
	category?: string;
};

/**
 * Cria/submete um template à Meta: `POST /{WABA_ID}/message_templates`.
 * Diferente do envio (que é no phone number id), a criação é no WABA. Lança se
 * a Meta responder erro (4xx/5xx) — NUNCA persiste um PENDING falso. Não tem
 * branch de waId simulado: criar template não é por-destinatário.
 */
export async function createTemplate(input: CreateTemplateInput): Promise<CreateTemplateResult> {
	const { accessToken, wabaId } = getWabaConfig();
	const url = `${GRAPH_API}/${wabaId}/message_templates`;
	let res: Response;
	try {
		res = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				name: input.name,
				language: input.language,
				category: input.category,
				components: input.components,
			}),
			signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
		});
	} catch (err) {
		if (isTimeoutError(err)) {
			console.error("[whatsapp-api] createTemplate timeout (>15s)");
			throw new Error("timeout ao falar com a Meta (>15s) ao criar o template");
		}
		throw err;
	}
	if (!res.ok) {
		const error = await res.text();
		console.error(`[whatsapp-api] createTemplate failed (${res.status}):`, error);
		throw new Error(`createTemplate failed (${res.status}): ${error}`);
	}
	const data = (await res.json()) as CreateTemplateResult;
	return { id: data.id, status: data.status, category: data.category };
}

export type MetaTemplate = {
	id: string;
	name: string;
	status: string;
	category?: string;
	language?: string;
};

/**
 * Lista os templates do WABA (para o poll de reconciliação de status):
 * `GET /{WABA_ID}/message_templates?fields=name,status,category,language,id`.
 * Segue `paging.next` (cursor) e concatena as páginas. Lança em erro da Meta.
 */
export async function listTemplates(): Promise<MetaTemplate[]> {
	const { accessToken, wabaId } = getWabaConfig();
	const fields = "name,status,category,language,id";
	let url: string | undefined = `${GRAPH_API}/${wabaId}/message_templates?fields=${fields}`;
	const templates: MetaTemplate[] = [];
	while (url) {
		let res: Response;
		try {
			res = await fetch(url, {
				headers: { Authorization: `Bearer ${accessToken}` },
				signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
			});
		} catch (err) {
			if (isTimeoutError(err)) {
				console.error("[whatsapp-api] listTemplates timeout (>15s)");
				throw new Error("timeout ao falar com a Meta (>15s) ao listar templates");
			}
			throw err;
		}
		if (!res.ok) {
			const error = await res.text();
			console.error(`[whatsapp-api] listTemplates failed (${res.status}):`, error);
			throw new Error(`listTemplates failed (${res.status}): ${error}`);
		}
		const page = (await res.json()) as {
			data?: MetaTemplate[];
			paging?: { next?: string };
		};
		if (page.data) templates.push(...page.data);
		url = page.paging?.next;
	}
	return templates;
}
