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
// CPF mascarado; criar proposta (consulta de bureau) exige aceite EXPLÍCITO — e só
// vale como resposta ao aviso, cujo instante fica gravado no stage (`avisoLgpdEm`).

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { BeviConfigError, MinCreditError } from "@/lib/adapters/bevi/bevi-errors";
import { comprovanteDeAceite } from "@/lib/agent/orchestrator/vazamento";
import type { ConversationMetadata } from "@/lib/agent/personas";

/** O cliente sinalizou lance? (o mesmo predicado que morava no qualify-state) */
function querAntecipar(q: { hasLance?: string | null; lanceEmbutido?: boolean }): boolean {
	return q.hasLance === "yes" || q.hasLance === "maybe" || q.lanceEmbutido === true;
}

import {
	administradoraConflictsWithRegisteredProposal,
	ancorarOfertaReal,
	buildStartContractInput,
} from "@/lib/bevi/contract-input";
import { startContract } from "@/lib/bevi/fulfillment";
import { getLatestBeviProposal } from "@/lib/bevi/proposal-repo";
import { loadIdentity, storeIdentity } from "@/lib/conversation/identity";
import { saveMessage } from "@/lib/conversation/messages";
import { metaOf, persistMeta, reloadMeta } from "@/lib/conversation/meta";
import { decidirCpfDoTexto } from "@/lib/conversation/telefone-ou-cpf";
import { sendInteractiveMessage, sendTextMessage } from "./api";
import { contractFormToWhatsApp, realOfferToWhatsApp } from "./formatter";
import { waIdToCelular } from "./identify-capture";

const brl = (n: number) =>
	n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Pedido de CPF quando a identidade não está on file (defensivo). */
export const CONTRACT_CPF_PROMPT =
	"Pra eu criar sua proposta com a administradora, me confirma seu *CPF* (só os números)? " +
	"Seus dados ficam protegidos (LGPD). 🔒";

export const CONTRACT_INVALID_CPF_REPLY =
	"Hmm, esse CPF não confere — confere os números e me manda de novo?";

export const CONTRACT_CANCELLED_REPLY = "Tranquilo! Vou te mostrar outras opções então.";

/** O estado do fechamento como este módulo o lê: o tipo compartilhado de
 * `personas.ts`, direto, sem alias nem cast. `avisoLgpdEm` é o instante (ISO) em
 * que o aviso canônico da LGPD foi dito — o FATO que autoriza a consulta de
 * bureau, e o que `fireContract` confere antes de chamar a Bevi. */
function collectionState(meta: ConversationMetadata): ConversationMetadata["contractCollection"] {
	return meta.contractCollection;
}

/** O aceite gravado no DISPARO, no mesmo formato de `metaDoFecho`
 * (`pi/tools-livres.ts:324`): `{ em, fala }`, fala cortada em 200 chars.
 *
 * O aceite é só o que é lido como RESPOSTA ao aviso: sem o instante do aviso
 * gravado (ou um aceite anterior) não há consentimento a registrar — o "sim" ou o
 * CPF teriam vindo de uma mensagem que nunca disse o aviso, e registrar aceite ali
 * derrotar a trava de `fireContract`. Nunca sobrescreve um aceite já registrado.
 *
 * P288 (rodada 14): a fala é o COMPROVANTE, não o número. `comprovanteDeAceite` mascara o CPF
 * pelo que fecha no DV (janela de 11 dígitos, qualquer separador) e tira todo trecho numérico de
 * 8+ dígitos, e corta em 200 chars DEPOIS — `maskCpf` é curto, então mascarar antes nunca perde o
 * comprovante por truncamento. O CPF cifrado em `identityEnc` é a única cópia persistida: gravar a
 * fala em claro era uma segunda cópia, fora da criptografia. */
export function aceiteDoDisparo(
	meta: ConversationMetadata,
	fala: string,
): NonNullable<ConversationMetadata["lgpdAceite"]> | null {
	if (meta.lgpdAceite) return meta.lgpdAceite;
	if (!collectionState(meta)?.avisoLgpdEm) return null;
	return {
		em: new Date().toISOString(),
		fala: comprovanteDeAceite(fala ?? ""),
	};
}

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
export type ContractCaptureOutcome = "fire" | "cancel" | "invalid-cpf" | "finalize";

export type ContractCaptureResult =
	| { handled: false }
	| { handled: true; outcome: ContractCaptureOutcome };

/** A DECISÃO do estágio `offer-confirm`, isolada da I/O pra ser testável —
 * irmã de `decideConfirmStage`.
 *
 * Aqui a carta REAL já está com o cliente (proposta criada, consulta de bureau
 * feita) e o que falta é o aceite. O botão do `real_offer` sempre fechou; quem
 * responde por TEXTO — "sim", "pode fechar", "confirmo" — é a maioria no
 * WhatsApp, e sem esta decisão o turno não tinha o que entregar: `confirmOffer`
 * não rodava, `contractClosed` não virava true e o modelo improvisava um fecho
 * que não tinha acontecido.
 *
 * Mesmo discriminador conservador do estágio `confirm`: pergunta e dúvida vão
 * pro MODELO, e o passo continua pendente. Só aceite explícito finaliza. */
export function decideOfferConfirmStage(text: string): ContractCaptureResult {
	const decisao = decideConfirmStage(text);
	if (!decisao.handled || decisao.outcome !== "fire") return decisao;
	return { handled: true, outcome: "finalize" };
}

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
	if (
		/^(por\s?que|porqu[êe]|pq|qual|quais|quanto|quantos|quando|como|onde|quem|tem\s|teria|e\s+se|será|seria|d[áa]\s+pra|posso\s+saber)\b/i.test(
			s,
		)
	) {
		return true;
	}
	// A interrogativa NO MEIO da frase contava como aceite, porque o teste só
	// olhava o começo. "Pera, antes de fechar cadastro QUERO entender direito. E
	// se eu quisesse contemplar no mês 20, QUANTO precisaria de lance?" bateu no
	// `\bquero\b` do AFFIRM_RE e criou proposta real na administradora — consulta
	// de bureau disparada por uma dúvida (visto ao vivo, 2026-07-21).
	if (/\b(quanto|quantos|qual|quais|como fica|e\s+se|será que|seria)\b/i.test(s)) return true;
	// Pedido explícito de PAUSA — quem diz "pera" está freando, não aceitando.
	return /\b(pera[ií]?|espera|calma|antes de|só um|aguenta|segura)\b/i.test(s);
}

// Recusa tem prioridade sobre aceite — "quero ver outras" contém "quero".
const CANCEL_RE =
	/\b(n[ãa]o|outras?|outra op|ver mais|mais op|compar|cancel|depois|espera|agora n[ãa]o|talvez)\b/i;
const AFFIRM_RE =
	/\b(sim|quero|confirm\w*|bora|partiu|pode|vamos|fecha\w*|isso|claro|aceito|com certeza|ok|beleza|t[áa] bom|positivo)\b/i;

/** A DECISÃO do estágio `cpf`, isolada da I/O pra ser testável — irmã de
 * `decideConfirmStage` e `decideOfferConfirmStage`.
 *
 * O estágio `cpf` SÓ existe porque o agente acabou de pedir o CPF: é o contexto
 * que a regra única de `telefone-ou-cpf.ts` chama de `pedidoDeCpf`. Por isso o
 * número sem rótulo nenhum (`11900000083` é celular de SP E passa no DV do CPF)
 * é lido como CPF aqui — sem isso, o fechamento trataria o telefone que o
 * cliente acabou de ditar como identidade dele.
 *
 * Duas respostas fixas saem daqui; nenhuma delas é fala do vendedor (`handled:
 * false` manda o texto pro modelo):
 *  - CPF com DV válido → `fire` (a proposta faz consulta de bureau, o aceite já
 *    veio no passo 5);
 *  - tentativa de CPF com DV errado → `invalid-cpf`, o "confere os números" do
 *    `CONTRACT_INVALID_CPF_REPLY`.
 *  Sem cara de CPF (pergunta, objeção), ou número dito como TELEFONE, → o modelo
 *  responde e o gate não cai.
 *
 * Quem decide o que o número É não é este estágio: é a regra única, chamada com
 * `pedidoDeCpf: true`. A diferença que isso faz: quem responde ao pedido
 * recusando o dado e ditando o telefone ("não tenho cpf, meu telefone é
 * 11900000083") não tem o celular gravado como CPF (`fire`) nem ouve "confere os
 * números" (`invalid-cpf`). */
export type CpfStageDecision =
	| { handled: false }
	| { handled: true; outcome: "fire"; cpf: string }
	| { handled: true; outcome: "invalid-cpf" };

export function decideCpfStage(text: string): CpfStageDecision {
	const decisao = decidirCpfDoTexto(text, { pedidoDeCpf: true });
	if (decisao.outcome === "captured") {
		return { handled: true, outcome: "fire", cpf: decisao.cpf };
	}
	if (decisao.outcome === "invalid") return { handled: true, outcome: "invalid-cpf" };
	return { handled: false };
}

/** Abre a máquina de estado do fechamento. Chamada pelo adapter quando o
 * `contract_form` é renderizado no WhatsApp. Idempotente; no-op se já fechado. */
export async function beginContractCollection(
	conversationId: string,
	payload: Record<string, unknown>,
): Promise<"confirm" | "cpf"> {
	const meta = await reloadMeta(conversationId);
	if (meta.contractClosed) {
		const atual = collectionState(meta)?.stage;
		return atual === "cpf" ? "cpf" : "confirm";
	}
	const hasIdentity = meta.identityCollected === true || payload.identityOnFile === true;
	const stage: "confirm" | "cpf" = hasIdentity ? "confirm" : "cpf";
	// O stage nasce do card, e o card carrega o aviso — então o instante do aviso é
	// FATO deste momento, não fala do modelo. É o que `fireContract` confere antes
	// de abrir a consulta de bureau.
	const state = { stage, avisoLgpdEm: new Date().toISOString() };
	await persistMeta(conversationId, { ...meta, contractCollection: state });
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
		// A decisão vive em `decideCpfStage` (pura, testável).
		const decisao = decideCpfStage(text);
		if (decisao.handled && decisao.outcome === "fire") {
			// storeIdentity cifra antes de persistir — CPF nunca em claro no meta.
			await storeIdentity(conv.id, { cpf: decisao.cpf, celular: waIdToCelular(from) });
			// O CPF mandado DEPOIS do aviso é o consentimento por conduta (a regra da
			// main) — e é o registro que o atendente precisa poder ler depois.
			// P187: `storeIdentity` acaba de escrever `identityEnc`/`identityCollected` e
			// `persistMeta` substitui a COLUNA inteira. Repersistir o snapshot anterior à
			// captura apagava a identidade recém-cifrada, e `fireContract` voltava a pedir
			// CPF. O aceite é aplicado sobre a meta FRESCA (mesmo cuidado do FIX-211 em
			// `identify-capture.ts:228-233`).
			const fresco = await reloadMeta(conv.id);
			const aceite = aceiteDoDisparo(fresco, text);
			if (aceite) await persistMeta(conv.id, { ...fresco, lgpdAceite: aceite });
			return { handled: true, outcome: "fire" };
		}
		if (decisao.handled) return decisao;
		// Sem cara de CPF (uma pergunta, uma objeção) → o MODELO responde. O gate não
		// cai: sem CPF, `fireContract` não cria proposta nenhuma.
		return { handled: false };
	}

	// stage "offer-confirm" — a carta REAL está na tela dele esperando o aceite.
	// O botão do `real_offer` sempre funcionou; o texto não existia, então quem
	// respondia "confirmado, pode seguir" (o normal no WhatsApp) ficava preso: o
	// turno não tinha o que entregar e o modelo improvisava um fechamento que não
	// tinha acontecido. A decisão vive em `decideOfferConfirmStage`.
	if (cc.stage === "offer-confirm") return decideOfferConfirmStage(text);

	// stage "confirm" — a decisão vive em decideConfirmStage (pura, testável).
	// Só aceite EXPLÍCITO dispara a proposta (que faz consulta de bureau); pergunta
	// e dúvida vão pro MODELO. O aceite explícito é também o registro: sem ele,
	// `fireContract` cria a proposta sem nada que prove que o cliente consentiu.
	const decisaoConfirm = decideConfirmStage(text);
	if (decisaoConfirm.handled && decisaoConfirm.outcome === "fire") {
		const aceite = aceiteDoDisparo(meta, text);
		if (aceite) await persistMeta(conv.id, { ...meta, lgpdAceite: aceite });
	}
	return decisaoConfirm;
}

/** Disparo do fechamento: resolve identidade, cria a proposta real e apresenta a
 * oferta a confirmar (real_offer). Núcleo compartilhado pelo botão e pelo texto.
 * Idempotente: limpa contractCollection antes do disparo (2º disparo no-op). */
export async function fireContract(from: string, conversationId: string): Promise<void> {
	const meta = await reloadMeta(conversationId);
	if (meta.contractClosed) return; // terminal — já fechou
	const cc = collectionState(meta);
	if (!cc) return; // nada pendente (idempotência)
	// `offer-confirm` significa que a proposta JÁ foi criada e a carta real já
	// está com o cliente aguardando aceite — não é um fechamento pendente. Sem
	// esta guarda, o estágio que eu reabri pra aceitar a confirmação por texto
	// fazia o segundo `fireContract` passar direto e criar uma proposta DUPLICADA
	// na administradora (com nova consulta de bureau). Pego pelo teste de
	// idempotência, não em produção.
	if (cc.stage === "offer-confirm") return;

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

	// ── F4 (testador no dev, conversa dfd69823) — A TRAVA: o lado perigoso é
	// disparar sem aviso. Criar a proposta é consulta de bureau no CPF de alguém.
	// Na main o aviso canônico vinha SEMPRE antes do pedido de CPF
	// (`identify-capture.ts:23-42`, a2bc3024) e o CPF mandado depois dele era o
	// consentimento por conduta. Este caminho perdeu o aviso: o `contract_form`
	// dizia só "seus dados são tratados com segurança (LGPD)", um texto genérico, e
	// o disparo saía com `lgpd: true` — uma afirmação do código, não um fato da
	// conversa. O disparo agora exige um dos dois FATOS registrados: o instante em
	// que o aviso foi dito (gravado junto do stage por `beginContractCollection`) ou
	// o aceite já gravado. Sem nenhum dos dois, não chama a Bevi: o cliente recebe o
	// aviso e o pedido de novo, e o instante do aviso passa a estar registrado — a
	// mesma resposta que `pi/lgpd.ts` dá no turno livre.
	const marcaPretendida = meta.contractOffer?.administradora ?? meta.recommendedAdministradora;
	if (!cc.avisoLgpdEm && !meta.lgpdAceite) {
		const aviso =
			contractFormToWhatsApp({
				...(marcaPretendida ? { administradora: marcaPretendida } : {}),
				identityOnFile: false,
			}).text ?? "";
		const comAviso = { ...cc, avisoLgpdEm: new Date().toISOString() };
		await persistMeta(conversationId, { ...meta, contractCollection: comAviso });
		await sendTextMessage(from, aviso);
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
		//
		// RE-A1 (reteste no dev, t6): resolve o lead com o MESMO helper do caminho do
		// modelo, `garantirLeadDoFecho` (`pi/tools-livres.ts`). O `getLeadIdForConversation`
		// que estava aqui só LIA — quem grava `leads.phone` é o helper, e ele só era
		// alcançado quando o turno passava pelo modelo. No WhatsApp o CPF é interceptado
		// por `captureContractText` e o turno nunca chega ao modelo: medido no dev, o
		// telefone estava vazio em 6/6 conversas do reteste, e a régua de identificados
		// (`admin/performance-queries.ts`) lê exatamente essa coluna. Não usa
		// `saveContactWhatsapp`: ele reescreve `conversations.waId` (no simulador é
		// `SIM-<uuid>`) e quebraria a própria sessão — o helper não toca o `waId`.
		//
		// Import dinâmico: `pi/tools-livres.ts` importa `pi/lgpd.ts`, que importa este
		// arquivo — o ciclo está registrado em `.orientacao/pendencia-ZAPFECHO.md`.
		const { garantirLeadDoFecho } = await import("@/lib/agent/pi/tools-livres");
		// Nome não é lido aqui: `garantirLeadDoFecho` preserva o nome do lead quando ele
		// já existe, e o fecho determinístico não tem a fala do nome.
		const leadId = await garantirLeadDoFecho({
			conversationId,
			celular: identity.celular,
			nome: null,
		});
		// ── FIX-420: o guard ANTI-REFAZER chega ao WhatsApp ──
		//
		// A 13ª e a 14ª revisões independentes acharam isto aberto, e a 14ª o
		// classificou como o dano mais caro de todos os achados: este canal chamava
		// `startContract` SEM `administradoraConflictsWithRegisteredProposal` e sem
		// passar `registeredAdministradora`. As duas proteções existiam só na web
		// (`route.ts`), e o WhatsApp é onde está o volume.
		//
		// Consequência medida por elas: cliente fecha RODOBENS; o polling grava o
		// status humano da Bevi; cliente pede ITAÚ e fecha → `createProposal` de
		// verdade → SEGUNDA proposta real, SEGUNDA consulta de bureau no mesmo CPF.
		// É exatamente o cenário que o FIX-263 existe pra impedir, aberto no canal
		// principal desde sempre.
		//
		// A ironia que fica registrada: a mensagem do FIX-409 acusa o FIX-400 e o
		// FIX-406 de "os dois esquecendo este canal", e eu repeti no FIX-415.
		const propostaRegistrada = await getLatestBeviProposal(conversationId).catch(() => null);
		if (
			administradoraConflictsWithRegisteredProposal(
				propostaRegistrada?.administradora,
				marcaPretendida,
			)
		) {
			await sendTextMessage(
				from,
				`Você já tem uma proposta registrada com a ${propostaRegistrada?.administradora} — não dá pra abrir uma segunda com outra administradora por aqui. Quer que eu confira o status dessa proposta pra você?`,
			);
			return;
		}
		const input = buildStartContractInput(
			meta,
			{
				cpf: identity.cpf,
				celular: identity.celular,
				lgpd: true, // aceite explícito = consentimento LGPD do passo 5
			},
			// FIX-420 — sem cota ancorada, o retry vai pra MESMA administradora já
			// registrada, nunca pro sorteio do gateway. Paridade com `route.ts:855`.
			{ leadId, registeredAdministradora: propostaRegistrada?.administradora },
		);
		// FIX-247 (rodada 3, Fable r2, gap #2): requestedCreditValue aciona o
		// aviso de ajuste (FIX-240) quando a carta real diverge do pedido —
		// paridade com o web (route.ts), que tinha o mesmo campo descartado.
		// FIX-259 (P1, veredito Fable r4): mesma classe de bug pro aviso de troca
		// de administradora — administradoraChanged/previousAdministradora não
		// podem sair do destructuring, senão a troca sai em silêncio no WhatsApp.
		const {
			proposalId,
			offer,
			noOffer,
			requestedCreditValue,
			administradoraChanged,
			previousAdministradora,
		} = await startContract(conversationId, input);

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

		// Depois do fecho, a cota REAL é a âncora. Sem isso o estado seguia com a
		// simulada e o agente continuava conversando com lance médio e prazo de um
		// grupo que não é o contratado. Feito DEPOIS do `realOfferToWhatsApp`, que
		// precisa da cota vista pra montar o aviso de divergência.
		await persistMeta(conversationId, {
			...(await reloadMeta(conversationId).catch(() => cleared)),
			...ancorarOfertaReal(meta, offer),
			// A carta real está na mão dele aguardando aceite. Sem reabrir este
			// estágio, "confirmado, pode seguir" caía no vazio: só o botão fechava.
			contractCollection: { stage: "offer-confirm" },
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
			if (leadId) {
				const { registrarOfertaExibida } = await import("@/lib/conversions/registry");
				await registrarOfertaExibida(leadId, proposalId);
			}
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
