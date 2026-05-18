/**
 * WhatsApp Message Templates — Meta Graph API v21.0
 *
 * Responsabilidades:
 *  - Construir payload de submit conforme spec da Meta
 *  - Chamar Graph API (`/message_templates`) pra criar/listar/deletar
 *  - Enviar template aprovado via `/messages` com componentes preenchidos
 *  - Validar nome do template (Meta exige snake_case)
 *
 * Status real fica no DB (`whatsapp_templates.meta_status`), atualizado via
 * webhook `message_template_status_update` (handler em src/app/api/webhook/whatsapp).
 */

import { sendInteractiveMessage as _sendInteractive } from "./api"; // import só pra reuso futuro

void _sendInteractive;

const GRAPH_API = "https://graph.facebook.com/v21.0";
const NAME_RE = /^[a-z0-9_]+$/;
const PLACEHOLDER_RE = /\{\{(\d+)\}\}/g;

export type TemplateCategory = "UTILITY" | "MARKETING" | "AUTHENTICATION";
export type TemplateLanguage = "pt_BR" | "en_US";

export type TemplateButton =
	| { type: "QUICK_REPLY"; text: string }
	| { type: "URL"; text: string; url: string }
	| { type: "PHONE_NUMBER"; text: string; phone_number: string };

export interface SubmitTemplateInput {
	name: string;
	category: TemplateCategory;
	language: TemplateLanguage;
	bodyText: string;
	headerText?: string;
	footerText?: string;
	buttons?: TemplateButton[];
}

interface MetaApiComponent {
	type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
	[key: string]: unknown;
}

export interface MetaTemplateSubmitPayload {
	name: string;
	category: TemplateCategory;
	language: TemplateLanguage;
	components: MetaApiComponent[];
}

function getConfig() {
	const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
	const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
	if (!wabaId || !accessToken) {
		throw new Error("WHATSAPP_BUSINESS_ACCOUNT_ID and WHATSAPP_ACCESS_TOKEN must be set");
	}
	return { wabaId, accessToken };
}

/**
 * Conta placeholders distintos ({{1}}, {{2}}, ...) no body.
 * Usado pra validar params na hora de salvar o template e na hora de enviar.
 */
export function countPlaceholders(body: string): number {
	const set = new Set<string>();
	for (const match of body.matchAll(PLACEHOLDER_RE)) {
		set.add(match[1]);
	}
	return set.size;
}

/**
 * Monta payload pro endpoint POST /v21.0/{waba}/message_templates da Meta.
 * Lança se name não bater no regex snake_case lowercase.
 */
export function buildSubmitPayload(input: SubmitTemplateInput): MetaTemplateSubmitPayload {
	if (!NAME_RE.test(input.name)) {
		throw new Error(`Template name "${input.name}" inválido — use só [a-z0-9_].`);
	}

	const components: MetaApiComponent[] = [];

	if (input.headerText) {
		components.push({ type: "HEADER", format: "TEXT", text: input.headerText });
	}

	components.push({ type: "BODY", text: input.bodyText });

	if (input.footerText) {
		components.push({ type: "FOOTER", text: input.footerText });
	}

	if (input.buttons && input.buttons.length > 0) {
		components.push({
			type: "BUTTONS",
			buttons: input.buttons.map((b) => {
				if (b.type === "QUICK_REPLY") {
					return { type: "QUICK_REPLY", text: b.text };
				}
				if (b.type === "URL") {
					return { type: "URL", text: b.text, url: b.url };
				}
				return { type: "PHONE_NUMBER", text: b.text, phone_number: b.phone_number };
			}),
		});
	}

	return {
		name: input.name,
		category: input.category,
		language: input.language,
		components,
	};
}

/**
 * Submete template pra Meta. Retorna o id criado e status inicial (PENDING).
 */
export async function submitTemplateToMeta(
	input: SubmitTemplateInput,
): Promise<{ id: string; status: string }> {
	const { wabaId, accessToken } = getConfig();
	const payload = buildSubmitPayload(input);
	const res = await fetch(`${GRAPH_API}/${wabaId}/message_templates`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(payload),
	});
	if (!res.ok) {
		const err = await res.text();
		throw new Error(`Meta submit failed (${res.status}): ${err}`);
	}
	const data = (await res.json()) as { id?: string; status?: string };
	if (!data.id) throw new Error("Meta submit returned no id");
	return { id: data.id, status: data.status ?? "PENDING" };
}

export interface MetaTemplateListItem {
	id: string;
	name: string;
	language: string;
	status: string;
	category: string;
	rejected_reason?: string;
	components?: unknown[];
}

/**
 * Lista templates da WABA. Útil pra sync inicial e reconciliação.
 */
export async function listTemplatesFromMeta(): Promise<MetaTemplateListItem[]> {
	const { wabaId, accessToken } = getConfig();
	const url = `${GRAPH_API}/${wabaId}/message_templates?limit=200`;
	const res = await fetch(url, {
		headers: { Authorization: `Bearer ${accessToken}` },
	});
	if (!res.ok) {
		const err = await res.text();
		throw new Error(`Meta list failed (${res.status}): ${err}`);
	}
	const data = (await res.json()) as { data?: MetaTemplateListItem[] };
	return data.data ?? [];
}

/**
 * Deleta template (Meta + local depois). Recurso usa query string `name=`.
 */
export async function deleteTemplateInMeta(name: string): Promise<void> {
	const { wabaId, accessToken } = getConfig();
	const url = `${GRAPH_API}/${wabaId}/message_templates?name=${encodeURIComponent(name)}`;
	const res = await fetch(url, {
		method: "DELETE",
		headers: { Authorization: `Bearer ${accessToken}` },
	});
	if (!res.ok) {
		const err = await res.text();
		throw new Error(`Meta delete failed (${res.status}): ${err}`);
	}
}

/**
 * Constrói o array `components` pra enviar via /messages com type=template.
 * Garante ordem dos parâmetros 1, 2, 3, ... — Meta rejeita se faltar 1
 * e tiver 2. Cobre PF-11.
 */
export function buildTemplateSendComponents(
	params: Record<string, string>,
): Array<{ type: "body"; parameters: Array<{ type: "text"; text: string }> }> {
	const keys = Object.keys(params);
	if (keys.length === 0) return [];

	for (const k of keys) {
		if (!/^\d+$/.test(k)) {
			throw new Error(`Param key "${k}" inválida — use chaves numéricas ("1", "2", ...).`);
		}
	}

	const sorted = keys.map((k) => Number.parseInt(k, 10)).sort((a, b) => a - b);
	const parameters = sorted.map((idx) => ({
		type: "text" as const,
		text: params[String(idx)],
	}));
	return [{ type: "body", parameters }];
}

/**
 * Envia template aprovado pra um número. Wrapper sobre /messages com
 * type=template + name + language + components.
 */
export async function sendTemplate(
	to: string,
	templateName: string,
	language: TemplateLanguage,
	params: Record<string, string>,
): Promise<{ messageId?: string; error?: string }> {
	const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
	const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
	if (!accessToken || !phoneNumberId) {
		throw new Error("WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID must be set");
	}
	const components = buildTemplateSendComponents(params);
	const payload = {
		messaging_product: "whatsapp",
		to,
		type: "template",
		template: {
			name: templateName,
			language: { code: language },
			components,
		},
	};
	const res = await fetch(`${GRAPH_API}/${phoneNumberId}/messages`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(payload),
	});
	if (!res.ok) {
		const err = await res.text();
		return { error: `${res.status}: ${err}` };
	}
	const data = (await res.json()) as { messages?: Array<{ id?: string }> };
	return { messageId: data.messages?.[0]?.id };
}
