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

// Exportado pra que `business-profile.ts` fale com a MESMA versão da Graph. Duas
// constantes em dois arquivos é como um lado sobe pra v23 e o outro fica pra trás
// sem ninguém notar até um campo novo não existir de um dos lados.
export const GRAPH_API = "https://graph.facebook.com/v21.0";

// Timeout dos fetches à Graph API (ms). Egress lento pendura a request ~30s e
// vira 502 do gateway — cortamos em 15s e traduzimos o abort num erro claro.
export const GRAPH_TIMEOUT_MS = 15_000;

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

/**
 * Config do upload pela Resumable Upload API. A sessão abre em `/{APP_ID}/uploads`,
 * NÃO no phone number id — por isso exige uma env a mais que o resto do canal.
 */
function getAppConfig() {
	const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
	const appId = process.env.WHATSAPP_APP_ID;
	if (!accessToken || !appId) {
		throw new Error(
			"WHATSAPP_ACCESS_TOKEN e WHATSAPP_APP_ID precisam estar definidos — a sessão de upload da Meta abre no ID do app, não no número.",
		);
	}
	return { accessToken, appId };
}

/** Upload de arquivo é mais lento que uma chamada JSON — 15s derruba arte grande. */
export const UPLOAD_TIMEOUT_MS = 60_000;

/**
 * Erro vindo da Meta já com a mensagem dela preservada e o status HTTP.
 *
 * A mensagem da Graph sobe INTEIRA até a tela/`rejectionReason` porque ela é a
 * única autoridade sobre o que o template aceita — traduzir por conta própria
 * seria inventar uma regra que a Meta pode desmentir na semana seguinte.
 */
export class ErroDaMeta extends Error {
	readonly status: number;
	constructor(message: string, status: number) {
		super(message);
		this.name = "ErroDaMeta";
		this.status = status;
	}
}

/**
 * Extrai a mensagem de erro da Graph de um corpo que pode nem ser JSON.
 * `error_user_msg` é a versão que a Meta escreveu PARA o usuário final — quando
 * existe, é mais legível que a `message` técnica.
 */
export function mensagemDeErroDaMeta(corpo: string): string {
	try {
		const json = JSON.parse(corpo) as {
			error?: { message?: string; error_user_msg?: string; error_user_title?: string };
		};
		const msg = json.error?.error_user_msg ?? json.error?.message;
		if (msg) return msg;
	} catch {
		// Corpo não-JSON (HTML de gateway, texto solto): cai no bruto abaixo.
	}
	return corpo.slice(0, 500) || "A Meta recusou a chamada sem detalhar o motivo.";
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

// `error?: undefined` no tipo é de propósito: o ack simulado NUNCA falha, e sem
// essa chave a união com o retorno de `callApi` não deixava o caller checar
// `result.error` — o jeito de descobrir uma recusa da Meta.
function simulatedAck(): { messageId: string; error?: undefined } {
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

/** Envia uma IMAGEM por link OU por media id. O link é o caminho antigo (a Meta
 * busca o arquivo numa URL pública/pré-assinada); o `media id` é o retorno de
 * `uploadMedia` e o caminho de quando o arquivo é NOSSO, sem URL pública. */
export type ImagemParaEnvio = string | { id: string };

export async function sendImageMessage(to: string, imagem: ImagemParaEnvio, caption?: string) {
	const porId = typeof imagem !== "string";
	const referencia = porId ? imagem.id : imagem;
	const maskedTo = to.length > 6 ? `${to.slice(0, 4)}…${to.slice(-2)}` : to;
	console.log(
		`[whatsapp-out:image] to=${maskedTo} via=${porId ? "id" : "link"} caption=${JSON.stringify(caption ?? "")}`,
	);
	if (isSimulatedWaId(to)) {
		publishToClient(to, {
			type: "text",
			text: `${caption ? `${caption}\n` : ""}${porId ? `[imagem] ${referencia}` : referencia}`,
		});
		return simulatedAck();
	}
	const { accessToken, phoneNumberId } = getConfig();
	return callApi(phoneNumberId, accessToken, {
		to,
		type: "image",
		image: {
			...(porId ? { id: referencia } : { link: referencia }),
			...(caption ? { caption } : {}),
		},
	});
}

/** Envia ÁUDIO por link. A Meta não aceita `caption` em áudio — mandar o campo
 * faz a requisição inteira falhar, então ele nem existe na assinatura. */
export async function sendAudioMessage(to: string, link: string) {
	const maskedTo = to.length > 6 ? `${to.slice(0, 4)}…${to.slice(-2)}` : to;
	console.log(`[whatsapp-out:audio] to=${maskedTo}`);
	if (isSimulatedWaId(to)) {
		publishToClient(to, { type: "text", text: `[áudio] ${link}` });
		return simulatedAck();
	}
	const { accessToken, phoneNumberId } = getConfig();
	return callApi(phoneNumberId, accessToken, { to, type: "audio", audio: { link } });
}

/** Envia VÍDEO por link, mesmo contrato do documento e da imagem: a Meta busca
 * o arquivo na URL. Aceita `caption`, ao contrário do áudio. */
export async function sendVideoMessage(to: string, link: string, caption?: string) {
	const maskedTo = to.length > 6 ? `${to.slice(0, 4)}…${to.slice(-2)}` : to;
	console.log(`[whatsapp-out:video] to=${maskedTo} caption=${JSON.stringify(caption ?? "")}`);
	if (isSimulatedWaId(to)) {
		publishToClient(to, { type: "text", text: `${caption ? `${caption}\n` : ""}${link}` });
		return simulatedAck();
	}
	const { accessToken, phoneNumberId } = getConfig();
	return callApi(phoneNumberId, accessToken, {
		to,
		type: "video",
		video: { link, ...(caption ? { caption } : {}) },
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

// ─── Upload de mídia ─────────────────────────────────────────────────────────
// São DOIS caminhos diferentes, e confundi-los queima tempo com erro que não
// diz o que errou:
//   - ENVIAR mensagem com arquivo nosso → POST /{PHONE_NUMBER_ID}/media (multipart)
//     devolve `{ id }`; vai no envio como `image: { id }` (ver `uploadMedia`).
//   - CRIAR template com header de imagem → Resumable Upload API, que abre no
//     APP ID e devolve `{ h: "<handle>" }` (ver `uploadTemplateHeaderMedia`).

/** Lança o timeout já traduzido, preservando o resto. */
function relancarTimeout(err: unknown, contexto: string): never {
	if (isTimeoutError(err)) {
		console.error(`[whatsapp-api] ${contexto} timeout (>${UPLOAD_TIMEOUT_MS / 1000}s)`);
		throw new ErroDaMeta(`A Meta não respondeu a tempo ${contexto}.`, 504);
	}
	throw err;
}

/**
 * Sobe um arquivo para o phone number id (`POST /{PHONE_NUMBER_ID}/media`,
 * multipart `messaging_product` + `file`) e devolve o media id. É o caminho do
 * ENVIO de mensagem com arquivo próprio, sem precisar de URL pública.
 */
export async function uploadMedia(arquivo: {
	bytes: ArrayBuffer;
	mimeType: string;
	nomeArquivo: string;
}): Promise<string> {
	const { accessToken, phoneNumberId } = getConfig();

	const form = new FormData();
	form.append("messaging_product", "whatsapp");
	form.append("type", arquivo.mimeType);
	form.append("file", new Blob([arquivo.bytes], { type: arquivo.mimeType }), arquivo.nomeArquivo);

	let res: Response;
	try {
		res = await fetch(`${GRAPH_API}/${phoneNumberId}/media`, {
			method: "POST",
			// Sem `Content-Type`: o fetch preenche o boundary do multipart sozinho.
			headers: { Authorization: `Bearer ${accessToken}` },
			body: form,
			signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
		});
	} catch (err) {
		relancarTimeout(err, "ao enviar o arquivo");
	}

	if (!res.ok) {
		const corpo = await res.text();
		console.error(`[whatsapp-api] uploadMedia failed (${res.status}):`, corpo);
		throw new ErroDaMeta(mensagemDeErroDaMeta(corpo), res.status);
	}

	const data = (await res.json()) as { id?: string };
	if (!data.id) {
		throw new ErroDaMeta("A Meta aceitou o arquivo mas não devolveu o media id.", 502);
	}
	return data.id;
}

/**
 * Sobe a arte do header de TEMPLATE pela Resumable Upload API e devolve o
 * `handle`. São dois passos, e o primeiro é onde quase todo tutorial erra: a
 * sessão abre em `/{APP_ID}/uploads`, NÃO em `/{PHONE_NUMBER_ID}/uploads`. Com o
 * phone number id a Graph responde nó inválido, e a mensagem não diz que o
 * problema é o nó — parece permissão do token.
 *
 *   1) POST /{APP_ID}/uploads?file_name&file_length&file_type → { id: "upload:..." }
 *   2) POST /{id da sessão}  com  `Authorization: OAuth <token>`  e  `file_offset: 0`
 *      e o binário no corpo                                    → { h: "<handle>" }
 *
 * O `OAuth` do passo 2 é literal da doc — não é `Bearer`. O handle vai no
 * componente como `example: { header_handle: [handle] }`.
 */
export async function uploadTemplateHeaderMedia(arquivo: {
	bytes: ArrayBuffer;
	mimeType: string;
	nomeArquivo: string;
}): Promise<string> {
	const { accessToken, appId } = getAppConfig();

	const params = new URLSearchParams({
		file_name: arquivo.nomeArquivo,
		file_length: String(arquivo.bytes.byteLength),
		file_type: arquivo.mimeType,
	});

	let sessao: Response;
	try {
		sessao = await fetch(`${GRAPH_API}/${appId}/uploads?${params}`, {
			method: "POST",
			headers: { Authorization: `Bearer ${accessToken}` },
			signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
		});
	} catch (err) {
		relancarTimeout(err, "ao abrir o envio da arte");
	}

	if (!sessao.ok) {
		const corpo = await sessao.text();
		console.error(
			`[whatsapp-api] uploadTemplateHeaderMedia sessão falhou (${sessao.status}):`,
			corpo,
		);
		throw new ErroDaMeta(mensagemDeErroDaMeta(corpo), sessao.status);
	}

	const { id: idDaSessao } = (await sessao.json()) as { id?: string };
	if (!idDaSessao) {
		throw new ErroDaMeta("A Meta não devolveu o identificador da sessão de upload.", 502);
	}

	let envio: Response;
	try {
		envio = await fetch(`${GRAPH_API}/${idDaSessao}`, {
			method: "POST",
			headers: {
				// Literal da doc do Resumable Upload: aqui é `OAuth`, não `Bearer`.
				Authorization: `OAuth ${accessToken}`,
				file_offset: "0",
				"Content-Type": arquivo.mimeType,
			},
			body: arquivo.bytes,
			signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
		});
	} catch (err) {
		relancarTimeout(err, "ao receber a arte");
	}

	if (!envio.ok) {
		const corpo = await envio.text();
		console.error(
			`[whatsapp-api] uploadTemplateHeaderMedia envio falhou (${envio.status}):`,
			corpo,
		);
		throw new ErroDaMeta(mensagemDeErroDaMeta(corpo), envio.status);
	}

	const { h: handle } = (await envio.json()) as { h?: string };
	if (!handle) {
		throw new ErroDaMeta("A Meta aceitou a arte mas não devolveu o handle.", 502);
	}
	return handle;
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
		// A mensagem da Meta sobe legível (error_user_msg/message) — o submit a grava
		// em `rejectionReason`, e é o que o admin lê para corrigir e reenviar.
		throw new ErroDaMeta(mensagemDeErroDaMeta(error), res.status);
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
