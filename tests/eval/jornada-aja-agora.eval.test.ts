/**
 * ============================================================================
 * CENÁRIO — A Jornada Aja Agora (jornada.docx), do sonho à contratação
 * ============================================================================
 *
 * Este arquivo é o cenário canônico da experiência desenhada no `jornada.docx`
 * (a jornada de 7 passos que a Bruna escreveu). Ele NÃO testa só "a tool X
 * disparou" — testa que a EXPERIÊNCIA do documento acontece: o tom acolhedor,
 * o jeito de explicar consórcio pra quem nunca fez, a educação sobre lance
 * embutido, o plano recomendado pela Aja Agora, o "Esse plano faz sentido?",
 * as outras opções sob demanda e o FECHAMENTO COMPLETO (carta real →
 * assinatura → documentos → Parabéns → resumo por WhatsApp).
 *
 * FIDELIDADE DO HARNESS (revisão adversarial 2026-06-04): NADA de pré-seed
 * cego — a qualificação percorre a CADEIA REAL de gates, lendo o gate emitido
 * em cada turno e respondendo como o usuário clicaria. O transcript do judge
 * contém o que o usuário VIU: perguntas de gate (gateQuestion), botões
 * (gatePartData) e o conteúdo dos cards — não só "[artifact: x]".
 *
 *   ┌─ passo 1  Entender a necessidade  → acolhe o sonho + pergunta o nome
 *   ├─ passo 2  Entender o cliente      → experience → consent → identify (D1) →
 *   │                                      credit → lance → lance-value →
 *   │                                      lance-embutido (reveal no fim)
 *   │                                      (FIX-53: identidade cedo, logo após o
 *   │                                      consent; FIX-103: gate de prazo removido)
 *   ├─ passo 3  Buscar alternativas     → "encontramos boas opções" (3 reais)
 *   ├─ passo 4  Avaliar/simular/definir  → recomendado → simulador (Bernardo)
 *   │                                      → outras opções → decisão
 *   └─ passo 5  Contratar               → carta real → confirmação → assinatura
 *                                          → docs → "Parabéns!" → resumo (zap)
 *
 * Roda só no eval (LLM real) — `vitest --config vitest.eval.config.ts`. É lento
 * e profundo de propósito. Camada 3 (nightly). As defesas determinísticas que
 * travam o passo 4→5 em todo PR vivem em:
 *   - src/lib/agent/qualify-state.decision-gate.test.ts
 *   - src/lib/agent/orchestrator/decision-advancement.test.ts
 *   - src/lib/agent/orchestrator/jornada-docx-copy.test.ts
 *   - tests/regression/agent-trajectory.test.ts (BUG-REVEAL-LOOP)
 */

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { beviProposals, conversations, leadEvents, leads, messages } from "@/db/schema";
import { __setDiscoveryAdapterFactoryForTests, __setProposalGatewayForTests } from "@/lib/adapters";
import { runTurn, type TurnEvent } from "@/lib/agent/orchestrator";
import {
	buildCreditReactionDirective,
	buildExperienceFirstDirective,
	buildLanceReactionDirective,
	buildSearchSummaryDirective,
	buildSimulatorDialDirective,
	buildTimeframeReactionDirective,
} from "@/lib/agent/orchestrator/directives";
import { gateQuestion } from "@/lib/agent/orchestrator/gate-questions";
import { lanceValueOptions, objetivoForPrazo } from "@/lib/agent/qualify-config";
import type { Gate } from "@/lib/agent/qualify-state";
import { closingPresentation, realOfferPresentation } from "@/lib/bevi/closing-presentation";
import { sendContractSummary } from "@/lib/bevi/contract-summary";
import { confirmOffer, startContract } from "@/lib/bevi/fulfillment";
import { buildOtherOptions } from "@/lib/bevi/other-options";
import { DECISION_PROMPT_OPTIONS, DECISION_PROMPT_QUESTION } from "@/lib/chat/types";
import { loadIdentity, storeIdentity } from "@/lib/conversation/identity";
import { saveMessage } from "@/lib/conversation/messages";
import { persistMeta, reloadMeta } from "@/lib/conversation/meta";
import { judgeJornada } from "@/lib/eval/jornada-judge";
import { fluxoScore, type JornadaJudgeResult } from "@/lib/eval/jornada-rubric";
import { gatePartData, WELCOME_OPTIONS } from "@/lib/web/adapter";
import {
	FIXTURE_IDENTITY,
	FIXTURE_OFFERS,
	fixtureDiscoveryAdapter,
} from "../helpers/fixture-discovery-adapter";
import { MockProposalGateway } from "../helpers/mock-proposal-gateway";
import { anthropicAvailable, warnEvalSkipped } from "./anthropic-availability";

// ── MOCK-RUNTIME-MORTO: o eval NUNCA toca a Bevi real ──
// Descoberta: adapter de FIXTURES (capturas reais da loja-piloto) via seam.
// Fechamento: gateway DUBLÊ via seam — startContract/confirmOffer reais rodam
// contra ele (zero proposta real, zero bureau). Sem os seams, search_groups
// criaria proposta REAL na Bevi com CPF semeado — proibido (LGPD, spec §13).
beforeAll(() => {
	// Chave de cifra exclusiva do eval (a identidade semeada é sintética).
	if (!process.env.IDENTITY_ENC_KEY) {
		process.env.IDENTITY_ENC_KEY = Buffer.alloc(32, 9).toString("base64");
	}
	// TRIPWIRE FIEL À PRODUÇÃO: a identidade vem da conversa REAL (loadIdentity),
	// não de um valor sempre-presente. Antes do gate identify (storeIdentity), o
	// adapter lança IdentityNotCollectedError — igual produção —, impedindo o
	// modelo de free-rodar o reveal no meio do passo 2 (era a fonte de flakiness
	// do eval: o dublê servia ofertas mesmo sem identidade coletada).
	__setDiscoveryAdapterFactoryForTests((conversationId) =>
		fixtureDiscoveryAdapter({ identityProvider: () => loadIdentity(conversationId) }),
	);
	__setProposalGatewayForTests(new MockProposalGateway());
});
afterAll(() => {
	__setDiscoveryAdapterFactoryForTests(null);
	__setProposalGatewayForTests(null);
});

// ─────────────────────────────────────────────────────────────────────────────
// Harness — cada turno de agente passa pelo MESMO code path do POST /api/chat
// (runTurn); os handlers determinísticos do route (pipeGatePrompt,
// pipeSearchSummaryTurn, show-other-options, contract-submit, offer-confirm)
// são espelhados aqui consumindo os MESMOS módulos de produção.
// ─────────────────────────────────────────────────────────────────────────────

type Turn = {
	label: string;
	/** O que o usuário disse/clicou imediatamente antes deste turno. */
	userLine: string | null;
	/** Texto do agente + perguntas/botões de gate, como produção renderiza. */
	content: string;
	toolCalls: string[];
	artifacts: Array<{ type: string; payload: Record<string, unknown> }>;
	gates: Gate[];
	events: TurnEvent[];
};

/** Renderiza um gate como o usuário VÊ (pergunta + botões) — igual produção
 * (pipeGatePrompt/pipeOrchestratorToWriter escrevem gateQuestion + chips). */
async function renderGate(conversationId: string, gate: Gate): Promise<string> {
	const meta = await reloadMeta(conversationId);
	const q = gateQuestion(gate, meta.currentCategory) ?? "";
	const data = gatePartData(gate, meta);
	if (data?.kind === "chips") {
		return `${q}\n[botões: ${data.options.map((o) => o.label).join(" · ")}]`;
	}
	if (data?.kind === "slider") return `${q}\n[slider: crédito + parcela mensal]`;
	if (data?.kind === "identity") return `${q}\n[card: CPF + celular + aceite LGPD]`;
	return q;
}

/** Descreve um artifact com o CONTEÚDO que o usuário vê — o judge avalia
 * fidelidade de experiência, não presença de tipo. */
function describeArtifact(a: { type: string; payload: Record<string, unknown> }): string {
	const p = a.payload as Record<string, unknown> & {
		administradora?: string;
		category?: string;
		creditValue?: number;
		monthlyPayment?: number;
		termMonths?: number;
		adminFeePercent?: number;
		contempladosMes?: number;
		lanceScenario?: { lancePercent?: number; expectedTermMonths?: number };
		embeddedBid?: { percent?: number; receivedCredit?: number };
		groups?: Array<{
			administradora?: string;
			category?: string;
			creditValue?: number;
			monthlyPayment?: number;
			termMonths?: number;
			availableSlots?: number;
		}>;
	};
	const brl = (n?: number) =>
		typeof n === "number" ? n.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "?";
	const tipo = (c?: string) =>
		({ imovel: "Imóvel", auto: "Automóvel", moto: "Moto", servicos: "Serviços" })[c ?? ""] ?? c;
	switch (a.type) {
		case "recommendation_card":
			return `[card "Plano recomendado pela Aja Agora": ${p.administradora ?? "?"} — carta R$ ${brl(p.creditValue)}, parcela R$ ${brl(p.monthlyPayment)}/mês, ${p.termMonths ?? "?"} meses, tipo de grupo ${tipo(p.category)}${p.contempladosMes !== undefined ? `, ${p.contempladosMes} contemplados/mês` : ""}]`;
		case "simulation_result": {
			const lance = p.lanceScenario
				? ` | com lance de ${p.lanceScenario.lancePercent ?? "?"}%: contemplação estimada em ~${p.lanceScenario.expectedTermMonths ?? "?"} meses (sem lance: prazo cheio de ${p.termMonths ?? "?"} meses)`
				: "";
			const embutido = p.embeddedBid
				? ` | com lance embutido de ${p.embeddedBid.percent ?? "?"}%: crédito líquido R$ ${brl(p.embeddedBid.receivedCredit)}`
				: "";
			return `[card detalhamento da simulação: ${p.administradora ?? "?"} — carta R$ ${brl(p.creditValue)}, parcela R$ ${brl(p.monthlyPayment)}/mês, ${p.termMonths ?? "?"} meses, taxa adm ${p.adminFeePercent ?? "?"}${lance}${embutido}]`;
		}
		case "comparison_table":
			return `[tabela comparativa — outras opções: ${(p.groups ?? [])
				.map(
					(g) =>
						`${g.administradora ?? "?"} (carta R$ ${brl(g.creditValue)}, parcela R$ ${brl(g.monthlyPayment)}/mês, ${g.termMonths ?? "?"} meses, tipo ${tipo(g.category)}${g.availableSlots !== undefined ? `, ${g.availableSlots} contemplados/mês` : ""})`,
				)
				.join(" · ")}]`;
		case "contemplation_dial":
			return `[simulador de contemplação (agulha): carta R$ ${brl(p.creditValue)}, parcela base R$ ${brl(p.monthlyPayment)}/mês — escolha o mês-alvo (3/6/12…) e veja a receita: lance embutido + lance próprio, crédito líquido e parcela, com e sem lance]`;
		case "decision_prompt":
			return `[card de decisão: "${DECISION_PROMPT_QUESTION}" — botões: ${DECISION_PROMPT_OPTIONS.map((o) => o.label).join(" · ")}]`;
		case "contract_form":
			return "[formulário de contratação: CPF + celular + aceite LGPD]";
		case "real_offer":
			return `[carta REAL confirmada pela administradora: ${p.administradora ?? "?"} — carta R$ ${brl(p.creditValue)}, parcela R$ ${brl(p.monthlyPayment)}/mês — botão Confirmar]`;
		case "signature_handoff":
			// DES-1: o link é o PDF da PROPOSTA (não assinatura). Assinatura/efetivação
			// é etapa posterior da mesa.
			return `[sua proposta de consórcio da ${p.administradora ?? "administradora"} está pronta — link/PDF da proposta, continuidade da Aja Agora]`;
		case "document_upload":
			return "[upload/captura de documentos (opcional agora)]";
		default:
			return `[artifact: ${a.type}]`;
	}
}

async function consumeTurn(
	conversationId: string,
	directiveOrText: string,
	isUserTurn: boolean,
	label: string,
	userLine: string | null,
): Promise<Turn> {
	const events: TurnEvent[] = [];
	const toolCalls: string[] = [];
	const artifacts: Turn["artifacts"] = [];
	const gates: Gate[] = [];
	let content = "";
	for await (const ev of runTurn({
		channel: "web",
		conversationId,
		userText: directiveOrText,
		isUserTurn,
		contactName: null,
		skipLeadCollection: true,
		userKey: null,
	})) {
		events.push(ev);
		if (ev.type === "text-delta") content += ev.text;
		else if (ev.type === "tool-call") toolCalls.push(ev.toolName);
		else if (ev.type === "artifact") artifacts.push({ type: ev.artifactType, payload: ev.payload });
		else if (ev.type === "gate") gates.push(ev.gate);
	}
	// A pergunta + chips de cada gate entram no transcript via gatePromptTurn (1x,
	// fonte única) — não re-anexamos aqui pra não duplicar a pergunta e fazer o
	// diálogo parecer robótico ao judge. O turno de reação carrega só a fala do agente.
	return { label, userLine, content, toolCalls, artifacts, gates, events };
}

/** Turno só da resposta do usuário (clique de chip que o route processa sem LLM
 * — lance-value/lance-embutido/identify). Mantém o "USUÁRIO: …" no transcript. */
function userReplyTurn(label: string, userLine: string): Turn {
	return { label, userLine, content: "", toolCalls: [], artifacts: [], gates: [], events: [] };
}

/** Turno sintético espelhando pipeGatePrompt (pergunta+card SEM turno de LLM). */
async function gatePromptTurn(conversationId: string, gate: Gate, label: string): Promise<Turn> {
	return {
		label,
		userLine: null,
		content: await renderGate(conversationId, gate),
		toolCalls: [],
		artifacts: [],
		gates: [gate],
		events: [],
	};
}

/** Turno sintético a partir dos itens de closing-presentation/other-options
 * (os handlers determinísticos do route escrevem exatamente estes itens). */
function itemsTurn(
	label: string,
	userLine: string | null,
	items: Array<
		| { kind: "text"; text: string }
		| { kind: "artifact"; type: string; payload: Record<string, unknown> }
	>,
): Turn {
	return {
		label,
		userLine,
		content: items
			.filter((i): i is { kind: "text"; text: string } => i.kind === "text")
			.map((i) => i.text)
			.join("\n"),
		toolCalls: [],
		artifacts: items
			.filter(
				(i): i is { kind: "artifact"; type: string; payload: Record<string, unknown> } =>
					i.kind === "artifact",
			)
			.map((i) => ({ type: i.type, payload: i.payload })),
		gates: [],
		events: [],
	};
}

type GateResponse = { turns: Turn[]; nextGate?: Gate; done?: boolean } | null;

// Responde a um gate exatamente como o handler do route + o clique do docx.
async function respondToGate(conversationId: string, gate: Gate): Promise<GateResponse> {
	const meta = await reloadMeta(conversationId);
	const q = meta.qualifyAnswers ?? {};
	switch (gate) {
		case "experience": {
			// docx passo 2: "Você já participou de um consórcio antes?" → primeira vez.
			const label = "É a primeira vez";
			await persistMeta(conversationId, { ...meta, experiencePrev: "first" });
			await saveMessage(conversationId, "user", label, "web");
			const t = await consumeTurn(
				conversationId,
				buildExperienceFirstDirective(label),
				false,
				"passo2:explicação",
				label,
			);
			return { turns: [t] };
		}
		case "credit": {
			// Carta COERENTE com as capturas reais de auto (ITAÚ 54.832 / BB 50.000 /
			// ÂNCORA 42.000) — pedir 100k com fixtures de ~50k faria a recomendação
			// divergir do pedido sem explicação (apontado pelo judge na rodada 1).
			const label = "R$ 55.000 · R$ 1.100/mês";
			await persistMeta(conversationId, {
				...meta,
				qualifyAnswers: { ...q, creditMin: 45_000, creditMax: 55_000, monthlyBudget: 1_100 },
			});
			await saveMessage(conversationId, "user", label, "web");
			const t = await consumeTurn(
				conversationId,
				buildCreditReactionDirective(label),
				false,
				"passo2:credit",
				label,
			);
			return { turns: [t] };
		}
		case "timeframe": {
			// docx: "O mais rápido possível" → contemplação rápida (lance pesa).
			const label = "O mais rápido possível";
			await persistMeta(conversationId, {
				...meta,
				qualifyAnswers: { ...q, prazoMeses: 0, objetivo: objetivoForPrazo(0) },
			});
			await saveMessage(conversationId, "user", label, "web");
			const t = await consumeTurn(
				conversationId,
				buildTimeframeReactionDirective(label),
				false,
				"passo2:timeframe",
				label,
			);
			return { turns: [t] };
		}
		case "lance": {
			const label = "Sim, tenho reserva";
			await persistMeta(conversationId, { ...meta, qualifyAnswers: { ...q, hasLance: "yes" } });
			await saveMessage(conversationId, "user", label, "web");
			const t = await consumeTurn(
				conversationId,
				buildLanceReactionDirective(label),
				false,
				"passo2:lance",
				label,
			);
			return { turns: [t] };
		}
		case "lance-value": {
			// route: persiste lanceValue + pipeGatePrompt(lance-embutido), sem LLM.
			// O clique usa a OPÇÃO REAL do chip (~30% da carta) — mesma config da UI.
			const opt = lanceValueOptions(q.creditMax ?? 55_000)[2];
			const label = opt.title;
			await persistMeta(conversationId, {
				...meta,
				qualifyAnswers: { ...q, lanceValue: Number(opt.token) },
			});
			await saveMessage(conversationId, "user", label, "web");
			return { turns: [userReplyTurn("passo2:lance-value", label)] };
		}
		case "lance-embutido": {
			// route: persiste opt-in + SEMPRE dispara pipeSearchSummaryTurn (reveal) —
			// a identidade já foi coletada CEDO (gate identify, logo após consent),
			// então a tripwire de identidade sempre passa aqui (fim da qualificação).
			const label = "Sim, quero considerar lance embutido";
			await persistMeta(conversationId, {
				...meta,
				qualifyAnswers: { ...q, lanceEmbutido: true, lanceEmbutidoPercent: 30 },
			});
			await saveMessage(conversationId, "user", label, "web");
			const refreshed = await reloadMeta(conversationId);
			if (refreshed.searchDispatched || !refreshed.currentCategory) {
				return { turns: [userReplyTurn("passo2:lance-embutido", label)] };
			}
			await persistMeta(conversationId, { ...refreshed, searchDispatched: true });
			const t = await consumeTurn(
				conversationId,
				buildSearchSummaryDirective({ category: refreshed.currentCategory, meta: refreshed }),
				false,
				"passo3+4:reveal",
				label,
			);
			return { turns: [t] };
		}
		case "identify": {
			// route (D1): valida + storeIdentity + saveContactWhatsapp; dispara o
			// PRÓXIMO gate da qualificação (credit) com "Perfeito, recebido!" — NÃO
			// revela aqui. FIX-53: identidade sobe pra logo após o consent (antes do
			// credit); o reveal fica pro FIM da cadeia (gate lance-embutido), quando
			// a tripwire de identidade (pipeSearchSummaryTurn) já passa sempre.
			// Identidade SINTÉTICA (DV válido) — só alcança o adapter de fixtures.
			const label = "Enviei meus dados pra buscar as ofertas";
			await storeIdentity(conversationId, FIXTURE_IDENTITY);
			const { saveContactWhatsapp } = await import("@/lib/leads/contact-capture");
			await saveContactWhatsapp(conversationId, FIXTURE_IDENTITY.celular).catch(() => {});
			await saveMessage(conversationId, "user", label, "web");
			return {
				turns: [
					{
						label: "passo2:identify",
						userLine: label,
						content: "Perfeito, recebido!",
						toolCalls: [],
						artifacts: [],
						gates: [],
						events: [],
					},
				],
			};
		}
		case "simulator-offer": {
			// route: persiste simulatorOfferDispatched + directive do dial (Bernardo).
			const label = "Quero ver!";
			await persistMeta(conversationId, { ...meta, simulatorOfferDispatched: true });
			await saveMessage(conversationId, "user", label, "web");
			const t = await consumeTurn(
				conversationId,
				buildSimulatorDialDirective({ administradora: meta.recommendedAdministradora }),
				false,
				"passo4:simulador",
				label,
			);
			return { turns: [t], done: true };
		}
		default:
			// search / doubts-wait / decision → dirigidos pelo orquestrador, sem clique.
			return null;
	}
}

const HAS_API_KEY = !!process.env.ANTHROPIC_API_KEY;
// Camada 3 exige API REAL disponível — cota esgotada/5xx/rede não é regressão
// (ver tests/eval/anthropic-availability.ts). Top-level await: vitest ESM ok.
const AVAILABILITY = HAS_API_KEY
	? await anthropicAvailable()
	: { ok: false, reason: "ANTHROPIC_API_KEY ausente" };
if (HAS_API_KEY && !AVAILABILITY.ok)
	warnEvalSkipped(import.meta.url.split("/").pop() ?? "eval", AVAILABILITY.reason ?? "");
const describeIfKey = AVAILABILITY.ok ? describe : describe.skip;

// Helpers de leitura do transcript.
const artifactTypes = (turns: Turn[]) => turns.flatMap((t) => t.artifacts).map((a) => a.type);
const countType = (turns: Turn[], type: string) =>
	artifactTypes(turns).filter((t) => t === type).length;
const allTools = (turns: Turn[]) => turns.flatMap((t) => t.toolCalls);
const allGates = (turns: Turn[]) => turns.flatMap((t) => t.gates);
const allText = (turns: Turn[]) =>
	turns
		.map((t) => t.content)
		.join("\n---\n")
		.toLowerCase();

// ─────────────────────────────────────────────────────────────────────────────

describeIfKey("CENÁRIO — A Jornada Aja Agora (passo 1→5, carro, primeira vez)", () => {
	let conversationId: string | null = null;
	const turns: Turn[] = [];
	const cap: {
		intro?: Turn;
		explica?: Turn;
		reveal?: Turn;
		simulador?: Turn;
		simuladorWhatIf?: Turn;
		decisao?: Turn;
		outras?: Turn;
		contrato?: Turn;
		cartaReal?: Turn;
		fechamento?: Turn;
	} = {};
	const sentSummaries: Array<{ to: string; text: string }> = [];
	let summarySent = false;
	let simulatorGateEmitted = false;

	afterAll(async () => {
		if (!conversationId) return;
		const lead = await db.query.leads.findFirst({
			where: eq(leads.conversationId, conversationId),
		});
		if (lead) {
			await db.delete(leadEvents).where(eq(leadEvents.leadId, lead.id));
			await db.delete(leads).where(eq(leads.id, lead.id));
		}
		await db.delete(beviProposals).where(eq(beviProposals.conversationId, conversationId));
		await db.delete(messages).where(eq(messages.conversationId, conversationId));
		await db.delete(conversations).where(eq(conversations.id, conversationId));
	});

	beforeAll(async () => {
		const [conv] = await db
			.insert(conversations)
			.values({
				channel: "web",
				isSimulated: true,
				metadata: { evalScenario: "jornada-aja-agora" },
			})
			.returning();
		conversationId = conv.id;

		// ── passo 1 — Entender a necessidade: welcome + o sonho do carro + o nome ──
		// O docx abre com "O que vc deseja conquistar?" + botões de categoria — é a
		// landing de produção (WELCOME_OPTIONS). Entra no transcript como o usuário vê.
		turns.push({
			label: "passo1:welcome",
			userLine: null,
			content: `O que você deseja conquistar?\n[botões: ${WELCOME_OPTIONS.map((o) => o.label).join(" · ")}]`,
			toolCalls: [],
			artifacts: [],
			gates: [],
			events: [],
		});
		const sonho = "Quero comprar um carro novo, qual o melhor consórcio pra mim?";
		cap.intro = await consumeTurn(conv.id, sonho, true, "passo1:sonho", sonho);
		turns.push(cap.intro);

		const nameTurn = await consumeTurn(conv.id, "Kairo", true, "passo1:nome", "Kairo");
		turns.push(nameTurn);

		// ── passo 2→3+4 — a CADEIA de gates do docx, dirigida na ORDEM canônica ──
		// A ORDEM dos gates é determinística (provada SEM LLM em
		// qualify-state.*.test.ts, Camada 1) — o harness a percorre na sequência do
		// docx, respondendo cada gate como o usuário clicaria. NÃO dependemos do
		// modelo encadear o próximo gate num turno de reação: o dublê de fixtures
		// não tem a tripwire de identidade, então o modelo às vezes free-roda o
		// reveal cedo e o encadeamento por lastGateOf fica flaky (visto no eval).
		// A FIDELIDADE vem de renderGate (pergunta + botões reais que o usuário vê)
		// + a reação real do modelo capturada em cada turno; o judge avalia
		// tom/didática/conteúdo, não o encadeamento (isso é Camada 1).
		// FIX-53 (2026-06-19): identify sobe pra logo após o consent (antes do
		// credit) — "pedir os dados, antes do valor". O reveal (busca real) fica
		// pro FIM da cadeia, disparado no gate lance-embutido (tripwire da
		// identidade, já coletada cedo, sempre passa nesse ponto).
		// FIX-103 (2026-06-28): o gate de prazo (timeframe) saiu da qualificação —
		// a sequência pula de credit (valor) direto pra lance.
		const GATE_SEQUENCE: Gate[] = [
			"experience",
			"identify",
			"credit",
			"lance",
			"lance-value",
			"lance-embutido",
		];
		for (const gate of GATE_SEQUENCE) {
			// 1. O usuário VÊ a pergunta + botões/card do gate (fidelidade + determinismo
			//    — allGates reflete a sequência dirigida, não o que o modelo emitiu).
			turns.push(await gatePromptTurn(conv.id, gate, `passo2:gate:${gate}`));
			// 2. O usuário responde (clica) → reação do modelo / reveal quando aplicável.
			const result = await respondToGate(conv.id, gate);
			if (!result) continue;
			turns.push(...result.turns);
			for (const t of result.turns) {
				if (t.label === "passo2:explicação") cap.explica = t;
				if (t.label === "passo3+4:reveal") cap.reveal = t;
			}
		}

		// ── passo 4 — oferta do simulador EMITIDA pela máquina de estado ──
		// O reveal emite o gate simulator-offer (allowGateWithArtifacts) — pode sair
		// NO MESMO turno do reveal OU num turno de reação do usuário. NADA de
		// fallback dirigido: se a máquina de estado não emitir o gate, simulador não
		// aparece e os asserts/judge REPROVAM (P0 da revisão adversarial, rodada 2).
		if (!allGates(turns).includes("simulator-offer")) {
			// o reveal não emitiu no mesmo turno → reação do usuário deve disparar.
			const react = "que legal, gostei dessa recomendação!";
			const reactTurn = await consumeTurn(conv.id, react, true, "passo4:reação", react);
			turns.push(reactTurn);
		}
		if (allGates(turns).includes("simulator-offer")) {
			simulatorGateEmitted = true;
			// o usuário VÊ a oferta do simulador ("3, 6 ou 12 meses — que tal?") e aceita
			// → dirige o contemplation_dial do Bernardo.
			turns.push(await gatePromptTurn(conv.id, "simulator-offer", "passo4:oferta-simulador"));
			const r = await respondToGate(conv.id, "simulator-offer");
			if (r?.turns.length) {
				turns.push(...r.turns);
				cap.simulador = r.turns[r.turns.length - 1];
			}
			// FIX-106: LOOP conversacional — o usuário pergunta um mês-alvo por TEXTO
			// e o agente recalcula via simulate_contemplation (não re-renderiza a
			// agulha). É o caminho do WhatsApp e o what-if de mês em qualquer canal.
			const whatIf = "e se eu quiser ser contemplado em 6 meses, como ficam as parcelas?";
			const whatIfTurn = await consumeTurn(
				conv.id,
				whatIf,
				true,
				"passo4:simulador-whatif",
				whatIf,
			);
			turns.push(whatIfTurn);
			cap.simuladorWhatIf = whatIfTurn;
		}

		// ── passo 4 close — avança com afirmativos até o card de decisão ──
		const forward = [
			"faz bastante sentido pra mim, ficou ótimo",
			"isso, pode seguir",
			"perfeito, é isso mesmo",
		];
		let fi = 0;
		let sawDecision = false;
		let lastHadWhatsapp = false;
		for (let i = 0; i < 6 && !sawDecision; i++) {
			const msg = lastHadWhatsapp
				? "agora não precisa de WhatsApp, pode seguir"
				: forward[Math.min(fi++, forward.length - 1)];
			const t = await consumeTurn(conv.id, msg, true, "passo4:avança", msg);
			turns.push(t);
			const types = t.artifacts.map((a) => a.type);
			lastHadWhatsapp = types.includes("whatsapp_optin");
			if (types.includes("decision_prompt")) {
				sawDecision = true;
				cap.decisao = t;
			}
		}

		// ── passo 4 — "Quero ver outras opções" (docx linha 37, determinístico) ──
		// Espelha o handler show-other-options do route (mesmo módulo).
		{
			const label = "Quero ver outras opções";
			await saveMessage(conv.id, "user", label, "web");
			const meta = await reloadMeta(conv.id);
			const others = await buildOtherOptions(conv.id, meta);
			cap.outras = itemsTurn("passo4:outras-opções", label, [
				{ kind: "text", text: others.text },
				{
					kind: "artifact",
					type: "comparison_table",
					payload: { groups: others.groups } as Record<string, unknown>,
				},
			]);
			turns.push(cap.outras);
		}

		// ── passo 5 — contratar (LLM dirige o contract_form) ──
		for (let i = 0; i < 3 && !cap.contrato; i++) {
			const msg = i === 0 ? "quero contratar agora" : "pode seguir com a contratação";
			const t = await consumeTurn(conv.id, msg, true, "passo5:contratar", msg);
			turns.push(t);
			if (t.artifacts.some((a) => a.type === "contract_form")) cap.contrato = t;
		}

		// ── passo 5 — fechamento COMPLETO com gateway dublê (módulos de produção) ──
		// contract-submit: usuário envia o form → startContract + realOfferPresentation.
		// O route deriva valor/administradora do meta da conversa — o harness faz o
		// MESMO (senão a carta do fechamento diverge do plano recomendado, como o
		// judge pegou: pedir 100k com cenário de 55k trazia outro grupo).
		{
			const label = "Enviei meus dados no formulário de contratação";
			await saveMessage(conv.id, "user", label, "web");
			const meta = await reloadMeta(conv.id);
			const q = meta.qualifyAnswers ?? {};
			const start = await startContract(conv.id, {
				cpf: FIXTURE_IDENTITY.cpf,
				celular: FIXTURE_IDENTITY.celular,
				lgpd: true,
				segmento: "AUTOS",
				valor: q.creditMax ?? q.creditMin ?? 55_000,
				objetivo: "contemplacao_rapida",
				lanceEmbutido: "30",
				administradoraPreferida: meta.recommendedAdministradora ?? null,
			});
			cap.cartaReal = itemsTurn("passo5:carta-real", label, realOfferPresentation(start));
			turns.push(cap.cartaReal);
		}
		// offer-confirm: usuário confirma a carta → confirmOffer + closingPresentation
		// + resumo da contratação (sender dublê captura o texto REAL enviado).
		{
			const label = "Confirmo, pode seguir";
			await saveMessage(conv.id, "user", label, "web");
			const res = await confirmOffer(conv.id);
			cap.fechamento = itemsTurn("passo5:fechamento", label, closingPresentation(res));
			turns.push(cap.fechamento);
			const summary = await sendContractSummary(conv.id, {
				sendTextImpl: async (to, text) => {
					sentSummaries.push({ to, text });
				},
				whatsappConfigured: () => true,
			});
			summarySent = summary.sent;
			// O envio acontece fora do chat — o judge precisa da evidência no
			// transcript (como o usuário recebe no celular).
			if (summary.sent && sentSummaries[0]) {
				turns.push({
					label: "passo5:resumo-whatsapp",
					userLine: null,
					content: `[mensagem recebida no WhatsApp do cliente]\n${sentSummaries[0].text}`,
					toolCalls: [],
					artifacts: [],
					gates: [],
					events: [],
				});
			}
		}

		console.log(`\n[jornada] ${turns.length} turnos`);
		console.log(`[jornada gates] ${allGates(turns).join(" → ")}`);
		console.log(`[jornada artifacts] ${artifactTypes(turns).join(", ")}`);
		console.log(`[jornada tools] ${allTools(turns).join(", ")}`);
	}, 600_000);

	// ── passo 1 — Entender a necessidade ──────────────────────────────────────

	it("passo 1 — acolhe o sonho com calor e pergunta o nome (não robótico)", () => {
		const t = cap.intro?.content.toLowerCase() ?? "";
		expect(t, "primeira resposta deveria existir").not.toBe("");
		expect(
			/carro|conquist|sonho|boa|show|ótim|otim|legal|massa|top/.test(t),
			`Tom acolhedor esperado (docx). Texto: "${t.slice(0, 200)}"`,
		).toBe(true);
		expect(
			/chamar|seu nome|como.*posso/.test(t),
			`Deveria perguntar o nome. Texto: "${t.slice(0, 200)}"`,
		).toBe(true);
	});

	it("passo 1 — capturou o nome no DB (save_contact_name)", async () => {
		expect(allTools(turns)).toContain("save_contact_name");
		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, conversationId!),
		});
		expect(conv?.contactName?.toLowerCase()).toContain("kairo");
	});

	// ── passo 2 — Entender o cliente ──────────────────────────────────────────

	it("passo 2 — explica consórcio pra quem é primeira vez, no jeito do docx", () => {
		const t = (cap.explica?.content ?? "").toLowerCase();
		expect(t, "deveria haver a explicação de primeira vez").not.toBe("");
		const conceitos = [
			/sem juros|nao paga juros|não paga juros/,
			/sorteio/,
			/lance/,
			/grupo|parcela/,
			/contempl/,
			/financiamento/,
		];
		const hits = conceitos.filter((re) => re.test(t)).length;
		expect(
			hits,
			`Esperado >=4 conceitos do docx (sem juros/sorteio/lance/grupo/contemplação/financiamento). ` +
				`Encontrados: ${hits}. Texto: "${t.slice(0, 400)}"`,
		).toBeGreaterThanOrEqual(4);
		expect(
			/fundo de reserva|lance livre|lance fixo/.test(t),
			"não deve jogar jargão no leigo",
		).toBe(false);
	});

	it("passo 2 — a CADEIA REAL de gates aconteceu na ordem do docx (zero pré-seed)", () => {
		// FIX-53: experience → consent → identify (D1, cedo) → credit → lance →
		// lance-value → lance-embutido (reveal no fim). FIX-103: o gate de
		// prazo/timeframe saiu. O harness só responde o que o produto emite — se um
		// gate não aparecer aqui, o PRODUTO pulou um passo.
		const seq = allGates(turns);
		const expected: Gate[] = [
			"experience",
			"identify",
			"credit",
			"lance",
			"lance-value",
			"lance-embutido",
		];
		let cursor = 0;
		for (const g of seq) {
			if (g === expected[cursor]) cursor++;
			if (cursor === expected.length) break;
		}
		expect(
			cursor,
			`Cadeia de gates incompleta/fora de ordem. Esperado (em ordem): ${expected.join(" → ")}. ` +
				`Observado: ${seq.join(" → ")}`,
		).toBe(expected.length);
	});

	it("passo 2 — as perguntas dos gates aparecem no transcript (o que o usuário viu)", () => {
		// FIX-103 (2026-06-28): o gate "timeframe" ("Em quanto tempo...") saiu da
		// qualificação — nextGate nunca mais o emite. Assert de "/quanto tempo/"
		// removido (stale desde então; passava despercebido porque este eval é
		// Camada 3 nightly, não roda em todo PR).
		const t = allText(turns);
		expect(t).toMatch(/já fez consórcio|ja fez consorcio/);
		expect(t).toMatch(/reserva/);
		expect(t).toMatch(/valor aproximado/);
		expect(t).toMatch(/lance embutido/);
		expect(t).toMatch(/analisar várias administradoras|analisar varias administradoras/);
	});

	it("passo 2 — respostas da qualificação persistidas (DB, não pré-seed)", async () => {
		const meta = await reloadMeta(conversationId!);
		expect(meta.qualifyAnswers?.hasLance, "tem reserva pra lance (docx: Sim)").toBe("yes");
		expect(
			meta.qualifyAnswers?.lanceValue,
			"valor do lance veio do gate lance-value (opção ~30% da carta)",
		).toBe(Number(lanceValueOptions(55_000)[2].token));
		expect(meta.qualifyAnswers?.lanceEmbutido, "opt-in de lance embutido gravado").toBe(true);
		// FIX-103: o gate de prazo saiu — o `objetivo` não é mais derivado de um
		// prazo declarado na qualificação (calibrado pelo tom da conversa, se houver).
		expect(meta.identityCollected, "identidade coletada no gate identify (D1)").toBe(true);
	});

	// ── passo 3 — Buscar alternativas ─────────────────────────────────────────

	it("passo 3 — a descoberta tem >=3 opções reais; recomendada + outras 2 no clique", () => {
		// docx: "Encontramos 3 boas opções" — a descoberta (fixtures de capturas
		// reais) serve >=3; o usuário vê a recomendada PRIMEIRO e as outras 2 sob
		// demanda ("Quero ver outras opções").
		expect(FIXTURE_OFFERS.length).toBeGreaterThanOrEqual(3);
		expect(artifactTypes(turns)).toContain("recommendation_card");
		const outras = cap.outras?.artifacts.find((a) => a.type === "comparison_table");
		const groups = (outras?.payload as { groups?: Array<{ administradora?: string }> })?.groups;
		expect(groups?.length, "docx: 'as outras 2' no clique").toBe(2);
	});

	it("passo 4 — outras opções NÃO repetem a recomendada (comparação honesta)", async () => {
		const meta = await reloadMeta(conversationId!);
		const outras = cap.outras?.artifacts.find((a) => a.type === "comparison_table");
		const groups =
			(outras?.payload as { groups?: Array<{ administradora?: string }> })?.groups ?? [];
		expect(meta.recommendedAdministradora, "recomendada registrada no reveal").toBeTruthy();
		for (const g of groups) {
			expect(g.administradora).not.toBe(meta.recommendedAdministradora);
		}
	});

	// ── passo 4 — Avaliar, simular e definir ──────────────────────────────────

	it("passo 4 — destacou o plano recomendado pela Aja Agora", () => {
		expect(artifactTypes(turns), "docx: 'Plano recomendado pela Aja Agora' (destaque)").toContain(
			"recommendation_card",
		);
	});

	it("passo 4 — apresentou o detalhamento (simulação) do plano", () => {
		expect(artifactTypes(turns)).toContain("simulation_result");
	});

	it("passo 4 — detalhamento traz a variação com/sem lance e lance embutido (payload)", () => {
		// docx (linhas 40-41): "Mostrar variação com/sem lance e com lance
		// embutido." P2 da rodada 3 do revisor: os campos eram opcionais e
		// dependiam da LLM copiá-los — agora a directive obriga e este assert
		// trava o payload REAL (não a boa-vontade do modelo).
		const sim = turns.flatMap((t) => t.artifacts).find((a) => a.type === "simulation_result");
		expect(sim, "simulation_result ausente").toBeTruthy();
		const p = sim?.payload as {
			lanceScenario?: { lancePercent?: number; expectedTermMonths?: number };
			embeddedBid?: { percent?: number; receivedCredit?: number };
		};
		expect(p?.lanceScenario, "lanceScenario (variação com/sem lance) ausente").toBeTruthy();
		expect(p?.lanceScenario?.lancePercent ?? 0).toBeGreaterThan(0);
		// O cenário opta por lance embutido (docx caminho rico) — o detalhamento
		// TEM que mostrar a variação com embutido.
		expect(p?.embeddedBid, "embeddedBid (variação com lance embutido) ausente").toBeTruthy();
		expect(p?.embeddedBid?.receivedCredit ?? 0).toBeGreaterThan(0);
	});

	it("passo 4 — recomendado traz contemplados/mês REAL no payload (docx resumo por opção)", () => {
		const rec = turns.flatMap((t) => t.artifacts).find((a) => a.type === "recommendation_card");
		expect(rec, "recommendation_card ausente").toBeTruthy();
		const p = rec?.payload as { contempladosMes?: number };
		// FIX-191/192: contempladosMes NÃO vem mais do modelo — o runner o COAGE do
		// availableSlots REAL do grupo (>0 → mostra; 0/ausente → oculto). A fixture
		// da recomendada (ITAÚ) tem monthlyAwardedQuotas=3, então o card coagido
		// exibe 3 contemplados/mês (dado real ancorado, não digitado pela LLM).
		expect(p?.contempladosMes, "contempladosMes ausente no card recomendado").toBeGreaterThan(0);
	});

	it("passo 4 — simulador do Bernardo com DADOS COERENTES do plano (contemplation_dial)", () => {
		// docx (linha 39-41): simulador 3/6/12 — e o payload tem que ser o plano
		// REAL (carta > 0, prazo > 0, parcela > 0), não números soltos.
		const dial = turns.flatMap((t) => t.artifacts).find((a) => a.type === "contemplation_dial");
		expect(
			dial,
			`Esperado contemplation_dial (simulador aceito). Artifacts: [${artifactTypes(turns).join(", ")}]`,
		).toBeTruthy();
		const p = dial?.payload as {
			creditValue?: number;
			termMonths?: number;
			monthlyPayment?: number;
		};
		expect(p?.creditValue ?? 0, "carta real no dial").toBeGreaterThan(0);
		expect(p?.termMonths ?? 0, "prazo real no dial").toBeGreaterThan(0);
		expect(p?.monthlyPayment ?? 0, "parcela real no dial").toBeGreaterThan(0);
	});

	it("passo 4 — LOOP conversacional: what-if de mês recalcula via simulate_contemplation (FIX-106)", () => {
		// O usuário perguntou "e em 6 meses?" por TEXTO — o agente deve recalcular
		// com a tool de CÁLCULO (simulate_contemplation), não re-renderizar a agulha.
		const t = cap.simuladorWhatIf;
		expect(t, "turno de what-if do simulador não capturado").toBeTruthy();
		const tools = (t?.events ?? [])
			.filter((e) => e.type === "tool-call")
			.map((e) => (e as { toolName: string }).toolName);
		expect(
			tools.includes("simulate_contemplation"),
			`Esperado simulate_contemplation no what-if de mês. Tools: [${tools.join(", ")}]`,
		).toBe(true);
	});

	it("passo 4 — a oferta do simulador foi EMITIDA pela máquina de estado (sem fallback)", () => {
		// P0 da revisão adversarial (rodada 2): o harness antigo forçava o dial
		// via directive quando o gate não aparecia — mascarando regressão da
		// máquina de estado (nextGate/decideShowGate). Agora: ou o produto emite
		// o gate simulator-offer na sequência do reveal, ou este teste reprova.
		expect(
			simulatorGateEmitted,
			`O gate simulator-offer NÃO foi emitido pela máquina de estado. Gates observados: ${allGates(turns).join(" → ")}`,
		).toBe(true);
		expect(allGates(turns)).toContain("simulator-offer");
	});

	it("passo 4 — a oferta do simulador usou a copy literal do docx (3, 6 ou 12 meses)", () => {
		expect(allText(turns)).toMatch(/3, 6 ou 12 meses/);
	});

	it("passo 4 close — cruzou pro 'Esse plano faz sentido?' (present_decision_prompt)", () => {
		expect(
			artifactTypes(turns).includes("decision_prompt"),
			`Esperado decision_prompt (fim do passo 4). Artifacts: [${artifactTypes(turns).join(", ")}]. ` +
				"Sem ele a jornada trava no passo 4 — era o BUG-REVEAL-LOOP.",
		).toBe(true);
	});

	// ── ANTI-LOOP (o bug que originou este cenário) ───────────────────────────

	it("ANTI-LOOP — não ficou re-mostrando os mesmos cards a cada afirmativo", () => {
		// comparison_table aparece no máx 2x: 1 no reveal (carrossel das opções,
		// Kairo 2026-06-11) + 1 no clique determinístico de "outras opções".
		// recommendation_card no máx 1x.
		expect(
			countType(turns, "comparison_table"),
			"comparison_table além da descoberta + outras opções = loop",
		).toBeLessThanOrEqual(2);
		expect(
			countType(turns, "recommendation_card"),
			"recommendation_card repetido = loop",
		).toBeLessThanOrEqual(1);
	});

	// ── passo 5 — Contratar (fechamento COMPLETO) ─────────────────────────────

	it("passo 5 — apresentou o formulário de contratação (CPF/celular/LGPD)", () => {
		expect(
			artifactTypes(turns).includes("contract_form"),
			`Esperado contract_form (passo 5 — proposta REAL). Artifacts: [${artifactTypes(turns).join(", ")}].`,
		).toBe(true);
	});

	it("passo 5 — carta REAL confirmada pela administradora antes do aceite", () => {
		const offer = cap.cartaReal?.artifacts.find((a) => a.type === "real_offer");
		expect(offer, "real_offer (passo 5.1) ausente").toBeTruthy();
		const p = offer?.payload as { administradora?: string; creditValue?: number };
		expect(p?.administradora).toBeTruthy();
		expect(p?.creditValue ?? 0).toBeGreaterThan(0);
	});

	it("passo 5 — reforços LITERAIS do docx no fechamento", () => {
		const t = cap.fechamento?.content ?? "";
		expect(t).toMatch(/escolhida pela Aja Agora/);
		expect(t).toMatch(/para o seu perfil/);
		expect(t).toMatch(/segue com você até a contemplação/);
	});

	it("passo 5 — proposta pronta + documentos encaminhados (sem trocar de empresa, DES-1)", () => {
		// DES-1: signature_handoff entrega o PDF da PROPOSTA (não assinatura — essa
		// é etapa posterior da mesa). document_upload é o portal de documentos.
		const types = cap.fechamento?.artifacts.map((a) => a.type) ?? [];
		expect(types).toContain("signature_handoff");
		expect(types).toContain("document_upload");
	});

	it('passo 5 — fechou com o "Parabéns!" literal do docx', () => {
		expect(cap.fechamento?.content ?? "").toContain(
			"Parabéns! Agora você está oficialmente mais perto da sua conquista!",
		);
	});

	it("passo 5 — resumo da contratação enviado por WhatsApp (docx linha 52)", () => {
		expect(summarySent, "resumo deveria ter sido enviado (sender dublê)").toBe(true);
		expect(sentSummaries).toHaveLength(1);
		const { to, text } = sentSummaries[0];
		expect(to).toBe(`55${FIXTURE_IDENTITY.celular}`);
		expect(text.toLowerCase()).toMatch(/resumo da( sua)? contratação/);
		expect(text).toMatch(/Administradora:/);
		expect(text).toMatch(/Parcela mensal:/);
	});

	it("passo 5 — a jornada FECHA em contratar, não em captura de lead", () => {
		const types = artifactTypes(turns);
		expect(types).toContain("contract_form");
		const contractIdx = types.lastIndexOf("signature_handoff");
		const leadIdx = types.lastIndexOf("lead_form");
		if (leadIdx >= 0) {
			expect(
				contractIdx,
				"assinatura deve ser o fechamento, depois de qualquer lead_form",
			).toBeGreaterThan(leadIdx);
		}
	});

	// ── LLM-AS-JUDGE — a EXPERIÊNCIA do docx, não só as tools certas ──────────
	// Camada 3 de verdade: o juiz (Sonnet, rubric por passo do docx) avalia o
	// transcript COMPLETO e FIEL (diálogo + perguntas de gate + conteúdo dos
	// cards). Thresholds endurecidos (Fase D) são gates de qualidade nightly.

	describe("LLM-as-judge — fidelidade à jornada canônica (rubric do docx)", () => {
		let judged: JornadaJudgeResult | null = null;

		beforeAll(async () => {
			const transcript = turns
				.map((t) => {
					const user = t.userLine ? `USUÁRIO: ${t.userLine}\n` : "";
					const artifactsTxt = t.artifacts.map((a) => describeArtifact(a)).join("\n");
					return `${user}AGENTE: ${t.content || "(sem texto)"}${artifactsTxt ? `\n${artifactsTxt}` : ""}`;
				})
				.join("\n\n");
			const { result } = await judgeJornada({ transcript });
			judged = result;
			console.log(`[jornada judge] fluxoScore=${fluxoScore(result).toFixed(2)}`);
			console.log(`[jornada judge] issues: ${result.topIssues.join(" | ") || "(nenhum)"}`);
		}, 120_000);

		it("fluxo: os 5 passos do docx aconteceram com fidelidade (fluxoScore >= 0.85)", () => {
			expect(judged).not.toBeNull();
			expect(fluxoScore(judged as JornadaJudgeResult)).toBeGreaterThanOrEqual(0.85);
			expect((judged as JornadaJudgeResult).flags.pulouPasso).toBe(false);
		});

		it("piso por passo: nenhum passo do docx abaixo de 0.6 de fidelidade", () => {
			const j = judged as JornadaJudgeResult;
			for (const [passo, s] of Object.entries(j.steps)) {
				expect(s.fidelidade, `fidelidade do ${passo} abaixo do piso`).toBeGreaterThanOrEqual(0.6);
				expect(s.presente, `${passo} ausente do transcript`).toBe(true);
			}
		});

		it("passo 2: educação pra leigo + lance embutido com a didática do docx", () => {
			const j = judged as JornadaJudgeResult;
			expect(j.steps.passo2.fidelidade).toBeGreaterThanOrEqual(0.75);
			expect(j.educacaoLanceEmbutido).toBeGreaterThanOrEqual(0.75);
			expect(j.flags.jargaoNoLeigo).toBe(false);
		});

		it("tom: caloroso e didático como a escritora do docx (não robótico)", () => {
			const j = judged as JornadaJudgeResult;
			expect(j.tom.score).toBeGreaterThanOrEqual(0.75);
			expect(j.flags.tomRoboticoOuFrio).toBe(false);
			expect(j.flags.metaNarrativaDoMecanismo).toBe(false);
		});

		it("fechamento: contrato completo com os reforços do docx", () => {
			const j = judged as JornadaJudgeResult;
			expect(j.fechamentoContratacao).toBeGreaterThanOrEqual(0.75);
			expect(j.flags.fechouEmLeadEmVezDeContrato).toBe(false);
		});

		it("viabilidade honesta: consórcio não vira promessa de crédito imediato (FIX-26)", () => {
			// Critério da jornada canônica que regex não pega: o agente NUNCA pode
			// tratar consórcio como crédito/dinheiro imediato (é contemplação por
			// sorteio/lance) e tem que ser honesto sobre o que o orçamento alcança
			// (tema FIX-18). Na jornada canônica (orçamento viável, números reais da
			// Bevi), o juiz deve aprovar com folga.
			const j = judged as JornadaJudgeResult;
			expect(
				j.flags.prometeuCreditoImediato,
				"o agente NÃO pode prometer crédito imediato — consórcio é contemplação, não empréstimo",
			).toBe(false);
			// Piso de 0.6 (mesmo piso por-passo): catch é dishonestidade GROSSA
			// (prometer crédito que a parcela não banca). Gaps menores (ex.: valor da
			// carta confirmada subiu sem explicação) o juiz reporta em topIssues sem
			// reprovar o gate. O hard é prometeuCreditoImediato=false acima.
			expect(
				j.confrontoViabilidade,
				"a jornada canônica mostra números reais e atingíveis — sem promessa que a parcela não banca",
			).toBeGreaterThanOrEqual(0.6);
		});
	});
});
