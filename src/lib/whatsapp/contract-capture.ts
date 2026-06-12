// Passo 5 "Contratar" (fechamento Bevi) no canal WhatsApp — MC-5 / FIX-25.
//
// O web fecha via POST de form (route.ts). O WhatsApp não tem form: o passo 5
// vira diálogo guiado com estado persistido (`meta.contractCollection`), espelho
// conversacional do `leadCollection`. Template de captura: identify-capture.ts
// (o gate identify já coleta o CPF cifrado neste canal — FIX-9).
//
// Fluxo:
//   1. agente emite `contract_form` → adapter chama beginContractCollection →
//      stage "confirm" (identidade on file) ou "cpf" (defensivo, sem identidade);
//      contractFormToWhatsApp renderiza a 1ª mensagem (botões ou pedido de CPF).
//   2. turno seguinte do usuário → captureContractText intercepta (processor.ts):
//      aceite → fireContract; recusa → cancela; ambíguo → re-pergunta.
//   3. botões interactive (contract_confirm/contract_cancel) → interactive-handlers.
//   4. fireContract → loadIdentity (decrypt) → startContract → apresenta real_offer.
//
// LGPD: o CPF NUNCA é logado nem persistido em claro. A identidade vem cifrada do
// identify (loadIdentity decifra em memória); o payload do contract_form só carrega
// CPF mascarado; criar proposta (consulta de bureau) exige aceite EXPLÍCITO.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { BeviConfigError, MinCreditError } from "@/lib/adapters/bevi/bevi-errors";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { buildStartContractInput } from "@/lib/bevi/contract-input";
import { startContract } from "@/lib/bevi/fulfillment";
import { loadIdentity, storeIdentity } from "@/lib/conversation/identity";
import { saveMessage } from "@/lib/conversation/messages";
import { metaOf, persistMeta, reloadMeta } from "@/lib/conversation/meta";
import { sendInteractiveMessage, sendTextMessage } from "./api";
import { realOfferToWhatsApp } from "./formatter";
import { extractCpf, waIdToCelular } from "./identify-capture";

const brl = (n: number) =>
	n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Pedido de CPF quando a identidade não está on file (defensivo). */
export const CONTRACT_CPF_PROMPT =
	"Pra eu criar sua proposta com a administradora, me confirma seu *CPF* (só os números)? " +
	"Seus dados ficam protegidos (LGPD). 🔒";

export const CONTRACT_INVALID_CPF_REPLY =
	"Hmm, esse CPF não confere — confere os números e me manda de novo?";

/** Re-pergunta de confirmação quando a resposta foi ambígua (não dispara proposta). */
export const CONTRACT_REPROMPT_CONFIRM =
	"Só pra confirmar: posso seguir e criar sua proposta com a administradora? " +
	"Responde *sim* pra fechar ou *ver outras* pra comparar mais opções.";

export const CONTRACT_CANCELLED_REPLY = "Tranquilo! Vou te mostrar outras opções então.";

export type ContractCaptureOutcome = "fire" | "cancel" | "invalid-cpf" | "ask-cpf" | "ask-confirm";

export type ContractCaptureResult =
	| { handled: false }
	| { handled: true; outcome: ContractCaptureOutcome };

// Recusa tem prioridade sobre aceite — "quero ver outras" contém "quero".
const CANCEL_RE =
	/\b(n[ãa]o|outras?|outra op|ver mais|mais op|compar|cancel|depois|espera|agora n[ãa]o|talvez)\b/i;
const AFFIRM_RE =
	/\b(sim|quero|confirm\w*|bora|partiu|pode|vamos|fecha\w*|isso|claro|aceito|com certeza|ok|beleza|t[áa] bom|positivo)\b/i;

function looksLikeCpfAttempt(text: string): boolean {
	const digits = (text ?? "").replace(/\D/g, "");
	return digits.length >= 9 && digits.length <= 14;
}

/** Abre a máquina de estado do fechamento. Chamada pelo adapter quando o
 * `contract_form` é renderizado no WhatsApp. Idempotente; no-op se já fechado. */
export async function beginContractCollection(
	conversationId: string,
	payload: Record<string, unknown>,
): Promise<"confirm" | "cpf"> {
	const meta = await reloadMeta(conversationId);
	if (meta.contractClosed) return meta.contractCollection?.stage ?? "confirm";
	const hasIdentity = meta.identityCollected === true || payload.identityOnFile === true;
	const stage: "confirm" | "cpf" = hasIdentity ? "confirm" : "cpf";
	await persistMeta(conversationId, { ...meta, contractCollection: { stage } });
	return stage;
}

/** Intercepta o turno do usuário quando o fechamento está ativo. Espelha o
 * early-return do identify-capture: handled=false deixa o turno seguir pro agente. */
export async function captureContractText(
	from: string,
	text: string,
): Promise<ContractCaptureResult> {
	const conv = await db.query.conversations.findFirst({ where: eq(conversations.waId, from) });
	if (!conv) return { handled: false };
	const meta = metaOf(conv);
	const cc = meta.contractCollection;
	if (!cc) return { handled: false };

	// Recusa explícita encerra o fechamento em qualquer stage.
	if (CANCEL_RE.test(text)) {
		const cleared: ConversationMetadata = { ...meta };
		delete cleared.contractCollection;
		await persistMeta(conv.id, cleared);
		return { handled: true, outcome: "cancel" };
	}

	if (cc.stage === "cpf") {
		const cpf = extractCpf(text);
		if (cpf) {
			// storeIdentity cifra antes de persistir — CPF nunca em claro no meta.
			await storeIdentity(conv.id, { cpf, celular: waIdToCelular(from) });
			return { handled: true, outcome: "fire" };
		}
		if (looksLikeCpfAttempt(text)) return { handled: true, outcome: "invalid-cpf" };
		return { handled: true, outcome: "ask-cpf" };
	}

	// stage "confirm": só aceite EXPLÍCITO dispara a proposta (consulta de bureau).
	if (AFFIRM_RE.test(text)) return { handled: true, outcome: "fire" };
	return { handled: true, outcome: "ask-confirm" };
}

/** Disparo do fechamento: resolve identidade, cria a proposta real e apresenta a
 * oferta a confirmar (real_offer). Núcleo compartilhado pelo botão e pelo texto.
 * Idempotente: limpa contractCollection antes do disparo (2º disparo no-op). */
export async function fireContract(from: string, conversationId: string): Promise<void> {
	const meta = await reloadMeta(conversationId);
	if (meta.contractClosed) return; // terminal — já fechou
	if (!meta.contractCollection) return; // nada pendente (idempotência)

	// Defesa em profundidade (espelha FIX-12 web): sem reveal, NUNCA cria proposta.
	if (meta.revealCompleted !== true) {
		const cleared: ConversationMetadata = { ...meta };
		delete cleared.contractCollection;
		await persistMeta(conversationId, cleared);
		await sendTextMessage(
			from,
			"Calma, a gente tá quase lá! Antes de fechar eu te mostro as opções reais — vamos concluir essa etapa primeiro.",
		);
		return;
	}

	const identity = await loadIdentity(conversationId).catch(() => null);
	if (!identity) {
		// Identidade sumiu — cai pro stage cpf e pede por texto (sem dead-end).
		await persistMeta(conversationId, { ...meta, contractCollection: { stage: "cpf" } });
		await sendTextMessage(from, CONTRACT_CPF_PROMPT);
		return;
	}

	// Limpa o estado ANTES do disparo: um 2º clique/texto no mesmo passo vira no-op.
	const cleared: ConversationMetadata = { ...meta };
	delete cleared.contractCollection;
	await persistMeta(conversationId, cleared);

	try {
		const input = buildStartContractInput(meta, {
			cpf: identity.cpf,
			celular: identity.celular,
			lgpd: true, // aceite explícito = consentimento LGPD do passo 5
		});
		const { offer, noOffer } = await startContract(conversationId, input);

		if (noOffer || !offer) {
			await sendTextMessage(
				from,
				"Não encontrei uma carta pra esse valor agora — o mínimo varia por tipo de bem. Quer ajustar o valor?",
			);
			return;
		}

		const wa = realOfferToWhatsApp({
			administradora: offer.administradora,
			grupo: offer.grupo,
			creditValue: offer.creditValue,
			monthlyPayment: offer.monthlyPayment,
			// FIX-39/40: paridade com o card web — prazo e lance médio do grupo
			// (defensivos no formatter; ausentes → linha omitida).
			termMonths: offer.termMonths,
			avgBidValue: offer.avgBidValue,
		});
		if (wa.type === "interactive" && wa.interactive) {
			await sendInteractiveMessage(from, wa.interactive);
			await saveMessage(
				conversationId,
				"assistant",
				`Carta real confirmada: ${offer.administradora} · ${brl(offer.creditValue)}`,
				"whatsapp",
			);
		}
	} catch (err) {
		// Bug dev 2026-06-11 (espelho do contract-submit web): erro engolido sem
		// log inviabiliza diagnóstico. Logar SEMPRE o erro original; CPF nunca.
		console.error(`[contract-capture] fireContract falhou (conv=${conversationId})`, err);
		// Restaura o estado pra permitir retry sem reabrir o passo do zero.
		await persistMeta(conversationId, { ...meta, contractCollection: { stage: "confirm" } });
		const delta =
			err instanceof MinCreditError
				? `O valor mínimo pra esse tipo é ${brl(err.minCredit)}. Quer aumentar pra eu simular?`
				: err instanceof BeviConfigError
					? "Estamos concluindo a habilitação com a administradora — nosso time te chama pra finalizar. 🙏"
					: "Tive um problema ao falar com a administradora agora. Pode tentar confirmar de novo em instantes?";
		await sendTextMessage(from, delta);
	}
}
