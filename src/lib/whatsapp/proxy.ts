/**
 * WhatsApp bidirectional proxy with multi-attendant support.
 * After AI handoff, notifies ALL active attendants. First to reply claims the conversation.
 *
 * User → [proxy] → Claimed Attendant
 * Claimed Attendant → [proxy] → User
 * Other Attendant → "Já está sendo atendido por X"
 *
 * Source of truth for attendants is the `user` table (role = "attendant", is_active = true).
 * Results are cached in-process for 60s; mutations in /api/admin/attendants invalidate via
 * `invalidateAttendantCache()`.
 */
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { conversations, handoffNotifications, leads, user as userTable } from "@/db/schema";
import { applyTrackedStageToLead } from "@/lib/admin/lead-stage-tracker";
import { transitionLeadStage } from "@/lib/admin/lead-transitions";
import { buildAdvanceToContractDirective } from "@/lib/agent/orchestrator/directives";
import { recusaIsolada } from "@/lib/agent/orchestrator/yes-no";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { quemRespondePara } from "@/lib/agent/quem-responde";
import { publishMessage } from "@/lib/chat/message-bus";
import { triggerEvalScoring } from "@/lib/eval/trigger";
import { ehNomeProprioPlausivel } from "@/lib/leads/contact-capture";
import { simulatorNow } from "@/lib/utils/simulator-clock";
import { runDirectiveWithOrchestrator } from "./adapter";
import { sendAudioMessage, sendDocumentMessage, sendImageMessage, sendTextMessage } from "./api";
import { persistMeta, reloadMeta } from "./meta-helpers";
import { loadConversationHistory, saveMessage } from "./session";
import { contarListenersDoAtendente, publishToAttendant } from "./simulator-bus";

/**
 * Sends a WhatsApp message to an attendant AND mirrors it to the dev simulator
 * bus so /admin/simulator can display it. The Meta call is best-effort — even
 * if the attendant phone is fake/unreachable, the simulator still receives it.
 *
 * Quando `options.simulated=true` a chamada real à Meta API é SUPRIMIDA: a
 * conversa veio do /admin/simulator (cliente simulado) e não pode disparar
 * notificação de WhatsApp pro atendente real às 3h da manhã. O painel
 * /admin/simulator/attendant ainda recebe via bus, com badge 🧪 SIMULAÇÃO.
 */
/**
 * Devolve o `wamid` do envio — é a chave que casa com os webhooks de status da
 * Meta (`sent`/`delivered`/`read`). Sem guardá-lo, a pergunta "a campainha
 * tocou?" não tem resposta: foi o que deixou o incidente de 14/08 parecer
 * desatenção da mesa quando era a notificação levando 42 min para chegar.
 */
async function sendToAttendant(
	phone: string,
	text: string,
	options: { simulated?: boolean } = {},
): Promise<{ messageId?: string; listeners: number }> {
	const listeners = contarListenersDoAtendente(phone);
	console.log(
		`[proxy] sendToAttendant phone=${phone} simulated=${options.simulated ?? false} listeners=${listeners} text="${text.slice(0, 60)}"`,
	);
	let messageId: string | undefined;
	if (!options.simulated) {
		({ messageId } = await sendTextMessage(phone, text));
	}
	publishToAttendant(phone, text, { simulated: options.simulated });
	return { messageId, listeners };
}

const INTEREST_RE =
	/^\s*(tenho\s+interesse|tô\s+interessad[oa]|estou\s+interessad[oa]|quero\s+(?:esse|este|essa|esta|fechar|isso|essa\s+opcao)|me\s+interessa|fechar|bora\s+fechar|vamos\s+fechar|topo|topei|fechado)\s*[!.?]*\s*$/i;

/** Testa se ALGUM segmento do texto (separado por vírgula/ponto/exclamação/
 * interrogação/ponto-e-vírgula) é, sozinho, uma expressão de interesse —
 * cobre frases reais do dossiê de QA ("bora, tenho interesse", "tenho
 * interesse, quero fechar") sem abrir mão da âncora (evita falso-positivo
 * tipo "tenho interesse em saber sobre lance"). FIX-336. */
export function isInterestExpression(text: string): boolean {
	// FIX-406 — a recusa manda, e ela é avaliada na frase INTEIRA antes de
	// qualquer fatiamento.
	//
	// O `some` abaixo aceita se QUALQUER segmento, sozinho, for interesse. A
	// âncora `^…$` protege o caso colado ("não quero fechar" não casa, o "não"
	// está no mesmo segmento) — mas a vírgula desfaz essa proteção: "não, quero
	// fechar" vira ["não", "quero fechar"] e o segundo pedaço passa limpo. É a
	// mesma vírgula que a 8ª revisão independente achou fazendo "Itaú, não
	// obrigado" ancorar o Itaú, agora no ramo que chama
	// `buildAdvanceToContractDirective` DIRETO, fora do grafo — ou seja, sem o
	// veto de recusa do FIX-405 e sem gate nenhum, no canal onde está o volume.
	//
	// FIX-407 — o veto é `falaRecusa`, POR CLÁUSULA, e não `detectYesNoText` na
	// frase inteira. A 9ª revisão independente mediu a primeira versão deste veto
	// e achou os dois erros que ela cometia ao mesmo tempo:
	//
	//   · barrava SEIS fechamentos legítimos — "não vejo a hora, quero fechar",
	//     "não pensei duas vezes, fechado" — porque `detectYesNoText` lia o "não"
	//     entusiasmado como recusa (corrigido no primitivo, FIX-407);
	//   · deixava passar SEIS recusas — "de jeito nenhum, quero fechar",
	//     "esquece, tenho interesse" — porque `detectYesNoText` sozinho só enxerga
	//     recusa que tenha a palavra "não".
	//
	// O predicado completo (`falaRecusa`) sempre existiu; ele estava privado em
	// `choose-offer.ts` e eu reusei metade dele. Reusar METADE de um primitivo é a
	// mesma divergência que reescrevê-lo — o argumento do commit anterior estava
	// certo e a execução, não. Ele agora mora em `yes-no.ts`, um só, importado
	// pelos dois canais.
	//
	// Por CLÁUSULA porque é assim que o `some` abaixo decide: se um pedaço da
	// frase pode fechar a venda sozinho, o pedaço que recusa também tem que poder
	// barrá-la sozinho. Simetria — sem ela, a vírgula favorece sempre o lado que
	// compromete dinheiro.
	const segments = text
		.split(/[,;.!?]+/)
		.map((s) => s.trim())
		.filter(Boolean);
	// FIX-412 — `recusaIsolada`, não `falaRecusa`. A 10ª revisão mediu a versão
	// anterior barrando DOZE fechamentos legítimos ("nunca tive tanta certeza,
	// quero fechar"), porque a palavra de recusa estava lá como INTENSIFICADOR.
	// Aqui errar pra mais mata venda no canal de maior volume, então o predicado
	// tem que ser o estrito: o segmento É uma recusa, não apenas a contém — a
	// mesma âncora que o `INTEREST_RE` abaixo usa pro lado positivo.
	if (segments.some((seg) => recusaIsolada(seg))) return false;

	return segments.some((seg) => INTEREST_RE.test(seg));
}

/**
 * Strip the Brazilian country code (55) from a WhatsApp wa_id so the stored
 * lead phone matches the format used by the web flow (DDD + number, 10-11
 * digits). Returns null when the wa_id is empty (web handoff).
 */
export function normalizeWaIdToPhone(waId: string): string | null {
	const digits = waId.replace(/\D/g, "");
	if (!digits) return null;
	const stripped = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
	return stripped || null;
}

function buildConversationSummary(
	history: Array<{ role: string; content: string }>,
	artifacts: Array<{ type: string; payload: Record<string, unknown> }>,
): string {
	const lines: string[] = [];

	const recent = history.slice(-6);
	for (const msg of recent) {
		const prefix = msg.role === "user" ? "👤" : "🤖";
		lines.push(`${prefix} ${msg.content.slice(0, 200)}`);
	}

	for (const a of artifacts) {
		if (a.type === "recommendation_card") {
			const p = a.payload;
			lines.push(
				`\n📋 *Grupo recomendado:* ${p.administradora} — R$ ${(p.creditValue as number)?.toLocaleString("pt-BR")} — ${p.monthlyPayment}/mês — Score ${Math.round((p.score as number) * 100)}%`,
			);
		}
	}

	return lines.join("\n");
}

export async function startInterestHandoff(
	from: string,
	conversationId: string,
	storedName: string | null,
): Promise<boolean> {
	console.log(
		`[whatsapp-proxy] startInterestHandoff entered: from=${from} conversationId=${conversationId} storedName=${storedName ?? "(null)"}`,
	);
	const handoff = await getHandoffState(from);
	console.log(`[whatsapp-proxy] startInterestHandoff handoffState: ${JSON.stringify(handoff)}`);
	if (!handoff?.conversationId || handoff.isHandedOff) {
		console.log(
			`[whatsapp-proxy] startInterestHandoff bail: conversationId=${handoff?.conversationId ?? "(none)"} isHandedOff=${handoff?.isHandedOff ?? "(none)"}`,
		);
		return false;
	}

	if (storedName && storedName.trim().length > 0) {
		console.log(`[whatsapp-proxy] startInterestHandoff → handoffToAgents`);
		const history = await loadConversationHistory(conversationId);
		const summary = buildConversationSummary(history, []);
		await handoffToAgents(conversationId, from, storedName, summary);
		return true;
	}

	const meta = await reloadMeta(conversationId);
	await persistMeta(conversationId, { ...meta, awaitingName: true });
	await sendTextMessage(
		from,
		"Ótima escolha! 🎉 Pra te conectar com nosso consultor, me diz: *qual seu nome completo?*",
	);
	return true;
}

/**
 * Handles in-flight handoff state when a text message arrives:
 *   1. If the system was awaiting a name and one is provided, complete the handoff.
 *   2. If qualification finished and the user expresses interest, start handoff.
 * Returns true if handled (caller should stop); false to continue with AI flow.
 */
/**
 * O texto que o cliente mandou depois de "qual seu nome completo?" serve como
 * nome? Devolve o nome limpo, ou `null` quando não é nome.
 *
 * Este é o TERCEIRO caminho de escrita de `contactName` (os outros dois são
 * `saveContactName` e `captureAnswerNode`) e o mais exposto: o nome daqui vai
 * direto pro dossiê que o atendente humano recebe. Ele gravava o texto
 * VERBATIM, sem validação nenhuma — uma resposta confusa ("não sei", "isso
 * mesmo") virava o nome do lead na mesa. Achado em revisão adversarial,
 * 2026-08-12, depois de os outros dois caminhos já terem sido fechados.
 *
 * Usa a mesma fonte de verdade dos outros (`ehNomeProprioPlausivel`) — duas
 * listas divergentes foi exatamente como o defeito do "Voltei" sobreviveu ao
 * primeiro conserto. E aplica o mesmo limite de tamanho: nome é resposta curta,
 * frase não é apresentação.
 */
export function nomeParaHandoff(texto: string): string | null {
	const limpo = texto.trim().replace(/\s+/g, " ");
	if (!limpo) return null;
	const palavras = limpo.split(" ");
	if (palavras.length > 3) return null;
	if (!/^[\p{L}\s'-]+$/u.test(limpo)) return null;
	if (!ehNomeProprioPlausivel(palavras[0])) return null;
	return limpo;
}

export async function handlePendingHandoffText(from: string, text: string): Promise<boolean> {
	const handoff = await getHandoffState(from);
	if (!handoff?.conversationId) return false;

	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, handoff.conversationId),
	});
	const meta = conv?.metadata as Record<string, unknown> | null;

	if (meta?.awaitingName) {
		const agents = await getAttendantList();
		if (agents.length > 0) {
			// Só grava se for nome (ver `nomeParaHandoff`). O encaminhamento NÃO
			// depende disso: quem pediu atendimento humano recebe atendimento
			// humano, com nome ou sem. O que não pode é a mesa receber "não sei"
			// como nome do cliente.
			const nome = nomeParaHandoff(text);
			await db
				.update(conversations)
				.set({
					metadata: { ...meta, awaitingName: false },
					...(nome ? { contactName: nome } : {}),
					updatedAt: simulatorNow(),
				})
				.where(eq(conversations.id, handoff.conversationId));

			const history = await loadConversationHistory(handoff.conversationId);
			const summary = buildConversationSummary(history, []);
			await handoffToAgents(handoff.conversationId, from, nome ?? text, summary);
			return true;
		}
	}

	const typedMeta = meta as ConversationMetadata | null;
	// FIX-336: "tenho interesse" por TEXTO LIVRE segue o MESMO caminho
	// determinístico do clique do botão (handleInterest, interactive-
	// handlers.ts — FIX-117) — NUNCA handoff humano por sinal de interesse.
	// Este ramo chamava startInterestHandoff (resíduo de um refactor que só
	// corrigiu o clique, nunca o texto — ver histórico do commit e9b25776);
	// sem isso, um usuário que digita em vez de clicar (dossiê auto-whatsapp,
	// t14) caía no LLM livre, que aluciná a confirmação da proposta (I4).
	// Guardas: exige reveal feito (searchDispatched) e não pode atropelar uma
	// captura textual já em andamento (contractCollection) nem pós-fechamento
	// (contractClosed) — esses casos são de `captureContractText`.
	if (
		typedMeta?.searchDispatched &&
		!typedMeta.contractCollection &&
		typedMeta.contractClosed !== true &&
		isInterestExpression(text)
	) {
		await saveMessage(handoff.conversationId, "user", text, "whatsapp");
		// "A da Canopus me atende, bora fechar" — o cliente NOMEIA uma opção e
		// fecha na mesma frase. Este atalho não passa pelo grafo (é
		// determinístico de propósito), então a re-âncora por menção precisa
		// acontecer AQUI: sem ela o fechamento saía com a administradora que o
		// sistema tinha recomendado, calado, contra a escolha explícita do
		// cliente (visto ao vivo, 2026-07-21). Só re-ancora contra oferta REAL
		// já exibida nesta conversa.
		const { resolveAdministradoraMentionForConversation } = await import(
			"@/lib/agent/orchestrator/choose-offer"
		);
		const escolhida = await resolveAdministradoraMentionForConversation(
			handoff.conversationId,
			text,
			// FIX-409 — `permitirCriterio: false`, o mesmo que o grafo passa.
			//
			// O default do parâmetro é `true`, e este atalho o omitia: "a de menor
			// parcela, quero fechar" resolvia por CRITÉRIO e era gravado com
			// `origem: "mencao"` — mentira no banco, já que `criterio` é justamente a
			// origem que o FIX-400 removeu por não ser verificável. O `advance.ts:270`
			// carrega um comentário longo explicando por que critério não pode ser
			// determinístico; o proxy não o obedecia por esquecimento de um argumento.
			//
			// Achado pela 9ª revisão independente. Aqui a restrição é ainda mais
			// estrita que no grafo: lá o critério vale quando o turno não é pergunta
			// aberta; aqui não há analyzer nenhum pra dizer se é, então não vale nunca.
			{ permitirCriterio: false },
		).catch(() => null);
		const trocouDeAdministradora =
			escolhida?.administradora &&
			escolhida.administradora !== typedMeta.recommendedOffer?.administradora;
		// Substituição, não merge (mesma regra do nó `advance`): trocou de grupo,
		// campo não reconfirmado — `avgBidValue` à frente — não sobrevive do grupo
		// anterior.
		const trocouDeGrupo = Boolean(
			escolhida?.groupId && escolhida.groupId !== typedMeta.recommendedOffer?.groupId,
		);
		const herdado = trocouDeGrupo ? undefined : typedMeta.recommendedOffer;
		const metaAncorado: ConversationMetadata =
			escolhida && trocouDeAdministradora
				? {
						...typedMeta,
						recommendedAdministradora: escolhida.administradora,
						recommendedOffer: {
							...(escolhida.groupId
								? { groupId: escolhida.groupId }
								: herdado?.groupId
									? { groupId: herdado.groupId }
									: {}),
							...(herdado?.category ? { category: herdado.category } : {}),
							administradora: escolhida.administradora,
							creditValue: escolhida.creditValue ?? herdado?.creditValue,
							termMonths: escolhida.termMonths ?? herdado?.termMonths,
							monthlyPayment: escolhida.monthlyPayment ?? herdado?.monthlyPayment,
							avgBidValue: escolhida.avgBidValue,
						} as ConversationMetadata["recommendedOffer"],
					}
				: typedMeta;
		if (!metaAncorado.decisionDispatched || !metaAncorado.escolha || metaAncorado !== typedMeta) {
			await persistMeta(handoff.conversationId, {
				...metaAncorado,
				decisionDispatched: true,
				// FIX-409 — `escolha` NÃO nasce mais aqui. O bloco removido gravava a
				// cota como escolhida quando uma menção resolvia, com
				// `origem: "mencao"`.
				//
				// O FIX-406 removeu essa mesma escrita do grafo, e o commit afirmou que
				// só clique de card e a tool passavam a assinar. Era verdade no grafo e
				// falso no sistema — exatamente o que já tinha acontecido no FIX-400 e
				// que a 6ª revisão apontou. A 9ª achou este bloco intacto, no canal de
				// maior volume, e tem razão: enquanto os dois canais discordarem sobre o
				// que assina um contrato, o que vale é o mais permissivo.
				//
				// O que PERMANECE, e é o ponto: `recommendedAdministradora` e
				// `recommendedOffer` seguem re-ancorando pela menção (o bloco acima). O
				// cliente que diz "a da Canopus me atende, bora fechar" continua sendo
				// atendido na Canopus — a conversa acompanha a atenção dele. E
				// `decisionDispatched` segue marcado: o funil avança, o card de decisão
				// pergunta, e a resposta a ELE é o que fecha.
			});
		}
		await runDirectiveWithOrchestrator({
			from,
			conversationId: handoff.conversationId,
			directive: buildAdvanceToContractDirective({
				administradora: metaAncorado.recommendedAdministradora,
				identidadeJaColetada: metaAncorado.identityCollected === true,
			}),
			guardEmptyTurn: true,
		});
		return true;
	}

	return false;
}

interface Attendant {
	id: string;
	name: string;
	phone: string;
}

const CACHE_TTL_MS = 60_000;
let cache: { data: Attendant[]; fetchedAt: number } | null = null;

/** Fetch active attendants from the DB (with short in-memory cache). */
export async function getAttendantList(): Promise<Attendant[]> {
	if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
		return cache.data;
	}
	const rows = await db
		.select({
			id: userTable.id,
			name: userTable.name,
			phone: userTable.phone,
		})
		.from(userTable)
		.where(
			and(
				eq(userTable.role, "attendant"),
				eq(userTable.isActive, true),
				isNotNull(userTable.phone),
			),
		);
	const data: Attendant[] = rows
		.filter((r): r is { id: string; name: string; phone: string } => r.phone !== null)
		.map((r) => ({ id: r.id, name: r.name, phone: r.phone }));
	cache = { data, fetchedAt: Date.now() };
	return data;
}

/** Clear the attendant cache. Called from attendants CRUD routes after mutations. */
export function invalidateAttendantCache(): void {
	cache = null;
}

/** Check if a phone belongs to any active attendant. */
export async function isAttendantPhone(phone: string): Promise<boolean> {
	const list = await getAttendantList();
	return list.some((a) => a.phone === phone);
}

async function getAttendantByPhone(phone: string): Promise<Attendant | undefined> {
	const list = await getAttendantList();
	return list.find((a) => a.phone === phone);
}

async function getAttendantById(id: string): Promise<Attendant | undefined> {
	const list = await getAttendantList();
	return list.find((a) => a.id === id);
}

/**
 * Hand off a conversation from AI to human attendants.
 * Notifies ALL active attendants — first to reply claims it.
 * If there are no active attendants, marks as pending-claim and sends a friendly
 * message to the user; the next attendant to send any message will claim it via
 * `findUnclaimedConversation`.
 */
export async function handoffToAgents(
	conversationId: string,
	userWaId: string,
	userName: string,
	summary: string,
): Promise<void> {
	const attendants = await getAttendantList();
	console.log(
		`[whatsapp-proxy] handoffToAgents: found ${attendants.length} active attendants — ${attendants.map((a) => `${a.name}(${a.phone})`).join(", ") || "(none)"}`,
	);

	// Lemos isSimulated ANTES do UPDATE pra evitar round-trip duplicado e pra
	// propagar a flag pro lead, side-effects e bus.
	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
		columns: { isSimulated: true },
	});
	const isSimulated = conv?.isSimulated ?? false;

	// Mark conversation as handed_off with no claim yet (pending)
	await db
		.update(conversations)
		.set({
			status: "handed_off",
			handedOffUserId: null,
			contactName: userName,
			updatedAt: simulatorNow(),
		})
		.where(eq(conversations.id, conversationId));

	// Idempotent lead upsert. Web path inserts the lead in /api/leads before
	// calling this function, so we skip when one already exists. WhatsApp paths
	// (interest button, regex, suggest_handoff) reach here without a lead row,
	// so we create one with whatever PII is available — at minimum name + phone.
	// userWaId is "" for web calls.
	try {
		// B-03: lead pode já existir (criado em getOrCreateConversation no
		// início da conversa). Aqui só enriquecemos com PII coletada (name)
		// e aplicamos stage tracked. Se ainda não existe (legacy ou caminho
		// web que pula getOrCreateConversation), criamos do zero.
		const existing = await db.query.leads.findFirst({
			where: eq(leads.conversationId, conversationId),
		});
		const phone = normalizeWaIdToPhone(userWaId);
		let leadId: string;
		if (existing) {
			// Atualiza name se ainda não tinha + phone se faltava
			const patch: Partial<{ name: string | null; phone: string | null }> = {};
			if (!existing.name && userName) patch.name = userName;
			if (!existing.phone && phone) patch.phone = phone;
			if (Object.keys(patch).length > 0) {
				await db.update(leads).set(patch).where(eq(leads.id, existing.id));
			}
			leadId = existing.id;
		} else {
			const [created] = await db
				.insert(leads)
				.values({
					conversationId,
					name: userName,
					phone,
					email: null,
					isSimulated,
				})
				.returning();
			leadId = created.id;
		}
		// Aplica stage tracked apenas em conversa real (kanban filtra simulada).
		if (!isSimulated) {
			await applyTrackedStageToLead(conversationId, leadId);
			// B-03: handoff = atendente humano vai assumir = potencial fechamento.
			// Promove lead pra "em_negociacao" (patamar superior), onlyAdvance
			// pra não regredir leads que já estavam mais avançados.
			await transitionLeadStage(leadId, "em_negociacao", { type: "system" }, { onlyAdvance: true });
		}
		console.log(
			`[whatsapp-proxy] Lead upserted for handoff: conversation=${conversationId} leadId=${leadId} name=${userName} phone=${phone ?? "(none)"} simulated=${isSimulated} existed=${!!existing}`,
		);
	} catch (err) {
		// Don't block the handoff if the lead insert fails — attendants still
		// need to be notified, and the lead can be reconciled manually.
		console.error("[whatsapp-proxy] Failed to upsert lead on handoff:", err);
	}

	if (attendants.length === 0) {
		await sendTextMessage(
			userWaId,
			"Recebi! No momento todos os atendentes estão ocupados, mas assim que um ficar livre ele te procura por aqui. 🤝",
		);
		console.warn(
			`[whatsapp-proxy] Handoff sem atendentes ativos — conversa ${conversationId} marcada como pending`,
		);
		return;
	}

	const agentMessage = [
		"🔔 *Nova negociação — Aja Agora*",
		"",
		`👤 *Cliente:* ${userName}`,
		`📱 *WhatsApp:* ${userWaId ? `+${userWaId}` : "(canal web)"}`,
		"",
		"*Resumo da conversa:*",
		summary,
		"",
		"_Responda para assumir este atendimento. Primeiro a responder fica com o cliente._",
	].join("\n");

	for (const attendant of attendants) {
		const { messageId, listeners } = await sendToAttendant(attendant.phone, agentMessage, {
			simulated: isSimulated,
		});
		console.log(
			`[whatsapp-proxy] Notified attendant ${attendant.name} (${attendant.phone}) simulated=${isSimulated} listeners=${listeners}`,
		);
		// Registra a chamada para que "a campainha tocou?" tenha resposta
		// consultável. Fire-and-forget e nunca bloqueia o handoff: falhar em
		// medir a chamada não pode impedir a chamada.
		if (!isSimulated) {
			void db
				.insert(handoffNotifications)
				.values({
					conversationId,
					attendantPhone: attendant.phone,
					attendantName: attendant.name,
					wamid: messageId ?? null,
					listenersNoHandoff: listeners,
				})
				.catch((err) =>
					console.error("[whatsapp-proxy] registro da notificação de handoff falhou:", err),
				);
		}
	}

	const firstName = userName.trim().split(/\s+/)[0];
	const closingMessage = `Perfeito, ${firstName}! Já estou passando seu perfil pro consultor — ele te chama aqui em instantes. 🤝`;
	// Persistir ANTES de enviar pra Meta — sem isso a frase final fica
	// só no WhatsApp do cliente e some do histórico que o admin vê
	// (gap #3 do BUG-LEAD-HISTORY-INCOMPLETE). Demais saveMessage no
	// proxy seguem o mesmo padrão (linhas 462, 492, 541, 628).
	await saveMessage(conversationId, "assistant", closingMessage);
	await sendTextMessage(userWaId, closingMessage);

	console.log(
		`[whatsapp-proxy] Handoff: conversation ${conversationId} | user ${userWaId} → ${attendants.length} attendants notified simulated=${isSimulated}`,
	);

	// Fire-and-forget: dispara eval no momento do handoff (atendente sendo chamado).
	// Pulamos pra conversa simulada (eval custa tokens Claude e seria ruído de teste).
	// Admin pode forçar eval manualmente se quiser avaliar uma simulação específica.
	if (!isSimulated) {
		void triggerEvalScoring(conversationId, "handoff");
	}
}

/**
 * Este cliente está sendo atendido por gente?
 *
 * A pergunta é sobre a PESSOA, não sobre a linha da conversa. Quem assumiu o caso
 * pelo painel silencia a conversa web; o mesmo cliente responde pelo WhatsApp, que
 * é outra conversa, com o número em outro formato. Comparando `waId` por
 * igualdade — como era até 2026-08-10 — o agente não via a trava e respondia por
 * cima do atendente. Ver `quemRespondePara`.
 *
 * O `conversationId` devolvido é o do ATENDIMENTO (onde o humano está), não o do
 * canal de entrada: é lá que a mensagem do cliente precisa aparecer.
 */
export async function getHandoffState(waId: string): Promise<{
	isHandedOff: boolean;
	conversationId?: string;
	handedOffUserId?: string | null;
	contactName?: string;
	isSimulated?: boolean;
} | null> {
	const decisao = await quemRespondePara(waId);

	if (decisao.quem === "humano") {
		// Metadados de exibição saem da conversa do atendimento, que é a que o
		// atendente tem aberta na tela.
		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, decisao.conversationId),
		});
		return {
			isHandedOff: true,
			conversationId: decisao.conversationId,
			handedOffUserId: decisao.handedOffUserId,
			contactName: conv?.contactName ?? undefined,
			isSimulated: conv?.isSimulated,
		};
	}

	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.waId, waId),
	});
	if (!conv) return null;
	return {
		isHandedOff: false,
		conversationId: conv.id,
		handedOffUserId: conv.handedOffUserId ?? null,
		contactName: conv.contactName ?? undefined,
		isSimulated: conv.isSimulated,
	};
}

interface OwnedConversation {
	conversationId: string;
	userWaId: string | null;
	contactName: string;
	channel: "web" | "whatsapp";
	isSimulated: boolean;
}

/** Find a conversation already claimed by the given attendant (by phone). */
async function findConversationByAttendant(
	attendantWaId: string,
): Promise<OwnedConversation | null> {
	const attendant = await getAttendantByPhone(attendantWaId);
	if (!attendant) return null;
	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.handedOffUserId, attendant.id),
	});
	if (!conv) return null;
	if (conv.channel === "whatsapp" && !conv.waId) return null;
	return {
		conversationId: conv.id,
		userWaId: conv.waId ?? null,
		contactName: conv.contactName ?? "Cliente",
		channel: (conv.channel as "web" | "whatsapp") ?? "web",
		isSimulated: conv.isSimulated,
	};
}

/** Find any unclaimed handed-off conversation (handedOffUserId is null).
 * Ordered by updatedAt DESC so the most recent handoff wins — otherwise stale
 * web conversations stuck in handed_off state get claimed before the fresh one. */
async function findUnclaimedConversation(): Promise<OwnedConversation | null> {
	const allConvs = await db.query.conversations.findMany({
		where: eq(conversations.status, "handed_off"),
		orderBy: [desc(conversations.updatedAt)],
	});
	const unclaimed = allConvs.find((c) => !c.handedOffUserId && (c.waId || c.channel === "web"));
	if (!unclaimed) return null;
	console.log(
		`[whatsapp-proxy] findUnclaimedConversation picked id=${unclaimed.id} channel=${unclaimed.channel} waId=${unclaimed.waId ?? "(null)"} updatedAt=${unclaimed.updatedAt?.toISOString?.() ?? unclaimed.updatedAt}`,
	);
	return {
		conversationId: unclaimed.id,
		userWaId: unclaimed.waId ?? null,
		contactName: unclaimed.contactName ?? "Cliente",
		channel: (unclaimed.channel as "web" | "whatsapp") ?? "web",
		isSimulated: unclaimed.isSimulated,
	};
}

/**
 * Attendant tries to claim or relay to a conversation.
 * Returns true if handled (claimed or relayed), false if nothing to do.
 */
export async function handleAgentMessage(agentWaId: string, text: string): Promise<boolean> {
	const attendant = await getAttendantByPhone(agentWaId);
	if (!attendant) return false;
	const agentName = attendant.name;

	// 1. Already owns a conversation?
	const ownedConv = await findConversationByAttendant(agentWaId);
	if (ownedConv) {
		const normalized = text.trim().toLowerCase();
		if (normalized === "/fim" || normalized === "/encerrar" || normalized === "/close") {
			await closeHandoff(ownedConv.conversationId);
			await saveMessage(
				ownedConv.conversationId,
				"assistant",
				`[sistema] ${agentName} encerrou o atendimento.`,
			);

			if (ownedConv.channel === "whatsapp" && ownedConv.userWaId) {
				await sendTextMessage(
					ownedConv.userWaId,
					`Obrigado pelo contato, *${ownedConv.contactName}*! 🤝 Seu atendimento com *${agentName}* foi encerrado. Se precisar, é só mandar uma mensagem aqui que a gente te ajuda de novo.`,
				);
			} else {
				publishMessage(ownedConv.conversationId, {
					id: crypto.randomUUID(),
					role: "assistant",
					content: `Atendimento encerrado por ${agentName}. Obrigado!`,
					agentName,
					createdAt: simulatorNow().toISOString(),
				});
			}

			await sendToAttendant(agentWaId, `✅ Atendimento de *${ownedConv.contactName}* encerrado.`, {
				simulated: ownedConv.isSimulated,
			});
			console.log(
				`[whatsapp-proxy] Attendant ${agentName} closed conversation ${ownedConv.conversationId}`,
			);
			return true;
		}

		await saveMessage(ownedConv.conversationId, "assistant", `[${agentName}] ${text}`);

		if (ownedConv.channel === "whatsapp" && ownedConv.userWaId) {
			await sendTextMessage(ownedConv.userWaId, `*${agentName}:*\n${text}`);
		} else {
			publishMessage(ownedConv.conversationId, {
				id: crypto.randomUUID(),
				role: "assistant",
				content: text,
				agentName,
				createdAt: simulatorNow().toISOString(),
			});
		}

		console.log(
			`[whatsapp-proxy] Attendant→User (${ownedConv.channel}): ${agentName} → ${ownedConv.userWaId ?? "web"} | "${text.slice(0, 50)}"`,
		);
		return true;
	}

	// 2. Unclaimed conversation to grab?
	const unclaimed = await findUnclaimedConversation();
	if (unclaimed) {
		await db
			.update(conversations)
			.set({
				handedOffUserId: attendant.id,
				updatedAt: simulatorNow(),
			})
			.where(eq(conversations.id, unclaimed.conversationId));

		await sendToAttendant(
			agentWaId,
			`✅ Você assumiu o atendimento de *${unclaimed.contactName}*. Suas mensagens agora vão direto pro cliente.`,
			{ simulated: unclaimed.isSimulated },
		);

		// Notify other attendants
		const attendants = await getAttendantList();
		for (const other of attendants) {
			if (other.id !== attendant.id) {
				await sendToAttendant(
					other.phone,
					`ℹ️ *${agentName}* já assumiu o atendimento de *${unclaimed.contactName}*.`,
					{ simulated: unclaimed.isSimulated },
				);
			}
		}

		await saveMessage(unclaimed.conversationId, "assistant", `[${agentName}] ${text}`);

		if (unclaimed.channel === "whatsapp" && unclaimed.userWaId) {
			await sendTextMessage(unclaimed.userWaId, `*${agentName}:*\n${text}`);
		} else {
			publishMessage(unclaimed.conversationId, {
				id: crypto.randomUUID(),
				role: "assistant",
				content: text,
				agentName,
				createdAt: simulatorNow().toISOString(),
			});
		}

		console.log(
			`[whatsapp-proxy] Attendant ${agentName} claimed conversation ${unclaimed.conversationId}`,
		);
		return true;
	}

	// 3. Another attendant already claimed a conversation?
	const allHandedOff = await db.query.conversations.findMany({
		where: eq(conversations.status, "handed_off"),
	});
	const claimedByOther = allHandedOff.find(
		(c) => c.handedOffUserId && c.handedOffUserId !== attendant.id,
	);
	if (claimedByOther?.handedOffUserId) {
		const owner = await getAttendantById(claimedByOther.handedOffUserId);
		const ownerName = owner?.name ?? "Outro consultor";
		await sendToAttendant(
			agentWaId,
			`⏳ *${ownerName}* já está atendendo *${claimedByOther.contactName ?? "o cliente"}*.`,
			{ simulated: claimedByOther.isSimulated },
		);
		return true;
	}

	return false;
}

/**
 * Entrega ao atendente uma mensagem que o cliente escreveu na web.
 *
 * Devolve `true` quando a mensagem SAIU pra alguém. Isso não é detalhe de API:
 * quem chama (`/api/chat`) escreve "Mensagem enviada para Fulano. Aguarde a
 * resposta aqui." na tela do cliente, e essa frase não pode ser dita sem
 * entrega.
 *
 * OC-31 (produção, 2026-08) — o cliente ficou falando sozinho. A armadilha
 * precisa de duas conversas da MESMA pessoa, o que é o caso comum: ele começa no
 * WhatsApp, um atendente assume ali, e depois volta pela web. As duas pontas
 * então discordavam sobre o que é "o caso":
 *
 *   • `route.ts` perguntava pela PESSOA (`quemRespondePara`, que casa por
 *     telefone normalizado em qualquer conversa `handed_off`) — achava o humano
 *     e calava o agente;
 *   • esta função perguntava pela LINHA (`conv.status !== "handed_off"`) e caía
 *     num `return` seco, sem log e sem erro.
 *
 * O agente não respondia, o atendente não recebia nada, e o cliente lia uma
 * promessa de entrega que nunca aconteceu. Agora as duas pontas fazem a MESMA
 * pergunta — a da pessoa — e o atendimento é procurado na conversa onde ele
 * realmente vive, que nem sempre é a do canal de entrada.
 */
export async function relayWebUserToAgent(
	conversationId: string,
	text: string,
	userName: string,
): Promise<boolean> {
	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
	});
	if (!conv) return false;

	// A conversa de entrada pode não ser a do atendimento. Resolve pela pessoa —
	// mesma pergunta que o `route.ts` faz pra decidir calar o agente.
	let atendimento = conv;
	if (conv.status !== "handed_off") {
		const quem = await quemRespondePara(conv.waId);
		if (quem.quem !== "humano") return false;
		const outra = await db.query.conversations.findFirst({
			where: eq(conversations.id, quem.conversationId),
		});
		if (!outra) return false;
		atendimento = outra;
		console.log(
			`[whatsapp-proxy] WebUser→Attendant: atendimento vive em outra conversa da pessoa (${conversationId} → ${outra.id})`,
		);
	}

	const isSimulated = atendimento.isSimulated;

	if (atendimento.handedOffUserId) {
		const attendant = await getAttendantById(atendimento.handedOffUserId);
		if (attendant) {
			await sendToAttendant(attendant.phone, `*${userName}:*\n${text}`, { simulated: isSimulated });
			console.log(
				`[whatsapp-proxy] WebUser→Attendant: ${conversationId} → ${attendant.phone} | "${text.slice(0, 50)}" simulated=${isSimulated}`,
			);
			return true;
		}
		console.warn(
			`[whatsapp-proxy] Claimed attendant ${atendimento.handedOffUserId} not found in active list`,
		);
	}

	const attendants = await getAttendantList();
	for (const a of attendants) {
		await sendToAttendant(a.phone, `*${userName}:*\n${text}`, { simulated: isSimulated });
	}
	console.log(
		`[whatsapp-proxy] WebUser→AllAttendants: ${conversationId} | "${text.slice(0, 50)}" simulated=${isSimulated} entregues=${attendants.length}`,
	);
	// Lista vazia é entrega que não aconteceu — não pode virar "mensagem enviada".
	return attendants.length > 0;
}

/** Relay a message from user to the claimed attendant (or all, if unclaimed). */
export async function relayUserToAgent(userWaId: string, text: string): Promise<boolean> {
	const state = await getHandoffState(userWaId);
	if (!state?.isHandedOff || !state.conversationId) {
		return false;
	}

	const userName = state.contactName ?? "Cliente";
	const isSimulated = state.isSimulated ?? false;

	await saveMessage(state.conversationId, "user", text);

	// A TELA do atendente precisa saber que chegou.
	//
	// Sem este publish, a mensagem do cliente ia pro banco e pro WhatsApp do
	// atendente, mas o painel só descobria se alguém recarregasse a página —
	// quem atendia pelo modal ficava olhando uma conversa parada enquanto o
	// cliente escrevia (relatado em 2026-08-10).
	publishMessage(state.conversationId, {
		id: crypto.randomUUID(),
		role: "user",
		content: text,
		createdAt: simulatorNow().toISOString(),
	});

	if (state.handedOffUserId) {
		const attendant = await getAttendantById(state.handedOffUserId);
		if (attendant) {
			await sendToAttendant(attendant.phone, `*${userName}:*\n${text}`, { simulated: isSimulated });
			console.log(
				`[whatsapp-proxy] User→Attendant: ${userWaId} → ${attendant.phone} | "${text.slice(0, 50)}" simulated=${isSimulated}`,
			);
		} else {
			console.warn(
				`[whatsapp-proxy] Claimed attendant ${state.handedOffUserId} not found in active list`,
			);
		}
	} else {
		const attendants = await getAttendantList();
		for (const a of attendants) {
			await sendToAttendant(a.phone, `*${userName}:*\n${text}`, { simulated: isSimulated });
		}
		console.log(
			`[whatsapp-proxy] User→AllAttendants: ${userWaId} | "${text.slice(0, 50)}" simulated=${isSimulated}`,
		);
	}

	return true;
}

/**
 * Um aviso do SISTEMA para quem está atendendo — não é fala do cliente.
 *
 * Por isso não passa por `saveMessage`: gravar "não consegui baixar o arquivo"
 * como se o cliente tivesse dito isso envenenaria o histórico e o contexto do
 * agente. Existe para o caso em que a mídia chegou mas não pôde ser entregue —
 * o atendente precisa saber que algo veio, senão o sintoma é o mesmo silêncio
 * que este módulo veio corrigir.
 */
export async function relayAvisoAoAtendente(userWaId: string, texto: string): Promise<boolean> {
	const state = await getHandoffState(userWaId);
	if (!state?.isHandedOff) return false;

	const userName = state.contactName ?? "Cliente";
	const isSimulated = state.isSimulated ?? false;
	const corpo = `⚠️ *${userName}* — ${texto}`;

	if (state.handedOffUserId) {
		const attendant = await getAttendantById(state.handedOffUserId);
		if (attendant) {
			await sendToAttendant(attendant.phone, corpo, { simulated: isSimulated });
			return true;
		}
	}

	const attendants = await getAttendantList();
	for (const a of attendants) {
		await sendToAttendant(a.phone, corpo, { simulated: isSimulated });
	}
	return attendants.length > 0;
}

/** O anexo do cliente, já guardado, pronto para seguir ao atendente. */
export interface AnexoDoCliente {
	tipo: "image" | "document" | "audio";
	/** URL assinada — a Meta BUSCA o arquivo nela, não recebe os bytes. */
	link: string;
	filename: string;
	/** Legenda que o cliente digitou junto do anexo, quando digitou. */
	caption?: string;
}

const ANEXO_SEM_LEGENDA: Record<AnexoDoCliente["tipo"], string> = {
	image: "enviou uma imagem",
	document: "enviou um documento",
	audio: "enviou um áudio",
};

/** O que o atendente lê acima do arquivo. Sem o nome, ele não sabe de quem é. */
function legendaDoAnexo(anexo: AnexoDoCliente, userName: string): string {
	const texto = anexo.caption?.trim();
	return texto ? `*${userName}:*\n${texto}` : `*${userName}* ${ANEXO_SEM_LEGENDA[anexo.tipo]}`;
}

/**
 * Manda o ARQUIVO para o atendente — não um aviso de que existe um arquivo.
 *
 * Espelha `sendToAttendant` (inclusive o espelho no simulador), com a diferença
 * que a Meta impõe: áudio não aceita legenda, então o nome de quem mandou vai
 * numa linha de texto antes do arquivo.
 */
async function enviarAnexoAoAtendente(
	phone: string,
	anexo: AnexoDoCliente,
	legenda: string,
	options: { simulated?: boolean } = {},
): Promise<void> {
	console.log(
		`[proxy] enviarAnexoAoAtendente phone=${phone} tipo=${anexo.tipo} filename=${JSON.stringify(anexo.filename)} simulated=${options.simulated ?? false}`,
	);
	if (!options.simulated) {
		if (anexo.tipo === "image") {
			await sendImageMessage(phone, anexo.link, legenda);
		} else if (anexo.tipo === "audio") {
			await sendTextMessage(phone, legenda);
			await sendAudioMessage(phone, anexo.link);
		} else {
			await sendDocumentMessage(phone, anexo.link, anexo.filename, legenda);
		}
	}
	// O painel do simulador não renderiza mídia: leva a legenda com o link, que é
	// o que dá para abrir de lá.
	publishToAttendant(phone, `${legenda}\n${anexo.link}`, { simulated: options.simulated });
}

/**
 * Relay de MÍDIA do cliente para o atendente — o irmão de `relayUserToAgent`.
 *
 * Só entrega: quem grava no histórico e publica na tela é
 * `receberMidiaDoCliente`, que é dono da chave no storage. Devolve se alguém de
 * fato recebeu — lista de atendentes vazia é entrega que não aconteceu, e quem
 * chama não pode tratar isso como sucesso.
 */
export async function relayUserMediaToAgent(
	userWaId: string,
	anexo: AnexoDoCliente,
): Promise<boolean> {
	const state = await getHandoffState(userWaId);
	if (!state?.isHandedOff || !state.conversationId) return false;

	const userName = state.contactName ?? "Cliente";
	const isSimulated = state.isSimulated ?? false;
	const legenda = legendaDoAnexo(anexo, userName);

	if (state.handedOffUserId) {
		const attendant = await getAttendantById(state.handedOffUserId);
		if (attendant) {
			await enviarAnexoAoAtendente(attendant.phone, anexo, legenda, { simulated: isSimulated });
			console.log(
				`[whatsapp-proxy] UserMedia→Attendant: ${userWaId} → ${attendant.phone} | ${anexo.tipo} ${anexo.filename} simulated=${isSimulated}`,
			);
			return true;
		}
		console.warn(
			`[whatsapp-proxy] Claimed attendant ${state.handedOffUserId} not found in active list`,
		);
	}

	const attendants = await getAttendantList();
	for (const a of attendants) {
		await enviarAnexoAoAtendente(a.phone, anexo, legenda, { simulated: isSimulated });
	}
	console.log(
		`[whatsapp-proxy] UserMedia→AllAttendants: ${userWaId} | ${anexo.tipo} ${anexo.filename} simulated=${isSimulated} entregues=${attendants.length}`,
	);
	return attendants.length > 0;
}

/** Close a handed-off conversation. */
export async function closeHandoff(conversationId: string): Promise<void> {
	await db
		.update(conversations)
		.set({ status: "closed", updatedAt: simulatorNow() })
		.where(eq(conversations.id, conversationId));
	console.log(`[whatsapp-proxy] Closed handoff for conversation ${conversationId}`);
}
