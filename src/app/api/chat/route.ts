import {
	createUIMessageStream,
	createUIMessageStreamResponse,
	type UIMessage,
	type UIMessageStreamWriter,
} from "ai";
import { and, eq, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { artifacts as artifactsTable, conversations, leads } from "@/db/schema";
import { BeviConfigError, MinCreditError } from "@/lib/adapters/bevi/bevi-errors";
import {
	buildAdjustValueDirective,
	buildAdvanceToContractDirective,
	buildCreditReactionDirective,
	buildDecisionPromptDirective,
	buildExperienceDoubtsDirective,
	buildExperienceFirstDirective,
	buildExperienceReturningDirective,
	buildGroupSelectedDirective,
	buildLanceReactionDirective,
	buildNameCapturedDirective,
	buildPlanReactionDirective,
	buildQualifyStartMoreDirective,
	buildQualifyStartYesDirective,
	buildSimulatorDialDirective,
	buildTimeframeReactionDirective,
} from "@/lib/agent/orchestrator/directives";
import { detectBackIntent, popNavState, pushNavState } from "@/lib/agent/orchestrator/navigation";
import { type ConversationMetadata, type Persona, ROUTABLE_CATEGORIES } from "@/lib/agent/personas";
import {
	LANCE_EMBUTIDO_DEFAULT_PERCENT,
	objetivoForIntent,
	objetivoForPrazo,
	prazoMesesForIntent,
} from "@/lib/agent/qualify-config";
import { nextGate } from "@/lib/agent/qualify-state";
import {
	type ClosingItem,
	closingPresentation,
	realOfferPresentation,
} from "@/lib/bevi/closing-presentation";
import { buildStartContractInput } from "@/lib/bevi/contract-input";
import { sendContractSummary } from "@/lib/bevi/contract-summary";
import { confirmOffer, startContract, uploadContractDocument } from "@/lib/bevi/fulfillment";
import type { ChatAction } from "@/lib/chat/actions";
import { publishMessage } from "@/lib/chat/message-bus";
import type { AjaUIMessage, ArtifactPartData } from "@/lib/chat/ui-message";
import {
	isValidCpf,
	loadIdentity,
	maskPhoneForDisplay,
	storeIdentity,
} from "@/lib/conversation/identity";
import { saveMessage } from "@/lib/conversation/messages";
import { metaOf, persistMeta, reloadMeta } from "@/lib/conversation/meta";
import { COOKIE_MAX_AGE_SECONDS, COOKIE_NAME, generateCookieValue } from "@/lib/memory/identity";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { instrumentWriter, TurnTrace } from "@/lib/telemetry/turn-trace";
import { isUuid } from "@/lib/utils/id";
import { simulatorNow } from "@/lib/utils/simulator-clock";
import {
	persistSimulatorCookieKey,
	withSimulatorClockIfNeeded,
} from "@/lib/utils/simulator-clock-wrap";
import {
	pipeDirectiveTurn,
	pipeGatePrompt,
	pipeSearchSummaryTurn,
	pipeTransitionTurn,
	pipeUserTurn,
} from "@/lib/web/adapter";
import { relayWebUserToAgent } from "@/lib/whatsapp/proxy";

export const maxDuration = 60;

type ChatRequestBody = {
	id?: string;
	conversationId?: string;
	messages?: UIMessage[];
	action?: ChatAction;
};

// Exported pra teste (Bv2-08-novo: payload legacy sem parts crashava).
export function lastUserText(
	messages: (UIMessage | { role?: string; parts?: unknown; content?: unknown })[] | undefined,
): string | null {
	if (!messages) return null;
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i] as {
			role?: string;
			parts?: Array<{ type?: string; text?: string }>;
			content?: unknown;
		};
		if (msg.role !== "user") continue;
		// Format moderno: parts[]
		if (Array.isArray(msg.parts)) {
			const text = msg.parts
				.filter(
					(p): p is { type: "text"; text: string } =>
						p?.type === "text" && typeof p.text === "string",
				)
				.map((p) => p.text)
				.join("");
			if (text.length > 0) return text;
		}
		// Fallback legacy: content como string
		if (typeof msg.content === "string" && msg.content.length > 0) {
			return msg.content;
		}
	}
	return null;
}

// FIX-31: o branch handed_off ecoa a user message no bus pro atendente. O eco
// PRECISA preservar o id original do cliente — o provider dedupa por id, e um
// id novo (crypto.randomUUID) nunca casa com o id otimista do useChat, então a
// bolha aparecia 2×. Pega o id da última mensagem `user` do payload (a que o
// useChat acabou de appendar localmente). Null quando ausente → caller faz
// fallback pra UUID novo (não pior que o comportamento legado).
export function lastUserMessageId(
	messages: ({ role?: string; id?: unknown } | unknown)[] | undefined,
): string | null {
	if (!messages) return null;
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i] as { role?: string; id?: unknown };
		if (msg?.role !== "user") continue;
		return typeof msg.id === "string" && msg.id.length > 0 ? msg.id : null;
	}
	return null;
}

function brl(n: number): string {
	return n.toLocaleString("pt-BR", {
		style: "currency",
		currency: "BRL",
		maximumFractionDigits: 0,
	});
}

/** Escreve os itens do fechamento (closing-presentation.ts) no stream, na ordem
 * do docx — textos e artifacts intercalados exatamente como o módulo dita. */
function pipeClosingItems(items: ClosingItem[], writer: UIMessageStreamWriter<AjaUIMessage>): void {
	for (const item of items) {
		if (item.kind === "text") {
			const id = crypto.randomUUID();
			writer.write({ type: "text-start", id });
			writer.write({ type: "text-delta", id, delta: item.text });
			writer.write({ type: "text-end", id });
		} else {
			writer.write({
				type: "data-artifact",
				id: crypto.randomUUID(),
				data: { type: item.type, payload: item.payload } as unknown as ArtifactPartData,
			});
		}
	}
}

/**
 * FIX-11 (defeito A): TODA mensagem assistant escrita pelos handlers de action
 * DEVE ser persistida. Os handlers do fechamento (`contract-submit`,
 * `offer-confirm`, `documents-done`, `document-upload`, `document-skip`)
 * escreviam direto no stream SEM `saveMessage` — o histórico da conversa real
 * do bug tinha 4 mensagens `user` consecutivas sem nenhuma `assistant` entre
 * elas. No turno seguinte, `loadConversationHistory` entregava esse histórico
 * mutilado ao modelo, que concluía (coerente com o que recebeu) que "nada
 * chegou no nosso sistema" — e re-rodava a descoberta.
 */
async function writeAndSaveText(
	writer: UIMessageStreamWriter<AjaUIMessage>,
	conversationId: string,
	persona: Persona | null,
	text: string,
): Promise<void> {
	const id = crypto.randomUUID();
	writer.write({ type: "text-start", id });
	writer.write({ type: "text-delta", id, delta: text });
	writer.write({ type: "text-end", id });
	await saveMessage(conversationId, "assistant", text, "web", persona);
}

/** FIX-11: pipeClosingItems + persistência — 1 message com os textos do
 * fechamento e os artifacts vinculados a ela (mesmo padrão do runner,
 * runner.ts `saveMessage` + insert em `artifacts`). */
async function pipeAndSaveClosingItems(
	items: ClosingItem[],
	writer: UIMessageStreamWriter<AjaUIMessage>,
	conversationId: string,
	persona: Persona | null,
): Promise<void> {
	pipeClosingItems(items, writer);
	const texts = items.filter((i) => i.kind === "text").map((i) => i.text);
	const artifactItems = items.filter(
		(i): i is Extract<ClosingItem, { kind: "artifact" }> => i.kind === "artifact",
	);
	const content = texts.join("\n\n") || `[closing: ${artifactItems.map((a) => a.type).join(", ")}]`;
	const messageId = await saveMessage(conversationId, "assistant", content, "web", persona);
	if (artifactItems.length > 0) {
		await db.insert(artifactsTable).values(
			artifactItems.map((a) => ({
				messageId,
				type: a.type,
				payload: a.payload,
				createdAt: simulatorNow(),
			})),
		);
	}
}

export async function POST(req: NextRequest) {
	const ip =
		req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
		req.headers.get("x-real-ip") ??
		"unknown";

	const rateLimitResult = checkRateLimit(ip);
	if (!rateLimitResult.allowed) {
		return new Response("Too many requests. Please wait a moment.", {
			status: 429,
			headers: {
				"Retry-After": String(Math.ceil((rateLimitResult.retryAfterMs ?? 60000) / 1000)),
			},
		});
	}

	// Cookie estável `aja_uid` pra mapear web anônimo → agent Letta (após
	// engajamento >= 3 turnos). Lazy create — só geramos cookie quando o
	// usuário interage. Ver ADR 2026-05-16.
	let userKey = req.cookies.get(COOKIE_NAME)?.value ?? null;
	let setNewCookie = false;
	if (!userKey) {
		userKey = generateCookieValue();
		setNewCookie = true;
	}

	const body = (await req.json()) as ChatRequestBody;
	const providedId = body.conversationId ?? body.id ?? null;

	// Guardrail: conversationId precisa ser UUID válido — coluna é UUID
	// no Postgres e query com string inválida quebra com 22P02. Visto pelo
	// QA DEV (integração externa com conversationId="test-qa-001" deu 500).
	if (providedId && !isUuid(providedId)) {
		return new Response(
			JSON.stringify({
				error: "Invalid conversationId",
				message: "conversationId must be a valid UUID v1-v5",
			}),
			{ status: 400, headers: { "Content-Type": "application/json" } },
		);
	}

	let conversationId: string;
	let contactName: string | null = null;
	const conv = providedId
		? await db.query.conversations.findFirst({
				where: eq(conversations.id, providedId),
				with: {
					handedOffUser: { columns: { name: true, phone: true } },
				},
			})
		: undefined;

	if (providedId && !conv) {
		const [created] = await db.insert(conversations).values({ id: providedId }).returning();
		conversationId = created.id;
	} else if (conv) {
		conversationId = conv.id;
		contactName = conv.contactName ?? null;
	} else {
		const [created] = await db.insert(conversations).values({}).returning();
		conversationId = created.id;
	}

	if (conv?.status === "handed_off" && !body.action) {
		const userText = lastUserText(body.messages);
		if (!userText) {
			return new Response("No user message in payload", { status: 400 });
		}
		await saveMessage(conversationId, "user", userText, "web");
		const userName = conv.contactName ?? "Cliente";
		await relayWebUserToAgent(conversationId, userText, userName);
		publishMessage(conversationId, {
			id: lastUserMessageId(body.messages) ?? crypto.randomUUID(),
			role: "user",
			content: userText,
			createdAt: simulatorNow().toISOString(),
		});
		const agentName = conv.handedOffUser?.name ?? "Consultor";
		const stream = createUIMessageStream<AjaUIMessage>({
			execute: ({ writer }) => {
				const id = crypto.randomUUID();
				writer.write({ type: "text-start", id });
				writer.write({
					type: "text-delta",
					id,
					delta: `_Mensagem enviada para ${agentName}. Aguarde a resposta aqui._`,
				});
				writer.write({ type: "text-end", id });
			},
		});
		return createUIMessageStreamResponse({
			stream,
			headers: { "X-Conversation-Id": conversationId, "X-Handed-Off": "true" },
		});
	}

	const meta = conv ? metaOf(conv) : ({} as ConversationMetadata);

	// Simulator: persiste o cookie key na 1ª passagem pra que GET /memory
	// reconstrua identity em qualquer admin. No-op em conv real.
	await persistSimulatorCookieKey(
		{
			id: conversationId,
			isSimulated: conv?.isSimulated ?? false,
			channel: conv?.channel ?? null,
			metadata: conv?.metadata,
		},
		userKey,
	);

	if (body.action) {
		// Persiste a mensagem do user (texto do botão clicado) UMA vez aqui no
		// topo, antes do switch. Antes do refactor cada branch chamava
		// `saveMessage` separado e o branch `category` esquecia — replica do
		// gap #2 do BUG-LEAD-HISTORY-INCOMPLETE. Centralização elimina o
		// risco de novos branches futuros esquecerem. Para actions sem
		// representação textual visível (whatsapp_optin com phone, decline
		// silencioso), o frontend ainda envia o label do botão via
		// `chat.sendMessage({ text: label })`, então `lastUserText` captura.
		const actionLabel = lastUserText(body.messages);
		if (actionLabel) {
			await saveMessage(conversationId, "user", actionLabel, "web");
		}

		const stream = createUIMessageStream<AjaUIMessage>({
			// FIX-21: trajetória observável do turno. O writer é o funil de consumo
			// do canal web — o proxy espelha as UI parts no trace sem tocar o
			// adapter (bloco E) nem o runner (bloco G). Fecha 1 registro/turno.
			execute: async ({ writer: rawWriter }) => {
				const trace = new TurnTrace({
					conversationId,
					channel: "web",
					persona: meta.currentPersona ?? null,
				});
				const writer = instrumentWriter(rawWriter, trace);
				try {
					await withSimulatorClockIfNeeded(conv ?? null, async () => {
						if (body.action?.kind === "category") {
							if (!(ROUTABLE_CATEGORIES as readonly string[]).includes(body.action.category))
								return;
							const fromPersona: Persona = meta.currentPersona ?? "concierge";
							// Push snapshot do estado atual no nav stack pra suportar "voltar" (#06).
							const nextStack = pushNavState(meta.navigationStack ?? [], {
								persona: fromPersona,
								category: meta.currentCategory ?? null,
								expertiseLevel: meta.expertiseLevel,
								experiencePrev: meta.experiencePrev ?? null,
								qualifyAnswers: meta.qualifyAnswers,
							});
							await persistMeta(conversationId, { ...meta, navigationStack: nextStack });
							await pipeTransitionTurn({
								conversationId,
								fromPersona,
								toCategory: body.action.category,
								contactName,
								writer,
								userKey,
							});
							return;
						}

						if (body.action?.kind === "select-group") {
							const { groupId, administradora, creditValue, termMonths } = body.action;
							await pipeDirectiveTurn({
								conversationId,
								directive: buildGroupSelectedDirective(
									administradora,
									groupId,
									creditValue,
									termMonths,
								),
								contactName,
								writer,
								userKey,
							});
							return;
						}

						if (body.action?.kind === "whatsapp_optin") {
							const { saveContactWhatsapp } = await import("@/lib/leads/contact-capture");
							const result = await saveContactWhatsapp(conversationId, body.action.phone);
							if (result.ok) {
								const greetName = contactName ? `, ${contactName}` : "";
								await persistMeta(conversationId, {
									...meta,
									whatsappOptinShown: true,
								});
								await writeAndSaveText(
									writer,
									conversationId,
									meta.currentPersona ?? null,
									`Show${greetName}! Anotei seu WhatsApp. Se algo acontecer aqui, te chamo por lá. ✅`,
								);
							} else {
								await writeAndSaveText(
									writer,
									conversationId,
									meta.currentPersona ?? null,
									"Hmm, não consegui registrar esse número. Pode conferir e mandar de novo?",
								);
							}
							return;
						}

						if (body.action?.kind === "whatsapp_optin_confirm") {
							// FIX-27: número JÁ informado (lead form/identify) — confirma o
							// canal sem re-digitar. Lê o telefone real já salvo (lead →
							// identity) e marca o consentimento (LGPD: aceite explícito).
							const greetName = contactName ? `, ${contactName}` : "";
							const lead = await db.query.leads.findFirst({
								where: eq(leads.conversationId, conversationId),
								columns: { phone: true },
							});
							const phone =
								lead?.phone ?? (await loadIdentity(conversationId).catch(() => null))?.celular;
							if (phone) {
								const { saveContactWhatsapp } = await import("@/lib/leads/contact-capture");
								await saveContactWhatsapp(conversationId, phone);
							}
							await persistMeta(conversationId, { ...meta, whatsappOptinShown: true });
							await writeAndSaveText(
								writer,
								conversationId,
								meta.currentPersona ?? null,
								`Perfeito${greetName}! Pode deixar — se precisar, te chamo no seu WhatsApp. ✅`,
							);
							return;
						}

						if (body.action?.kind === "whatsapp_optin_decline") {
							await persistMeta(conversationId, {
								...meta,
								whatsappOptinShown: true,
								whatsappOptinDeclined: true,
							});
							await writeAndSaveText(
								writer,
								conversationId,
								meta.currentPersona ?? null,
								"Sem problema, seguimos por aqui mesmo.",
							);
							return;
						}

						// FIX-29/FIX-34: "Tenho interesse" pós-reveal é AVANÇO no funil
						// canônico (decisão → contratação self-service), NUNCA captura de
						// lead pra consultor humano. Espelha o branch simulator-offer "no":
						// dispara o card de decisão; se a decisão JÁ passou, avança pro passo 5.
						if (body.action?.kind === "interest") {
							const fresh = await reloadMeta(conversationId);
							const administradora = fresh.recommendedAdministradora ?? body.action.administradora;
							if (!fresh.decisionDispatched) {
								await persistMeta(conversationId, { ...fresh, decisionDispatched: true });
								await pipeDirectiveTurn({
									conversationId,
									directive: buildDecisionPromptDirective({ administradora }),
									contactName,
									writer,
									userKey,
								});
								return;
							}
							await pipeDirectiveTurn({
								conversationId,
								directive: buildAdvanceToContractDirective({ administradora }),
								contactName,
								writer,
								userKey,
							});
							return;
						}

						// FIX-29: "Ajustar valor"/"Nova simulação" reabre o what-if (perguntar
						// o novo valor) — NUNCA inicia fechamento. O directive proíbe lead_form/
						// contract_form/decision neste turno.
						if (body.action?.kind === "adjust-value") {
							await pipeDirectiveTurn({
								conversationId,
								directive: buildAdjustValueDirective({
									administradora: body.action.administradora,
									currentCreditValue: body.action.creditValue,
								}),
								contactName,
								writer,
								userKey,
							});
							return;
						}

						// docx passo 4: "Quero ver outras opções" — surfacing DETERMINÍSTICO
						// das outras ofertas reais da descoberta (other-options.ts — módulo
						// único produção+eval). Zero free-run do modelo, zero dado inventado.
						if (body.action?.kind === "show-other-options") {
							try {
								const { buildOtherOptions } = await import("@/lib/bevi/other-options");
								const others = await buildOtherOptions(conversationId, meta);
								await writeAndSaveText(
									writer,
									conversationId,
									meta.currentPersona ?? null,
									others.text,
								);
								writer.write({
									type: "data-artifact",
									id: crypto.randomUUID(),
									data: {
										type: "comparison_table",
										payload: { groups: others.groups },
									},
								});
							} catch {
								await writeAndSaveText(
									writer,
									conversationId,
									meta.currentPersona ?? null,
									"Deixa eu refazer a busca pra te mostrar as outras opções — me dá um instante e pede de novo?",
								);
							}
							return;
						}

						// ── Passo 5 "Contratar" (fechamento Bevi) ──
						if (body.action?.kind === "contract-submit") {
							// FIX-12 (defesa em profundidade): sem reveal, NUNCA criar proposta
							// real — o guard do runner já suprime o contract_form pré-reveal,
							// mas o POST continua acessível (form antigo na tela, API direta).
							// Criar proposta na Bevi = CPF + consulta de bureau; a ordem da
							// jornada (identify → busca → reveal → decisão → passo 5) é
							// validada AQUI pelo estado do servidor, não pelo modelo.
							const freshMeta = await reloadMeta(conversationId);
							if (freshMeta.revealCompleted !== true) {
								await writeAndSaveText(
									writer,
									conversationId,
									meta.currentPersona ?? null,
									"Calma, a gente tá quase lá! Antes de fechar qualquer coisa eu te mostro as opções reais das administradoras — vamos só concluir essa etapa primeiro:",
								);
								await pipeGatePrompt({
									conversationId,
									gate: nextGate(freshMeta, { hasContactName: Boolean(contactName) }),
									writer,
								});
								return;
							}
							// FIX-9: identidade já coletada no identify — o form confirma e o
							// CPF completo NUNCA volta do browser. useStoredIdentity (ou campos
							// ausentes) → resolve via loadIdentity. Dados digitados NOVOS
							// atualizam o storage (cifrado) pra manter a fonte única.
							let cpf = body.action.cpf;
							let celular = body.action.celular;
							if (body.action.useStoredIdentity === true || !cpf || !celular) {
								const stored = await loadIdentity(conversationId).catch(() => null);
								cpf = cpf || stored?.cpf;
								celular = celular || stored?.celular;
							} else if (cpf && celular) {
								await storeIdentity(conversationId, { cpf, celular });
							}
							if (!cpf || !celular) {
								await writeAndSaveText(
									writer,
									conversationId,
									meta.currentPersona ?? null,
									"Não encontrei seus dados aqui — preenche o CPF e o celular no formulário pra eu seguir com a proposta?",
								);
								return;
							}
							try {
								// FIX-25: derivação canônica do input (segmento/valor/objetivo/lance
								// + administradoraPreferida) — módulo único compartilhado com o
								// canal WhatsApp (contract-input.ts). administradoraPreferida resolve
								// BUG-ADMIN-TROCADA-NO-FECHAMENTO (E2E real 2026-06-04).
								const { proposalId, offer, noOffer } = await startContract(
									conversationId,
									buildStartContractInput(meta, { cpf, celular, lgpd: body.action.lgpd }),
								);
								// Copy/artifacts do passo 5 vivem em closing-presentation.ts
								// (módulo único — eval valida o MESMO copy de produção).
								await pipeAndSaveClosingItems(
									realOfferPresentation({ proposalId, offer, noOffer }),
									writer,
									conversationId,
									meta.currentPersona ?? null,
								);
								// FIX-27: proposta criada → telefone capturado (mascarado) p/ o
								// opt-in virar confirmação; limpa retry pendente de tentativa anterior.
								const okMeta = await reloadMeta(conversationId);
								await persistMeta(conversationId, {
									...okMeta,
									contactPhone: maskPhoneForDisplay(celular),
									contractRetryPending: false,
								});
							} catch (err) {
								// Bug dev 2026-06-11: erro engolido sem log → CloudWatch vazio,
								// diagnóstico impossível. Logar SEMPRE o erro original (lição
								// empty-env-compose: tool errors logados). CPF nunca no log.
								console.error(
									`[contract-submit] startContract falhou (conv=${conversationId})`,
									err,
								);
								const delta =
									err instanceof MinCreditError
										? `O valor mínimo pra esse tipo é ${brl(err.minCredit)}. Quer aumentar pra eu simular?`
										: err instanceof BeviConfigError
											? "Estamos concluindo a habilitação com a administradora — nosso time te chama pra finalizar. 🙏"
											: "Tive um problema ao falar com a administradora agora. Pode tentar de novo em instantes?";
								await writeAndSaveText(writer, conversationId, meta.currentPersona ?? null, delta);
								// FIX-27: erro genérico de fechamento (não config/min-credit) →
								// retry pendente (o opt-in não atropela a re-tentativa) + telefone
								// capturado (mascarado) pra confirmação posterior.
								if (!(err instanceof MinCreditError) && !(err instanceof BeviConfigError)) {
									const fresh = await reloadMeta(conversationId);
									await persistMeta(conversationId, {
										...fresh,
										contactPhone: maskPhoneForDisplay(celular),
										contractRetryPending: true,
									});
								}
							}
							return;
						}

						if (body.action?.kind === "offer-confirm") {
							try {
								const res = await confirmOffer(conversationId);
								// Estado TERMINAL: pós-confirmação o fechamento está feito — o
								// agente não re-apresenta contract_form (merge sobre meta atual).
								const fresh = await reloadMeta(conversationId);
								await persistMeta(conversationId, { ...fresh, contractClosed: true });
								// docx passo 5: reforços literais → assinatura + docs → "Parabéns!"
								// (closing-presentation.ts — módulo único produção+eval).
								await pipeAndSaveClosingItems(
									closingPresentation(res),
									writer,
									conversationId,
									meta.currentPersona ?? null,
								);
								// docx passo 5 (linha 52): resumo da contratação por WhatsApp.
								// Nunca quebra o fechamento — falha vira contractSummaryPending.
								await sendContractSummary(conversationId);
							} catch {
								await writeAndSaveText(
									writer,
									conversationId,
									meta.currentPersona ?? null,
									"Tive um problema ao gerar sua proposta. Pode tentar confirmar de novo?",
								);
							}
							return;
						}

						// FIX-10: conclusão explícita do envio de documentos — copy reflete
						// o que de fato subiu (uploads são silenciosos via /api/chat/document).
						if (body.action?.kind === "documents-done") {
							const sent = new Set(body.action.sentSlots ?? []);
							const hasFrente = sent.has("identidade_frente");
							const hasVerso = sent.has("identidade_verso");
							await writeAndSaveText(
								writer,
								conversationId,
								meta.currentPersona ?? null,
								hasFrente && hasVerso
									? "Recebi seus documentos ✅. É isso — sua ficha está completa! Agora é com a administradora; te aviso de cada passo."
									: hasFrente
										? "Recebi a frente ✅. Quando puder, manda o verso também — sem pressa, sua proposta já está registrada e eu te acompanho."
										: "Recebi o verso ✅. Quando puder, manda a frente também — sem pressa, sua proposta já está registrada e eu te acompanho.",
							);
							return;
						}

						// Caminho LEGADO (upload via turno de chat) — mantido por
						// robustez/compat; o componente web usa /api/chat/document.
						if (body.action?.kind === "document-upload") {
							const action = body.action;
							let delta: string;
							try {
								const file = Buffer.from(action.fileBase64, "base64");
								const { ok, fallbackLink } = await uploadContractDocument(conversationId, {
									slot: action.slot,
									file,
									filename: action.filename,
									mimeType: action.mimeType,
								});
								delta = ok
									? "Recebi seu documento ✅. É isso — sua ficha está completa! Agora é com a administradora; te aviso de cada passo."
									: `Não consegui anexar por aqui. Finaliza rapidinho neste link: ${fallbackLink}`;
							} catch {
								delta = "Tive um problema com o upload. Pode tentar enviar de novo?";
							}
							await writeAndSaveText(writer, conversationId, meta.currentPersona ?? null, delta);
							return;
						}

						if (body.action?.kind === "document-skip") {
							await writeAndSaveText(
								writer,
								conversationId,
								meta.currentPersona ?? null,
								"Sem problema — os documentos são opcionais e você pode enviar depois. Sua proposta já está registrada! 🎉",
							);
							return;
						}

						if (body.action?.kind !== "gate") return;
						const action = body.action;

						// FIX-17: nome enviado pelo card focado (passo 1). Persiste DIRETO
						// (sem tool) e saúda — o caminho texto-livre (save_contact_name
						// forçado no orchestrator) segue valendo em paralelo. Os dois
						// convergem em conversations.contactName.
						if (action.gate === "name") {
							const { saveContactName } = await import("@/lib/leads/contact-capture");
							const res = await saveContactName(conversationId, action.value.name);
							if (!res.ok) {
								await writeAndSaveText(
									writer,
									conversationId,
									meta.currentPersona ?? null,
									"Pode me dizer como prefere ser chamado(a)? Pode ser só o primeiro nome.",
								);
								await pipeGatePrompt({ conversationId, gate: "name", writer });
								return;
							}
							const fresh = await db.query.conversations.findFirst({
								where: eq(conversations.id, conversationId),
								columns: { contactName: true },
							});
							const savedName = fresh?.contactName ?? action.value.name;
							await pipeDirectiveTurn({
								conversationId,
								directive: buildNameCapturedDirective(savedName),
								contactName: savedName,
								writer,
								userKey,
							});
							return;
						}

						if (action.gate === "experience") {
							const choice = action.value;
							await persistMeta(conversationId, {
								...meta,
								experiencePrev: choice,
								doubtsAddressed: choice === "doubts" ? false : meta.doubtsAddressed,
							});
							const directive =
								choice === "first"
									? buildExperienceFirstDirective(action.label)
									: choice === "returning"
										? buildExperienceReturningDirective(action.label)
										: buildExperienceDoubtsDirective(action.label);
							await pipeDirectiveTurn({ conversationId, directive, contactName, writer, userKey });
							return;
						}

						if (action.gate === "consent") {
							if (!meta.currentCategory) return;
							if (action.value === "yes") {
								await persistMeta(conversationId, { ...meta, qualifyConsented: true });
								await pipeDirectiveTurn({
									conversationId,
									directive: buildQualifyStartYesDirective(),
									contactName,
									writer,
									userKey,
								});
								return;
							}
							await persistMeta(conversationId, { ...meta, pendingFollowUp: true });
							await pipeDirectiveTurn({
								conversationId,
								directive: buildQualifyStartMoreDirective(),
								contactName,
								writer,
								userKey,
							});
							return;
						}

						if (action.gate === "credit") {
							const credit = action.value.credit;
							const creditMin = Math.round((credit * 0.85) / 1000) * 1000;
							// "Planeje sua conquista" (re-UX guiada por intenção): o picker entrega
							// valor + prazo + a INTENÇÃO ("o que mais importa") e, conforme ela,
							// mês-alvo OU lance. A parcela (monthlyBudget) é o RESULTADO calculado.
							// Esses campos preenchem os gates seguintes e o funil pula o que já veio.
							// O `objetivo` da Bevi sai da intenção (fallback: do mês-alvo, p/ o
							// caminho de texto livre que não tem intenção).
							const v = action.value;
							// Prazo de contemplação: o mês-alvo escolhido (intenção "receber
							// rápido") OU o implícito da intenção — preenche prazoMeses pro funil
							// PULAR o gate timeframe (sem re-perguntar o que a intenção já disse).
							const prazoMeses =
								typeof v.targetMonth === "number"
									? v.targetMonth
									: v.intent != null
										? prazoMesesForIntent(v.intent)
										: undefined;
							const objetivo =
								v.intent != null
									? objetivoForIntent(v.intent)
									: typeof v.targetMonth === "number"
										? objetivoForPrazo(v.targetMonth)
										: undefined;
							const merged: NonNullable<ConversationMetadata["qualifyAnswers"]> = {
								...(meta.qualifyAnswers ?? {}),
								creditMin,
								creditMax: credit,
								monthlyBudget: v.monthlyBudget,
								...(prazoMeses != null ? { prazoMeses } : {}),
								...(objetivo ? { objetivo } : {}),
								...(typeof v.lanceValue === "number"
									? v.lanceValue > 0
										? { hasLance: "yes" as const, lanceValue: v.lanceValue }
										: { hasLance: "no" as const }
									: {}),
								...(typeof v.lanceEmbutido === "boolean" ? { lanceEmbutido: v.lanceEmbutido } : {}),
							};
							await persistMeta(conversationId, { ...meta, qualifyAnswers: merged });
							// Picker novo SEMPRE manda intenção → sempre é plan submit (o agente
							// confirma o plano como vendedor, sem re-perguntar).
							const isPlanSubmit = v.intent != null || typeof v.targetMonth === "number";
							await pipeDirectiveTurn({
								conversationId,
								directive: isPlanSubmit
									? buildPlanReactionDirective({
											assetLabel: action.label,
											intent: v.intent,
											targetMonth: v.targetMonth,
											lanceLabel:
												typeof v.lanceValue === "number" && v.lanceValue > 0
													? `R$ ${v.lanceValue.toLocaleString("pt-BR")}`
													: undefined,
										})
									: buildCreditReactionDirective(action.label),
								contactName,
								writer,
								userKey,
							});
							return;
						}

						if (action.gate === "timeframe") {
							const merged: NonNullable<ConversationMetadata["qualifyAnswers"]> = {
								...(meta.qualifyAnswers ?? {}),
								prazoMeses: action.value.prazoMeses,
								objetivo: objetivoForPrazo(action.value.prazoMeses),
							};
							await persistMeta(conversationId, { ...meta, qualifyAnswers: merged });
							if (!meta.currentCategory) return;
							await pipeDirectiveTurn({
								conversationId,
								directive: buildTimeframeReactionDirective(action.label),
								contactName,
								writer,
								userKey,
							});
							return;
						}

						if (action.gate === "lance") {
							const merged: NonNullable<ConversationMetadata["qualifyAnswers"]> = {
								...(meta.qualifyAnswers ?? {}),
								hasLance: action.value,
							};
							await persistMeta(conversationId, { ...meta, qualifyAnswers: merged });
							if (!meta.currentCategory) return;
							// Jornada do doc: quem TEM reserva ("yes") passa pelo gate de lance
							// embutido (educa + opt-in) antes da busca. O directive dispara o
							// gate `lance-embutido` em seguida. "maybe"/"no" vão direto pra busca.
							if (action.value === "yes") {
								await pipeDirectiveTurn({
									conversationId,
									directive: buildLanceReactionDirective(action.label),
									contactName,
									writer,
									userKey,
								});
								return;
							}
							await pipeSearchSummaryTurn({ conversationId, contactName, writer, userKey });
							return;
						}

						// docx passo 4: resposta à oferta do simulador (conceito do Bernardo).
						// "yes" → directive do dial (dados reais do plano recomendado);
						// "no" → card de decisão direto ("Esse plano faz sentido?").
						if (action.gate === "simulator-offer") {
							const refreshed = { ...meta, simulatorOfferDispatched: true };
							await persistMeta(conversationId, refreshed);
							if (action.value === "yes") {
								await pipeDirectiveTurn({
									conversationId,
									directive: buildSimulatorDialDirective({
										administradora: meta.recommendedAdministradora,
									}),
									contactName,
									writer,
									userKey,
								});
								return;
							}
							if (!refreshed.decisionDispatched) {
								await persistMeta(conversationId, { ...refreshed, decisionDispatched: true });
								await pipeDirectiveTurn({
									conversationId,
									directive: buildDecisionPromptDirective({
										administradora: meta.recommendedAdministradora,
									}),
									contactName,
									writer,
									userKey,
								});
							}
							return;
						}

						// Gate "identify" (D1): valida server-side, persiste CIFRADO e libera a
						// busca real. A Bevi não simula sem CPF+celular+LGPD — sem isso, o
						// pipeSearchSummaryTurn re-emite este gate (tripwire).
						if (action.gate === "identify") {
							const { cpf, celular, lgpd } = action.value;
							const celularDigits = (celular ?? "").replace(/\D/g, "");
							if (!lgpd || !isValidCpf(cpf) || celularDigits.length < 10) {
								await writeAndSaveText(
									writer,
									conversationId,
									meta.currentPersona ?? null,
									!isValidCpf(cpf)
										? "Esse CPF não confere — dá uma olhadinha nos números?"
										: "Preciso do celular completo (com DDD) e do aceite pra seguir, tá?",
								);
								await pipeGatePrompt({ conversationId, gate: "identify", writer });
								return;
							}
							await storeIdentity(conversationId, { cpf, celular: celularDigits });
							// Celular vira contato do lead (mesma régua do whatsapp_optin).
							const { saveContactWhatsapp } = await import("@/lib/leads/contact-capture");
							await saveContactWhatsapp(conversationId, celularDigits).catch(() => {});
							await pipeSearchSummaryTurn({ conversationId, contactName, writer, userKey });
							return;
						}

						// docx passo 2: "Qual valor aproximado?" — o valor do lance vem do
						// USUÁRIO (gate lance-value), nunca derivado silencioso (auditoria
						// 2026-06-04). Persiste e dispara o próximo gate (lance-embutido).
						if (action.gate === "lance-value") {
							const merged: NonNullable<ConversationMetadata["qualifyAnswers"]> = {
								...(meta.qualifyAnswers ?? {}),
								lanceValue: action.value.lanceValue,
							};
							await persistMeta(conversationId, { ...meta, qualifyAnswers: merged });
							await pipeGatePrompt({ conversationId, gate: "lance-embutido", writer });
							return;
						}

						if (action.gate === "lance-embutido") {
							const considera = action.value === "yes";
							const q = meta.qualifyAnswers ?? {};
							const merged: NonNullable<ConversationMetadata["qualifyAnswers"]> = {
								...q,
								lanceEmbutido: considera,
								lanceEmbutidoPercent: considera ? LANCE_EMBUTIDO_DEFAULT_PERCENT : undefined,
								// lanceValue veio do gate lance-value (resposta do usuário).
								lanceValue: q.lanceValue,
							};
							await persistMeta(conversationId, { ...meta, qualifyAnswers: merged });
							if (!meta.currentCategory) return;
							await pipeSearchSummaryTurn({ conversationId, contactName, writer, userKey });
							return;
						}
					});
					trace.setFinish("ok");
				} finally {
					trace.finalize();
				}
			},
			onError: (error: unknown) =>
				error instanceof Error ? error.message : "Erro interno no servidor",
		});
		return createUIMessageStreamResponse({
			stream,
			headers: { "X-Conversation-Id": conversationId },
		});
	}

	const userText = lastUserText(body.messages);
	if (!userText) {
		return new Response("No user message in payload", { status: 400 });
	}

	// Intent textual "voltar" — early-return sem chamar o agent (#06 Bruna v1 review).
	if (detectBackIntent(userText)) {
		await saveMessage(conversationId, "user", userText, "web");
		const { stack: nextStack, popped } = popNavState(meta.navigationStack ?? []);
		const ackText = popped ? "Voltando ao passo anterior." : "Você já está no início.";
		if (popped) {
			await persistMeta(conversationId, {
				...meta,
				navigationStack: nextStack,
				currentPersona: popped.persona,
				currentCategory: popped.category ?? undefined,
				expertiseLevel: popped.expertiseLevel,
				experiencePrev: popped.experiencePrev ?? undefined,
				qualifyAnswers: popped.qualifyAnswers,
			});
		}
		await saveMessage(conversationId, "assistant", ackText, "web", meta.currentPersona);
		const stream = createUIMessageStream<AjaUIMessage>({
			execute: ({ writer }) => {
				const id = crypto.randomUUID();
				writer.write({ type: "text-start", id });
				writer.write({ type: "text-delta", id, delta: ackText });
				writer.write({ type: "text-end", id });
			},
		});
		return createUIMessageStreamResponse({
			stream,
			headers: { "X-Conversation-Id": conversationId, "X-Navigation": popped ? "back" : "noop" },
		});
	}

	const stream = createUIMessageStream<AjaUIMessage>({
		// FIX-21: trajetória observável do turno de usuário (web SSE).
		execute: async ({ writer: rawWriter }) => {
			const trace = new TurnTrace({
				conversationId,
				channel: "web",
				persona: meta.currentPersona ?? null,
			});
			const writer = instrumentWriter(rawWriter, trace);
			try {
				await withSimulatorClockIfNeeded(conv ?? null, async () => {
					await pipeUserTurn({ conversationId, userText, contactName, writer, userKey });
				});
				trace.setFinish("ok");
			} finally {
				trace.finalize();
			}
		},
		onError: (error: unknown) =>
			error instanceof Error ? error.message : "Erro interno no servidor",
	});

	const responseHeaders: Record<string, string> = {
		"X-Conversation-Id": conversationId,
	};
	if (setNewCookie) {
		responseHeaders["Set-Cookie"] =
			`${COOKIE_NAME}=${userKey}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax; HttpOnly`;
	}
	return createUIMessageStreamResponse({
		stream,
		headers: responseHeaders,
	});
}
