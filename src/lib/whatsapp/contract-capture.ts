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
import { getLeadIdForConversation } from "@/lib/admin/lead-stage-tracker";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { querAntecipar } from "@/lib/agent/qualify-state";
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

export const CONTRACT_CANCELLED_REPLY = "Tranquilo! Vou te mostrar outras opções então.";

/** FIX-357 — `ask-confirm` e `ask-cpf` FORAM REMOVIDOS de propósito.
 *
 * Eram os dois desvios em que o servidor respondia por TEXTO FIXO, sem consultar o
 * modelo: qualquer coisa que não batesse nos regex virava "Só pra confirmar: posso
 * seguir?" (ask-confirm) ou o pedido de CPF de novo (ask-cpf). Ao vivo, a pergunta
 * do cliente EVAPORAVA. Se você está aqui pra reintroduzir um desses, leia o
 * CLAUDE.md ("Não engesse o agente") e o ADR 2026-07-13 antes.
 *
 * O que o código ainda decide (e deve continuar decidindo) é só a AÇÃO irreversível:
 * criar a proposta faz consulta de bureau, então exige aceite EXPLÍCITO. A FALA é do
 * modelo. */
export type ContractCaptureOutcome = "fire" | "cancel" | "invalid-cpf";

export type ContractCaptureResult =
	| { handled: false }
	| { handled: true; outcome: ContractCaptureOutcome };

/** FIX-357 — a DECISÃO do estágio "confirm", isolada da I/O pra ser testável.
 *
 * Regra: só aceite EXPLÍCITO dispara a proposta (que faz consulta de bureau).
 * Recusa cancela. E qualquer outra coisa — uma pergunta, uma dúvida — **NÃO é
 * resposta à confirmação**: vai pro MODELO (`handled: false`).
 *
 * Antes, o "qualquer outra coisa" caía num texto FIXO ("Só pra confirmar: posso
 * seguir e criar sua proposta?") sem nunca consultar o modelo. Ao vivo, em 3
 * jornadas do WhatsApp, a pergunta do cliente EVAPORAVA:
 *
 *     USUÁRIO: tem Bradesco?
 *     AGENTE:  Só pra confirmar: posso seguir e criar sua proposta...
 *
 * É o mesmo antipadrão que o ADR 2026-07-13 revogou: o servidor falando no lugar
 * do modelo. Uma pergunta jamais fecha contrato — o invariante segue de pé. */
export function decideConfirmStage(text: string): ContractCaptureResult {
	if (isQuestion(text)) return { handled: false };
	if (CANCEL_RE.test(text)) return { handled: true, outcome: "cancel" };
	if (AFFIRM_RE.test(text)) return { handled: true, outcome: "fire" };
	return { handled: false };
}

/** Uma PERGUNTA não é uma resposta — e por isso não pode ser lida nem como aceite
 * nem como recusa. Este é o discriminador que faltava: sem ele, o CANCEL_RE varria
 * "por que essa e não outra?" atrás das palavras soltas "não" e "outra" e CANCELAVA
 * a contratação de um cliente que só queria uma explicação.
 *
 * É conservador de propósito, nos DOIS sentidos. Um falso "fire" faz consulta de
 * bureau sem consentimento (problema de LGPD); um falso "cancel" derruba a venda.
 * Na dúvida, ninguém decide por regex: quem responde é o modelo, e o passo continua
 * pendente — o cliente ainda vai dizer "sim" no turno seguinte. */
function isQuestion(text: string): boolean {
	const s = (text ?? "").trim();
	if (s.includes("?")) return true;
	return /^(por\s?que|porqu[êe]|pq|qual|quais|quanto|quantos|quando|como|onde|quem|tem\s|teria|e\s+se|será|seria|d[áa]\s+pra|posso\s+saber)\b/i.test(
		s,
	);
}

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

	// Recusa explícita encerra o fechamento em qualquer stage — mas só se for de fato
	// uma recusa. "Tem outra opção?" é uma PERGUNTA (ver isQuestion).
	if (!isQuestion(text) && CANCEL_RE.test(text)) {
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
		// Sem cara de CPF (uma pergunta, uma objeção) → o MODELO responde. O gate não
		// cai: sem CPF, `fireContract` não cria proposta nenhuma.
		return { handled: false };
	}

	// stage "confirm" — a decisão vive em decideConfirmStage (pura, testável).
	// Só aceite EXPLÍCITO dispara a proposta (que faz consulta de bureau); pergunta
	// e dúvida vão pro MODELO.
	return decideConfirmStage(text);
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
		// FIX-48: vincula a proposta ao lead da conversa (o WhatsApp cria o lead no
		// handoff antes do fechamento). Antes o polling resgatava via conversationId
		// — manter o leadId explícito blinda a raia sem depender do resgate.
		const leadId = await getLeadIdForConversation(conversationId);
		const input = buildStartContractInput(
			meta,
			{
				cpf: identity.cpf,
				celular: identity.celular,
				lgpd: true, // aceite explícito = consentimento LGPD do passo 5
			},
			{ leadId },
		);
		// FIX-247 (rodada 3, Fable r2, gap #2): requestedCreditValue aciona o
		// aviso de ajuste (FIX-240) quando a carta real diverge do pedido —
		// paridade com o web (route.ts), que tinha o mesmo campo descartado.
		// FIX-259 (P1, veredito Fable r4): mesma classe de bug pro aviso de troca
		// de administradora — administradoraChanged/previousAdministradora não
		// podem sair do destructuring, senão a troca sai em silêncio no WhatsApp.
		const { offer, noOffer, requestedCreditValue, administradoraChanged, previousAdministradora } =
			await startContract(conversationId, input);

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
			rawCreditValue: requestedCreditValue,
			...(querAntecipar(meta.qualifyAnswers ?? {}) ? { mostrarLanceMedio: true } : {}),
			// A carta MAIOR que o bem é intencional quando ele aceitou embutido.
			...(meta.qualifyAnswers?.lanceEmbutido === true ? { cartaMaiorPorEmbutido: true } : {}),
			// O plano que ele aprovou — o card avisa se a carta real voltou com
			// outra parcela/prazo (ele decidiu olhando os números antigos).
			...(Number.isFinite(meta.recommendedOffer?.monthlyPayment) &&
			Number.isFinite(offer.monthlyPayment) &&
			Math.round(meta.recommendedOffer?.monthlyPayment as number) !==
				Math.round(offer.monthlyPayment as number)
				? { parcelaVista: meta.recommendedOffer?.monthlyPayment }
				: {}),
			...(Number.isFinite(meta.recommendedOffer?.termMonths) &&
			Number.isFinite(offer.termMonths) &&
			meta.recommendedOffer?.termMonths !== offer.termMonths
				? { prazoVisto: meta.recommendedOffer?.termMonths }
				: {}),
			previousAdministradora: administradoraChanged ? previousAdministradora : undefined,
		});
		if (wa.type === "interactive" && wa.interactive) {
			await sendInteractiveMessage(from, wa.interactive);
			// Persiste o TEXTO QUE O CLIENTE VIU, não um resumo. O resumo antigo
			// ("Carta real confirmada: X · R$ Y") escondia justamente a informação
			// mais delicada do fechamento: quando a administradora muda na
			// confirmação (a Bevi não tinha grupo na faixa), o aviso da troca vai no
			// corpo do interativo — e quem lesse a conversa no admin veria só o
			// resultado final, como se a carta tivesse mudado sozinha.
			const corpo = (wa.interactive as { body?: { text?: string } }).body?.text;
			await saveMessage(
				conversationId,
				"assistant",
				corpo ?? `Carta real confirmada: ${offer.administradora} · ${brl(offer.creditValue)}`,
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
