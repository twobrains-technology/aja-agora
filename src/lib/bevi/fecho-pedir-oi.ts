// FIX-235 (handoff agente-vendas-consorcio, 2026-07-09 — D8) — fecho pro
// WhatsApp: pedir o "oi" (abre a janela de 24h) + acionar a mesa (especialista
// em cadastros) NA HORA.
//
// O self-service (present_contract_form → offer-confirm) continua criando a
// proposta real na Bevi normalmente — isto NÃO muda. Esta é uma camada
// ADICIONAL, disparada no mesmo momento que `sendContractSummary`: a mensagem
// que pede o "oi" é um TEMPLATE HSM (a janela de 24h costuma estar fechada
// nesse momento) configurado no admin por `usageKey` (mesmo mecanismo de
// `resolveAndSend`/FIX-203 — sem migration nova). E a mesa é acionada
// proativamente via `dispatchAutoTransbordo` (create+broadcast), em vez de
// esperar o worker assíncrono `proposal-status-poll.ts` (que só reconcilia
// quando a Bevi processa a proposta na administradora — pode levar dias).
//
// Regra: o envio NUNCA quebra o fechamento (mesmo padrão de contract-summary.ts)
// — falha de identidade/mesa/WhatsApp é best-effort, logada, nunca lançada.

import type { SelfContractIdentity } from "@/lib/adapters/bevi/bevi-self-contract-adapter";
import { getLeadIdForConversation } from "@/lib/admin/lead-stage-tracker";
import { loadIdentity } from "@/lib/conversation/identity";
import { dispatchAutoTransbordo } from "@/lib/mesa/dispatch";
import { sendTextMessage } from "@/lib/whatsapp/api";
import { resolveAndSend, type ResolveAndSendResult } from "@/lib/whatsapp/template-dispatch";

/** Chave lógica do template do fecho (FIX-235) — configurar no admin de
 * WhatsApp Templates antes de ir pra prod. Sem template aprovado, o envio cai
 * na fila (`whatsapp_outbound_queue`) até aprovar — comportamento seguro. */
export const FECHO_PEDIR_OI_USAGE_KEY = "fecho_pedir_oi";

/** Texto livre (janela aberta) — mesma função técnica do template: pedir o
 * "oi" pra abrir/renovar a janela e avisar da especialista em cadastros. */
function buildFechoPedirOiText(): string {
	return (
		'Só reforçando por aqui: me responde com um "oi" que eu já salvo o nosso contato. ' +
		"Em alguns minutos a nossa especialista em cadastros te chama pra seguir com os dados e documentos."
	);
}

export interface FechoPedirOiDeps {
	loadIdentityImpl?: (conversationId: string) => Promise<SelfContractIdentity | null>;
	getLeadIdImpl?: (conversationId: string) => Promise<string | null>;
	sendTextImpl?: (to: string, text: string) => Promise<unknown>;
	whatsappConfigured?: () => boolean;
	resolveAndSendImpl?: typeof resolveAndSend;
	dispatchAutoTransbordoImpl?: typeof dispatchAutoTransbordo;
}

const defaultConfigured = () =>
	Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

/** Dispara o fecho pro WhatsApp: pede o "oi" (template/texto livre conforme a
 * janela) e aciona a mesa. Best-effort — nunca lança, nunca bloqueia o
 * fechamento self-service que já aconteceu antes desta chamada.
 *
 * FIX-265 (menor #3, veredito Fable r5, N7): `sent: true` só dizia "não
 * lançou" — o caller (route.ts) não sabia se a mensagem foi enviada AGORA
 * (`free_text`/`template`) ou só ENFILEIRADA (`queued`, sem janela/template
 * aprovado). O agente afirmava "acabei de te mandar uma mensagenzinha" mesmo
 * quando só enfileirou — mentira observável em dev. `channel` expõe o
 * resultado real de `resolveAndSend` pra a copy do fechamento (closing-
 * presentation.ts) condicionar o texto. */
export async function sendFechoPedirOi(
	conversationId: string,
	deps: FechoPedirOiDeps = {},
): Promise<{ sent: boolean; channel?: ResolveAndSendResult["channel"] }> {
	const loadIdentityImpl = deps.loadIdentityImpl ?? loadIdentity;
	const getLeadIdImpl = deps.getLeadIdImpl ?? getLeadIdForConversation;
	const sendTextImpl = deps.sendTextImpl ?? sendTextMessage;
	const configured = deps.whatsappConfigured ?? defaultConfigured;
	const resolveAndSendImpl = deps.resolveAndSendImpl ?? resolveAndSend;
	const dispatchAutoTransbordoImpl = deps.dispatchAutoTransbordoImpl ?? dispatchAutoTransbordo;

	const identity = await loadIdentityImpl(conversationId);
	if (!identity) {
		console.error(
			JSON.stringify({
				level: "warn",
				source: "fecho-pedir-oi",
				conversation_id: conversationId,
				reason: "no-identity",
			}),
		);
		return { sent: false };
	}

	let sent = false;
	let channel: ResolveAndSendResult["channel"] | undefined;
	if (configured()) {
		try {
			const to = `55${identity.celular.replace(/\D/g, "")}`;
			const result = await resolveAndSendImpl({
				to,
				conversationId,
				usageKey: FECHO_PEDIR_OI_USAGE_KEY,
				freeTextFallback: () => sendTextImpl(to, buildFechoPedirOiText()).then(() => undefined),
			});
			sent = true;
			channel = result.channel;
		} catch (err) {
			console.error(
				JSON.stringify({
					level: "error",
					source: "fecho-pedir-oi",
					conversation_id: conversationId,
					error_message: err instanceof Error ? err.message : String(err),
				}),
			);
		}
	} else {
		console.log(
			JSON.stringify({
				level: "info",
				source: "fecho-pedir-oi",
				conversation_id: conversationId,
				status: "skipped",
				reason: "whatsapp-not-configured",
			}),
		);
	}

	// Mesa acionada NA HORA — best-effort, nunca derruba o fecho por conta disso
	// (mesmo padrão de isolamento de falha do FIX-123, mesa/dispatch.ts).
	try {
		const leadId = await getLeadIdImpl(conversationId);
		if (leadId) {
			await dispatchAutoTransbordoImpl(leadId);
		}
	} catch (err) {
		console.error(
			JSON.stringify({
				level: "error",
				source: "fecho-pedir-oi",
				conversation_id: conversationId,
				error_message: err instanceof Error ? err.message : String(err),
				note: "dispatchAutoTransbordo falhou (fecho mantido)",
			}),
		);
	}

	return { sent, channel };
}
