import { recordStageReached } from "@/lib/admin/lead-stage-tracker";
import {
	isConversationPausedOrTerminal,
	isMandatoryCollectionGate,
	reengageQuestionForGate,
} from "@/lib/agent/gate-reengage";
import { runTurn, type TurnEvent } from "@/lib/agent/orchestrator";
import { buildSearchSummaryDirective } from "@/lib/agent/orchestrator/directives";
import { gateQuestion } from "@/lib/agent/orchestrator/gate-questions";
import { planTransition } from "@/lib/agent/orchestrator/transition";
import type { Category, ConversationMetadata, Persona } from "@/lib/agent/personas";
import { type Gate, nextGate } from "@/lib/agent/qualify-state";
import { EMPTY_TURN_FALLBACK } from "@/lib/chat/empty-turn-guard";
import { persistMeta, reloadMeta } from "@/lib/conversation/meta";
import { traceTurnEvents } from "@/lib/telemetry/turn-trace";
import { sendInteractiveMessage, sendTextMessage } from "./api";
import {
	artifactToWhatsApp,
	experienceQuestionToWhatsApp,
	formatTextForWhatsApp,
	handoffConfirmationToWhatsApp,
	lanceEmbutidoQuestionToWhatsApp,
	lanceQuestionToWhatsApp,
	lanceValueQuestionToWhatsApp,
	simulatorOfferToWhatsApp,
	splitMessage,
	timeframeQuestionToWhatsApp,
	welcomeButtonsToWhatsApp,
} from "./formatter";
import { claimContextBeat } from "./once";
import { getOrCreateConversation } from "./session";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const typingDelay = (chars: number) => Math.min(1500, 200 + chars * 6);

/** A borda mais cara do produto era a mais cega: falha de envio pra Meta era
 * engolida e o turno ainda se marcava como "falei". Aqui o resultado é OLHADO —
 * `false` significa que o cliente NÃO recebeu, e quem chama não pode contar esse
 * envio como entrega (o guard de turno mudo volta a cobrir o caso). Timeout não
 * é re-tentado: a mensagem pode ter saído, e um segundo envio duplicaria o balão
 * na conversa do cliente. */
async function sendText(to: string, text: string): Promise<boolean> {
	const res = await sendTextMessage(to, text).catch((err) => ({ error: String(err) }));
	const error = (res as { error?: string } | undefined)?.error;
	if (!error) return true;
	if (/timeout/i.test(error)) {
		console.error(`[whatsapp-send-failed] texto NÃO entregue (timeout, sem retry): ${error}`);
		return false;
	}
	console.warn(`[whatsapp-send-failed] texto falhou, tentando 1× de novo: ${error}`);
	const retry = await sendTextMessage(to, text).catch((err) => ({ error: String(err) }));
	const retryError = (retry as { error?: string } | undefined)?.error;
	if (retryError) {
		console.error(`[whatsapp-send-failed] texto NÃO entregue após retry: ${retryError}`);
		return false;
	}
	return true;
}

/** Espelho de `sendText` pros cards/botões. */
async function sendInteractive(to: string, interactive: Record<string, unknown>): Promise<boolean> {
	const res = await sendInteractiveMessage(to, interactive).catch((err) => ({
		error: String(err),
	}));
	const error = (res as { error?: string } | undefined)?.error;
	if (!error) return true;
	if (/timeout/i.test(error)) {
		console.error(`[whatsapp-send-failed] card NÃO entregue (timeout, sem retry): ${error}`);
		return false;
	}
	console.warn(`[whatsapp-send-failed] card falhou, tentando 1× de novo: ${error}`);
	const retry = await sendInteractiveMessage(to, interactive).catch((err) => ({
		error: String(err),
	}));
	const retryError = (retry as { error?: string } | undefined)?.error;
	if (retryError) {
		console.error(`[whatsapp-send-failed] card NÃO entregue após retry: ${retryError}`);
		return false;
	}
	return true;
}

const ARTIFACT_PAUSE_MS = 500;
const POST_INTERACTIVE_PAUSE_MS = 1800;
const TRANSITION_PAUSE_MS = 1200;

type PendingArtifact = { type: string; payload: Record<string, unknown> };

/** Troca o corpo do interactive por um rótulo neutro — usado quando o MODELO já
 * fez a pergunta em texto e o botão não deve repeti-la. Preserva a estrutura
 * (action/botões); mexe só no `body.text`. */
function withNeutralBody(interactive: Record<string, unknown>): Record<string, unknown> {
	const body = interactive.body as { text?: string } | undefined;
	if (!body || typeof body.text !== "string") return interactive;
	return { ...interactive, body: { ...body, text: "Escolha uma opção:" } };
}

async function gateInteractive(
	gate: Gate,
	conversationId: string,
	prefix: string | undefined,
): Promise<Record<string, unknown> | null> {
	const meta = await reloadMeta(conversationId);
	switch (gate) {
		case "experience":
			return experienceQuestionToWhatsApp(prefix).interactive ?? null;
		case "credit":
			// FIX-120 (paridade FIX-115): o valor do bem virou CONVERSA — o WhatsApp
			// não manda mais a lista de faixas. A pergunta sai como TEXTO (ver
			// gateTextPrompt), espelhando o gate `identify`. A resposta livre é
			// capturada pelo analyzer + backstop parseAssetValue.
			return null;
		case "timeframe": {
			const category = meta.currentCategory;
			if (!category) return null;
			return timeframeQuestionToWhatsApp(category, prefix).interactive ?? null;
		}
		case "lance":
			return lanceQuestionToWhatsApp(prefix).interactive ?? null;
		case "lance-value": {
			// docx passo 2: "Qual valor aproximado?" — faixas relativas ao crédito.
			const creditMax = meta.qualifyAnswers?.creditMax;
			if (!creditMax) return null;
			return lanceValueQuestionToWhatsApp(creditMax, prefix).interactive ?? null;
		}
		case "lance-embutido":
			return lanceEmbutidoQuestionToWhatsApp(prefix).interactive ?? null;
		case "simulator-offer":
			// docx passo 4: oferta do simulador (botões Quero ver! / Agora não).
			return simulatorOfferToWhatsApp(prefix).interactive ?? null;
		case "reco-consent":
		// FIX-297: fora de escopo desta rodada (só coreografia web) — cai no
		// caminho textual (WHATSAPP_TEXT_GATES abaixo), sem card interativo.
		case "name":
		case "desire":
		case "identify":
		case "doubts-wait":
		case "search":
		case "decision":
			// FIX-17: "name" degrada pra texto no WhatsApp — a pergunta do nome já
			// sai no texto do directive de primeiro contato; o card não existe aqui.
			// "identify" não tem interactive — é coleta textual de CPF (fireGate
			// manda o prompt como texto; captura em identify-capture.ts).
			// FIX-233: "desire" é não bloqueante e sem card — conversa livre.
			return null;
	}
}

// FIX-120 (paridade FIX-115): gates CONVERSACIONAIS (o valor do bem, `credit`)
// saem como TEXTO no WhatsApp — não como componente de seleção — espelhando o
// tratamento textual do `identify`. Retorna a pergunta (com prefix embutido) ou
// null pros gates que não são textuais. A resposta livre do usuário é capturada
// pelo pipeline conversacional (analyzer + backstop parseAssetValue, FIX-115).
// Gates que saem como TEXTO no WhatsApp (nenhum tem componente interativo):
// `credit` (valor do bem, FIX-120) E `identify` (CPF+celular, FIX-53). BUG DE PROD
// (2026-07-02): o identify NÃO estava aqui — ao clicar "Bora!" (consent) o funil ia
// pro gate identify, o gate disparava mas NADA era enviado no WhatsApp (gateInteractive
// e gateTextPrompt = null), fechando o turno MUDO: por clique = silêncio, por texto
// ("continua") = "me perdi". Agora o identify entrega a pergunta do CPF como texto.
// FIX-297: "reco-consent" entra aqui pra não ficar mudo no WhatsApp (nenhum
// card interativo neste MVP — a recoreografia do reveal focou no canal web)
// — a pergunta sai como texto e a resposta livre resolve via detectYesNoText
// (orchestrator/index.ts), mesmo mecanismo do lance-embutido/simulator-offer.
// `desire` entrou em 2026-07-14 — BUG DE PARIDADE achado no QA ao vivo: ele não
// tem interactive e não estava aqui, então a pergunta ("Qual moto você tem em
// mente?") simplesmente NÃO era entregue no WhatsApp. O agente respondia "Prazer,
// Mario." e parava — turno morto, usuário sem saber o que dizer — enquanto o
// directive de primeiro contato ainda promete que "o sistema pergunta o próximo
// passo em seguida". Na web a pergunta saía normal. Travado em `paridade-gates.test.ts`.
export const WHATSAPP_TEXT_GATES = new Set<Gate>(["desire", "credit", "identify", "reco-consent"]);

// FIX-349 (P1.2, veredito rodada 4): subconjunto de `WHATSAPP_TEXT_GATES` SEM
// NENHUM fallback estrutural (nem interactive, nem card) — a heurística
// `modelAsked` (baseada em "o modelo terminou o turno com ALGUMA pergunta",
// nunca checada contra o gate corrente) nunca pode apagar a entrega desses
// gates: sem fallback, apagar o texto apaga o gate inteiro. `identify` tem o
// beat de contexto fixo (gateContextBeat) como rede de segurança parcial — só
// na PRIMEIRA vez, já que desde 2026-07-20 o beat sai uma vez por conversa;
// depois disso a entrega é a fala do modelo, que agora nunca é apagada;
// `credit`/`desire` não são bloqueantes da mesma forma que `reco-consent`
// (que trava a cascata inteira até responder — qualify-state.ts). Escopo
// deliberadamente restrito ao gate com bug PROVADO (achado ao vivo,
// `servicos-whatsapp`) — ver `consumeEvents` (case "gate").
// VAZIO desde 2026-07-21. A exceção existia porque `modelAsked` era uma
// heurística fraca ("o modelo terminou com ALGUMA pergunta"). Agora ele é o
// sinal REAL do sanitizer (`hasHeldQuestion`), então manter `reco-consent` aqui
// só produzia o balão duplicado visto ao vivo: o modelo perguntava "Curtiu a
// ideia?" e o canal colava "Posso te mostrar a opção que eu recomendo?" logo
// abaixo. Gate não respondido volta no turno seguinte — perder um texto é
// recuperável; empilhar duas perguntas no mesmo balão, não.
export const WHATSAPP_GATES_WITHOUT_FALLBACK = new Set<Gate>([]);

/** Gates entregues no WhatsApp como BOTÃO/lista (espelha os `case` de
 * `gateInteractive` que devolvem payload). Existe pra que o teste de paridade
 * consiga enxergar a cobertura real do canal. */
export const WHATSAPP_INTERACTIVE_GATES = new Set<Gate>([
	"experience",
	"timeframe",
	"lance",
	"lance-value",
	"lance-embutido",
	"simulator-offer",
]);
async function gateTextPrompt(
	gate: Gate,
	conversationId: string,
	prefix: string | undefined,
): Promise<string | null> {
	if (!WHATSAPP_TEXT_GATES.has(gate)) return null;
	const meta = await reloadMeta(conversationId);
	// `credit` usa a categoria no texto; `identify` é fixo — gateQuestion aceita null.
	// Os dois últimos argumentos (FIX-296 `desiredItem`, FIX-312 `attempt`) faltavam
	// AQUI e só o canal web os passava: sem `desiredItem` o gate `credit` caía na
	// pergunta genérica ("Qual valor do bem faz mais sentido pra você?") em vez de
	// "E quanto custa esse Corolla hoje?", e sem `attempt` a 2ª cobrança repetia a
	// frase byte a byte. O canal que mais precisa soar humano era o mais robô.
	const question = gateQuestion(
		gate,
		meta.currentCategory ?? null,
		meta.recommendedOffer?.creditValue,
		"whatsapp",
		meta.qualifyAnswers?.creditMentionedAtDesire,
		meta.qualifyAnswers?.desiredItem,
		(meta.gateAttempts?.[gate] ?? 0) + 1,
	);
	if (!question) return null;
	return prefix ? `${prefix}\n\n${question}` : question;
}

// FIX-210 — beat de CONTEXTO fixo da cadência 2-tempos. Gates que carregam uma
// justificativa determinística (identify: gancho docx + LGPD) entregam esse beat
// como balão próprio ANTES do pedido, em vez de deixar o gancho a cargo do LLM.
// null = o contexto vem do texto do LLM (buffer). O lance-embutido entra aqui no
// FIX-212 (educação curta antes do card).
async function gateContextBeat(gate: Gate, conversationId: string): Promise<string | null> {
	if (gate === "identify") {
		const { IDENTIFY_CONTEXT_WHATSAPP } = await import("./identify-capture");
		return IDENTIFY_CONTEXT_WHATSAPP;
	}
	// O `lance-embutido` NÃO tem mais beat fixo. O texto que existia aqui
	// (`lanceEmbutidoEdu`) ensinava o conselho ERRADO — "na sua carta de
	// R$ 261.973, você usa uma fatia desse valor" —, que é o oposto da regra que
	// vale: o embutido sai da carta, então quem vai usá-lo precisa de uma carta
	// MAIOR, não de uma fatia da que já escolheu. Pior: como era copy do servidor,
	// ela ocupava o lugar da fala e o modelo nunca chegava a explicar direito no
	// WhatsApp — com todo o contexto certo (`blocoEmbutido`, converse.ts) parado.
	// Educação é conversa, e conversa é do modelo (CLAUDE.md).
	return null;
}

async function consumeEvents(
	from: string,
	conversationId: string,
	events: AsyncIterable<TurnEvent>,
	opts?: { guardEmptyTurn?: boolean },
): Promise<void> {
	// FIX-21: este é o funil único de consumo de TurnEvents do canal WhatsApp
	// (todos os run*WithOrchestrator passam por aqui). Tap passthrough fecha 1
	// trace/turno SEM tocar runner.ts (bloco G). Persona no início do turno é
	// best-effort — telemetria nunca derruba o turno.
	const personaAtStart = await reloadMeta(conversationId)
		.then((m) => m.currentPersona ?? null)
		.catch(() => null);
	const tracedEvents = traceTurnEvents(events, {
		conversationId,
		channel: "whatsapp",
		persona: personaAtStart,
	});

	let textBuffer = "";
	let pendingArtifacts: PendingArtifact[] = [];
	let dropped = false;
	let hasSent = false;
	let lastWasInteractive = false;
	let avisouDaBusca = false;
	// FIX-211: um gate FOI entregue neste turno? Se sim, o usuário acabou de ver o
	// pedido — não conta como "desvio" (não re-cobra ao fim do turno).
	let gateFiredThisTurn = false;

	const pauseBeforeNext = () =>
		sleep(lastWasInteractive ? POST_INTERACTIVE_PAUSE_MS : ARTIFACT_PAUSE_MS);

	const flushText = async () => {
		if (!textBuffer) return;
		const formatted = formatTextForWhatsApp(textBuffer);
		textBuffer = "";
		if (!formatted) return;
		// Fragmento não é mensagem. Saíram balões com "..", ")" e sobras do
		// sanitizer — cada um vibrando o celular do cliente. Um balão precisa ter
		// pelo menos uma palavra; o resto é resíduo de corte de stream.
		const chunks = splitMessage(formatted).filter((c) => /\p{L}{2,}/u.test(c));
		for (const chunk of chunks) {
			if (hasSent) {
				const wait = lastWasInteractive ? POST_INTERACTIVE_PAUSE_MS : typingDelay(chunk.length);
				await sleep(wait);
			}
			const ok = await sendText(from, chunk);
			lastWasInteractive = false;
			hasSent = hasSent || ok;
		}
	};

	const flushArtifacts = async () => {
		if (pendingArtifacts.length === 0) return;
		const artifacts = pendingArtifacts;
		pendingArtifacts = [];
		for (const artifact of artifacts) {
			// FIX-109: o valor do bem virou CONVERSA — o agente (bloco-jornada-entrada)
			// parou de emitir value_picker. Se ainda chegar um, NÃO renderizamos a
			// lista de faixas: o formatter degrada pra um pedido conversacional. O warn
			// flagra em produção se a emissão não tiver sido removida no agente.
			// TODO(bloco-jornada-entrada): confirmar a parada de emissão do value_picker.
			if (artifact.type === "value_picker") {
				console.warn(
					"[whatsapp/adapter] value_picker chegou no WhatsApp — valor agora é conversa (FIX-109); degradando pra pedido conversacional",
				);
			}
			// FIX-25: passo 5 no WhatsApp — ao renderizar o contract_form, abre a
			// máquina de estado do fechamento (confirm/cpf). O turno seguinte do
			// usuário cai em captureContractText (processor) e os botões em
			// interactive-handlers; o disparo do startContract é o aceite.
			let payloadDoArtifact = artifact.payload;
			if (artifact.type === "contract_form") {
				// A identidade JÁ foi coletada lá no começo — o fechamento não pode
				// pedir CPF de novo. O enriquecimento só existia no runtime Vercel
				// (`runner.ts`), então no LangGraph o card chegava sem
				// `identityOnFile` e o WhatsApp caía no ramo "não tenho seus dados":
				// o cliente mandava o CPF, avançava a jornada inteira e no fecho o
				// agente pedia o mesmo CPF outra vez. Enriquecer aqui, na hora de
				// desenhar, cobre qualquer origem do card.
				const [{ enrichContractFormPayload }, { loadIdentity }] = await Promise.all([
					import("@/lib/agent/orchestrator/contract-form-prefill"),
					import("@/lib/conversation/identity"),
				]);
				const identity = await loadIdentity(conversationId).catch(() => null);
				payloadDoArtifact = enrichContractFormPayload(
					artifact.payload as Record<string, unknown>,
					identity,
				);
				const { beginContractCollection } = await import("./contract-capture");
				await beginContractCollection(conversationId, payloadDoArtifact).catch(() => {});
			}
			const wa = artifactToWhatsApp(artifact.type, payloadDoArtifact);
			if (!wa) {
				// Visibilidade: artifact sem mapper cai em silêncio. Se um tipo
				// novo for adicionado a PRESENTATION_TOOLS sem mapping WA, o
				// warning aparece no log do canal. (artifact-coverage.test.ts
				// é o gate principal, mas o warning ajuda em produção.)
				console.warn(`[whatsapp/adapter] artifact dropado sem mapping: type=${artifact.type}`);
				continue;
			}
			if (hasSent) await pauseBeforeNext();
			let ok = false;
			if (wa.type === "text" && wa.text) {
				ok = await sendText(from, wa.text);
				lastWasInteractive = false;
			} else if (wa.type === "interactive" && wa.interactive) {
				ok = await sendInteractive(from, wa.interactive);
				lastWasInteractive = true;
			}
			hasSent = hasSent || ok;
		}
	};

	for await (const ev of tracedEvents) {
		if (dropped) continue;

		switch (ev.type) {
			case "text-delta":
				textBuffer += ev.text;
				break;
			case "artifact":
				pendingArtifacts.push({ type: ev.artifactType, payload: ev.payload });
				break;
			case "lead-stage":
				await recordStageReached(conversationId, ev.stage as "engajado" | "qualificado");
				break;
			case "tool-call":
				// No WhatsApp não existe chip de progresso: se a busca na
				// administradora demora, o cliente manda o CPF e fica olhando pra
				// tela sem nenhum sinal de vida — e some. Uma linha do SISTEMA
				// (determinística, sem promessa e sem número) faz o papel do
				// indicador que a web desenha. Só na busca; nas outras tools o turno
				// responde rápido e uma linha dessas viraria ruído.
				if (
					!avisouDaBusca &&
					(ev.toolName === "recommend_groups" || ev.toolName === "search_groups")
				) {
					// UMA vez por turno. A descoberta pode rodar em duas tentativas (faixa
					// alvo + vizinha) e o cliente recebia "Consultando as administradoras
					// agora — só um instante." duplicado, colado.
					avisouDaBusca = true;
					await flushText();
					const ok = await sendText(from, "Consultando as administradoras agora — só um instante.");
					hasSent = hasSent || ok;
					lastWasInteractive = false;
				}
				break;
			case "meta-update":
			case "suppression":
			case "usage":
				// FIX-24: telemetria interna — o tap `traceTurnEvents` já consumiu
				// o evento; nada a enviar no WhatsApp.
				break;

			case "text-boundary":
				// FIX-268: mesmo boundary do canal web (adapter web/adapter.ts) —
				// força o envio do que já foi bufferizado como mensagem própria,
				// pra 2 directives seguidos (ex.: scarcity → decision) não colarem
				// no mesmo balão quando não há artifact/gate entre eles.
				await flushText();
				break;
			case "transition": {
				await flushText();
				await flushArtifacts();
				if (hasSent) await pauseBeforeNext();
				const ok = await sendText(from, ev.bridgeText);
				lastWasInteractive = false;
				hasSent = hasSent || ok;
				await sleep(TRANSITION_PAUSE_MS);
				break;
			}
			case "lead-collection-prompt": {
				await flushText();
				await flushArtifacts();
				if (hasSent) await pauseBeforeNext();
				const ok = await sendText(from, ev.text);
				lastWasInteractive = false;
				hasSent = hasSent || ok;
				break;
			}
			case "handoff": {
				textBuffer = "";
				pendingArtifacts = [];
				dropped = true;
				if (hasSent) await pauseBeforeNext();
				const r = handoffConfirmationToWhatsApp();
				if (r.interactive) {
					const ok = await sendInteractive(from, r.interactive);
					lastWasInteractive = true;
					hasSent = hasSent || ok;
				}
				break;
			}
			case "welcome-categories": {
				await flushText();
				await flushArtifacts();
				if (hasSent) await pauseBeforeNext();
				const w = welcomeButtonsToWhatsApp();
				if (w.interactive) {
					const ok = await sendInteractive(from, w.interactive);
					lastWasInteractive = true;
					hasSent = hasSent || ok;
				}
				break;
			}
			case "gate": {
				// FIX-210 — cadência 2-tempos: contexto num balão, pedido em outro. Antes,
				// quando o gate carregava prefix, o adapter DESCARTAVA o texto ou o COLAVA
				// na pergunta → uma bolha só (o atrito que o Kairo viu no consent→identify).
				// É decisão de RENDER do WhatsApp (channel-aware C5) — não toca a web.
				//
				// Gates com CONTEXTO fixo (gateContextBeat: identify tem gancho docx + LGPD,
				// lance-embutido tem a educação): o beat de contexto é determinístico.
				//
				// 2026-07-20 — a FALA DO MODELO NUNCA É APAGADA. Até aqui este ramo fazia
				// `textBuffer = ""` e mandava o beat fixo no lugar: o cliente perguntava
				// "por que você precisa do meu CPF?", o modelo escrevia a explicação, e o
				// canal JOGAVA FORA a explicação pra colar os mesmos dois balões enlatados
				// — byte a byte iguais toda vez que o gate reaparecia. É o agente bitolado
				// que o CLAUDE.md proíbe, ressuscitado na camada de canal.
				//
				// O invariante REAL é de ESTADO, não de fala: o cliente precisa ter visto o
				// aviso (LGPD no identify; a educação do embutido) antes do pedido — UMA
				// vez. Isso virou `claimContextBeat` (idempotência determinística por
				// conversa+gate, src/lib/whatsapp/once.ts). A partir daí quem conduz é o
				// modelo, com as palavras dele. A não-duplicação do PEDIDO continua no
				// `ev.modelAsked` mais abaixo, como já era.
				const contextBeat = await gateContextBeat(ev.gate, conversationId);
				await flushText();
				await flushArtifacts();
				// Se o MODELO já fez o pedido com as palavras dele, o beat fixo vira um
				// segundo balão dizendo a mesma coisa — foi o que apareceu ao vivo:
				// "preciso confirmar seu CPF e celular — pode ser?" seguido de "preciso
				// confirmar quem é você". O aviso (LGPD) entra na fala do modelo pelo
				// contexto do gate; o beat fica como rede pra quando ele não pedir.
				if (!ev.modelAsked && contextBeat && (await claimContextBeat(conversationId, ev.gate))) {
					if (hasSent) await pauseBeforeNext();
					const ok = await sendText(from, contextBeat);
					lastWasInteractive = false;
					hasSent = hasSent || ok;
				}
				const interactive = await gateInteractive(ev.gate, conversationId, undefined);
				if (interactive) {
					if (hasSent) await pauseBeforeNext();
					// DESAMARRA (2026-07-13): o modelo já fez a pergunta com as palavras
					// dele (`ev.modelAsked`) — o corpo do botão não repete a canônica,
					// vira só o rótulo do input. Sem isso o usuário lia a pergunta duas
					// vezes (a humana e a enlatada) no mesmo balão.
					const ok = await sendInteractive(
						from,
						ev.modelAsked ? withNeutralBody(interactive) : interactive,
					);
					lastWasInteractive = true;
					hasSent = hasSent || ok;
					console.log(`[gate-delivery] conv=${conversationId} gate=${ev.gate} via=interactive`);
				} else {
					// FIX-120: gates conversacionais (credit/identify) saem como TEXTO — a
					// pergunta viajava no body da lista; sem a lista, mandamos em texto.
					// DESAMARRA: se o modelo já perguntou, não repetimos a canônica.
					//
					// FIX-349 (P1.2, veredito rodada 4): `ev.modelAsked` vem de uma
					// heurística CEGA (`EphemeralTextFilter.hasHeldQuestion()` — "a ÚLTIMA
					// sentença do modelo terminou em ALGUMA pergunta", sem checar se ela
					// tem qualquer relação com o gate corrente). Pra gates com interactive
					// (acima), um falso positivo é inofensivo — o card ainda aparece com
					// corpo neutro. Mas um gate SEM interactive nenhum não tem fallback: se
					// o `modelAsked` apagar o textPrompt aqui, o gate inteiro AFUNDA —
					// nem card, nem texto (achado ao vivo: `reco-consent` nunca apareceu na
					// conversa inteira em `servicos-whatsapp`, rodada 4, porque o modelo
					// fechou o turno anterior com uma pergunta genérica — "Bora ver essas
					// opções?" — sem relação nenhuma com o consentimento). Gates nesta lista
					// nunca deixam o `modelAsked` apagar a única entrega possível.
					const textPrompt = WHATSAPP_GATES_WITHOUT_FALLBACK.has(ev.gate)
						? await gateTextPrompt(ev.gate, conversationId, undefined)
						: ev.modelAsked
							? null
							: await gateTextPrompt(ev.gate, conversationId, undefined);
					if (textPrompt) {
						if (hasSent) await pauseBeforeNext();
						const ok = await sendText(from, textPrompt);
						lastWasInteractive = false;
						hasSent = hasSent || ok;
						console.log(`[gate-delivery] conv=${conversationId} gate=${ev.gate} via=text`);
					} else {
						// Nenhuma entrega pro gate no WhatsApp → o turno pode fechar MUDO.
						// Alerta ALTO pra caçar buracos de entrega de gate (o do identify,
						// 2026-07-02). Se você vê isto, um gate disparou sem forma de enviar.
						console.error(
							`[gate-undelivered] conv=${conversationId} gate=${ev.gate} — SEM entrega no WhatsApp (nem interactive nem texto); turno pode fechar mudo`,
						);
					}
				}
				gateFiredThisTurn = true; // FIX-211: o gate saiu — não é desvio.
				break;
			}
			case "finish":
				await flushText();
				await flushArtifacts();
				break;
		}
	}

	// Cobrança de gate ao FIM do turno de usuário (só user-turn: guardEmptyTurn).
	// `dropped` (handoff) tem seu card silencioso próprio.
	if (opts?.guardEmptyTurn && !dropped) {
		const guardMeta = await reloadMeta(conversationId);
		// `nextGate` sem hasContactName é o padrão do WhatsApp (o nome vem do pushName,
		// não força o gate "name"; ver processor.ts).
		const ng = nextGate(guardMeta);
		const mandatory = isMandatoryCollectionGate(ng);
		const paused = isConversationPausedOrTerminal(guardMeta);

		if (!hasSent) {
			// FIX-172/208 — turno MUDO: nada visível saiu (ex.: loop de save_contact_name
			// até stepCountIs, ou o valor respondido e nada emitido). Re-cobra o gate de
			// coleta pendente (escalado, FIX-211) em vez do "me perdi"; demais gates caem
			// no fallback honesto. Nunca deixa o usuário no silêncio.
			const attempt =
				mandatory && !paused ? await bumpGateAttempt(conversationId, guardMeta, ng) : 1;
			// FIX-245: carta real (pós-reveal) no lugar do exemplo genérico.
			const reengage = reengageQuestionForGate(
				ng,
				guardMeta.currentCategory,
				attempt,
				guardMeta.recommendedOffer?.creditValue,
				guardMeta.qualifyAnswers?.creditMentionedAtDesire,
			);
			console.warn(
				`[empty-turn-guard] conv=${conversationId} DISPAROU (turno fechou mudo) nextGate=${ng} tentativa=${attempt} ação=${reengage ? "re-pergunta-do-gate" : "fallback-honesto(me-perdi)"}`,
			);
			await sendText(from, reengage ?? EMPTY_TURN_FALLBACK);
		} else if (mandatory && !gateFiredThisTurn && !paused) {
			// O usuário DESVIOU: o turno FALOU (o modelo respondeu a dúvida dele) e o
			// gate de coleta segue pendente.
			//
			// 2026-07-20 — este ramo COLAVA uma cobrança enlatada escalonada no fim de
			// um turno que já tinha falado ("Só falta isso pra eu seguir — é rapidinho."
			// / "É seguro e sem compromisso."). O cliente perguntava "consórcio tem
			// juros?", o modelo explicava bem, e logo abaixo chegava um balão de
			// formulário cobrando. A web NUNCA fez isso (lá o fallback só existe pra
			// turno vazio) e a mesma conversa flui natural.
			//
			// Retomar o assunto pendente é do CÉREBRO, não do canal: o `systemContext`
			// já informa o gate pendente como INTENÇÃO (não frase pronta) e o modelo
			// retoma com as palavras dele no próprio turno seguinte; se o cliente sumir,
			// o watchdog de inatividade continua cobrindo. Aqui fica só o rastro.
			console.warn(
				`[gate-collect-desvio] conv=${conversationId} gate=${ng} segue pendente após turno que FALOU — retomada é do modelo (systemContext), sem cobrança enlatada`,
			);
		}
	}
}

/** FIX-211 — incrementa o contador de cobranças do gate e persiste. Retorna o novo
 * valor (1-based). Por-gate no meta (gateAttempts), sem vazar entre gates. */
async function bumpGateAttempt(
	conversationId: string,
	meta: ConversationMetadata,
	gate: Gate,
): Promise<number> {
	const attempt = (meta.gateAttempts?.[gate] ?? 0) + 1;
	await persistMeta(conversationId, {
		...meta,
		gateAttempts: { ...meta.gateAttempts, [gate]: attempt },
	});
	return attempt;
}

export async function processWithOrchestrator(
	from: string,
	text: string,
	contactName?: string,
): Promise<void> {
	const { id: conversationId } = await getOrCreateConversation(from);

	const events = runTurn({
		channel: "whatsapp",
		conversationId,
		userText: text,
		isUserTurn: true,
		contactName,
	});

	// guardEmptyTurn: SÓ no user-turn (paridade com o web) — o agente SEMPRE deve
	// responder algo ao usuário. Directives (runDirective/Transition) podem ser
	// silenciosos por design, então NÃO recebem o guard. FIX-172.
	await consumeEvents(from, conversationId, events, { guardEmptyTurn: true });
}

export async function runDirectiveWithOrchestrator(args: {
	from: string;
	conversationId: string;
	directive: string;
	contactName?: string | null;
	/** FIX-189: liga o guard de turno-mudo do consumeEvents. Directives em geral
	 * podem ser silenciosos por design (não guardam), MAS a descoberta SEMPRE deve
	 * revelar algo — o dispatch de busca passa true pra não pendurar no chip. */
	guardEmptyTurn?: boolean;
}): Promise<void> {
	const { from, conversationId, directive, contactName, guardEmptyTurn } = args;

	const events = runTurn({
		channel: "whatsapp",
		conversationId,
		userText: directive,
		isUserTurn: false,
		contactName: contactName ?? null,
		skipAnalyzer: true,
		skipLeadCollection: true,
	});

	await consumeEvents(from, conversationId, events, { guardEmptyTurn });
}

export async function runTransitionWithOrchestrator(args: {
	from: string;
	conversationId: string;
	fromPersona: Persona;
	toCategory: Category;
	expertiseHint?: string | null;
}): Promise<void> {
	const { from, conversationId, fromPersona, toCategory, expertiseHint } = args;
	const plan = await planTransition({ conversationId, fromPersona, toCategory, expertiseHint });
	if (plan.kind === "abort") {
		await sendText(from, plan.apologyText);
		return;
	}
	await sendText(from, plan.bridgeText);
	await sleep(TRANSITION_PAUSE_MS);
	await runDirectiveWithOrchestrator({ from, conversationId, directive: plan.directive });
}

export async function runSearchSummaryWithOrchestrator(args: {
	from: string;
	conversationId: string;
}): Promise<void> {
	const { from, conversationId } = args;
	const refreshed = await reloadMeta(conversationId);
	if (refreshed.searchDispatched) return;
	// Tripwire D1: busca real exige identidade (a Bevi não simula sem CPF).
	// Sem ela, pede o CPF por texto (celular = o próprio waId) — nunca buscar.
	if (!refreshed.identityCollected) {
		const { IDENTIFY_WHATSAPP_PROMPT } = await import("./identify-capture");
		await sendText(from, IDENTIFY_WHATSAPP_PROMPT);
		return;
	}
	const category = refreshed.currentCategory;
	if (!category) return;
	const directive = buildSearchSummaryDirective({ category, meta: refreshed });
	// FIX-189 (pendura): a descoberta SEMPRE deve revelar algo — se o turno fechar
	// só com o chip (0 texto, 0 artifact), o guardEmptyTurn emite o fallback em vez
	// de deixar o usuário no silêncio até cutucar.
	await runDirectiveWithOrchestrator({ from, conversationId, directive, guardEmptyTurn: true });
	// FIX-339 (porte do FIX-291b, src/lib/web/adapter.ts:562-577): searchDispatched
	// só é marcado DEPOIS de confirmar que a descoberta de fato completou
	// (revealCompleted, setado pelo runner só com artifacts REAIS na tela —
	// runner.ts). Antes, o marcador saía PREEMPTIVO (acima, antes do directive
	// rodar) — uma busca que falhasse/degradasse travava searchDispatched=true
	// PRA SEMPRE, e o "turno morto" pós-CPF (G1, veredito whatsapp rodada 1)
	// nunca liberava retry num turno seguinte.
	const postSearch = await reloadMeta(conversationId);
	if (postSearch.revealCompleted) {
		await persistMeta(conversationId, { ...postSearch, searchDispatched: true });
	} else {
		console.log(
			`[discovery-degraded] guard: busca falhou/degradou — searchDispatched NAO marcado, retry liberado num turno seguinte (conv=${conversationId})`,
		);
	}
}

export async function fireGate(
	from: string,
	conversationId: string,
	gate: Gate,
	meta: ConversationMetadata,
	prefix?: string,
): Promise<void> {
	// "identify" é textual (form não existe no WhatsApp). FIX-210: cadência 2-tempos
	// — contexto (gancho docx + LGPD) num balão, pedido do CPF em outro. O beat de
	// contexto sai UMA vez por conversa (claimContextBeat) — o PEDIDO continua
	// saindo sempre, porque este caminho é server-authored (clique/retomada), sem
	// texto do modelo pra entregar o gate.
	if (gate === "identify") {
		const { IDENTIFY_CONTEXT_WHATSAPP, IDENTIFY_WHATSAPP_PROMPT } = await import(
			"./identify-capture"
		);
		if (await claimContextBeat(conversationId, gate)) {
			await sendText(from, IDENTIFY_CONTEXT_WHATSAPP);
		}
		await sendText(from, IDENTIFY_WHATSAPP_PROMPT);
		return;
	}
	// FIX-212 (split 2 tempos): gates com contexto fixo (lance-embutido: educação)
	// emitem o beat de contexto ANTES do card, também no caminho de clique/fireGate.
	const contextBeat = await gateContextBeat(gate, conversationId);
	if (contextBeat && (await claimContextBeat(conversationId, gate))) {
		await sendText(from, contextBeat);
	}
	// FIX-120: gates conversacionais (credit) saem como TEXTO, espelhando o identify.
	const textPrompt = await gateTextPrompt(gate, conversationId, prefix);
	if (textPrompt) {
		await sendText(from, textPrompt);
		return;
	}
	const interactive = await gateInteractive(gate, conversationId, prefix);
	if (interactive) await sendInteractive(from, interactive);
}
