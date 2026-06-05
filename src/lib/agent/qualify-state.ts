import type { ConversationMetadata } from "./personas";

export type Gate =
	| "experience"
	| "doubts-wait"
	| "consent"
	| "credit"
	| "timeframe"
	| "lance"
	| "lance-value"
	| "lance-embutido"
	| "identify"
	| "search"
	| "simulator-offer"
	| "decision";

export type UserIntent =
	| "ready_to_proceed"
	| "asking_question"
	| "providing_info"
	| "expressing_doubt"
	| "off_topic"
	| "neutral";

export function nextGate(meta: ConversationMetadata, opts?: { hasContactName?: boolean }): Gate {
	// PF-08: pausa todos os gates até captura conversacional de nome.
	// Sem isso, o gate de experience dispara junto com a pergunta de nome
	// e usuário recebe 2 perguntas simultâneas. doubts-wait = no-op visual.
	if (opts && opts.hasContactName === false) return "doubts-wait";
	if (!meta.experiencePrev) return "experience";
	if (meta.experiencePrev === "doubts" && !meta.doubtsAddressed) return "doubts-wait";
	if (meta.pendingFollowUp) return "doubts-wait";
	if (!meta.qualifyConsented) {
		// Consent is offered exactly once. After that, user must click the buttons
		// or volunteer qualify data (which auto-sets qualifyConsented). Re-firing
		// after every free-text answer felt like spam.
		if (meta.consentOffered) return "doubts-wait";
		return "consent";
	}

	const q = meta.qualifyAnswers ?? {};
	if (q.creditMax === undefined) return "credit";
	if (q.prazoMeses === undefined) return "timeframe";
	if (!q.hasLance) return "lance";
	// Jornada do doc (passo 2, linha 21-22): quem TEM reserva responde "Qual
	// valor aproximado?" — o valor do lance vem do USUÁRIO, nunca derivado
	// silenciosamente (auditoria 2026-06-04: derivação de 30% era MISSING do docx).
	if (q.hasLance === "yes" && q.lanceValue === undefined) return "lance-value";
	// Jornada do doc: TODO MUNDO passa pelo gate de lance embutido (educa +
	// opt-in) antes da busca — no docx a educação é sub-bullet PARALELO ao
	// "Se sim", e o próprio texto diz que o lance embutido "ajuda quem não
	// possui todo o valor do lance hoje" (= quem respondeu Não/Talvez).
	// FIX-4 (teste manual Kairo 2026-06-05): a versão anterior pulava
	// "maybe"/"no" — o ramo educativo "sumia" e parecia intermitência.
	if (q.lanceEmbutido === undefined) return "lance-embutido";

	// Gate "identify" (D1, docs/jornada/CONTEXT.md): a Bevi exige CPF+celular+LGPD
	// ANTES de simular — não existe descoberta anônima com dado real. Coleta ao
	// fim do passo 2, no gancho do docx ("Com essas informações, a Aja Agora vai
	// analisar várias administradoras…"). Sem identidade, a busca NÃO libera.
	if (!meta.identityCollected) return "identify";

	// Funil pós-qualificação (jornada.docx): search (passo 3+4 reveal) →
	// decision (fim do passo 4: "Esse plano faz sentido?"). searchDispatched e
	// decisionDispatched são guards de idempotência — o orquestrador dirige cada
	// etapa via directive (mirror do search reveal). Sem o passo "decision", o
	// agent re-disparava o reveal em loop e nunca cruzava pro passo 5
	// (BUG-REVEAL-LOOP, 2026-06-02).
	if (!meta.searchDispatched) return "search";
	// docx passo 4 (linha 34-36): após apresentar o plano, OFERECER o simulador
	// ("contemplado em 3, 6 ou 12 meses — que tal?") ANTES do card de decisão.
	// Conceito do Bernardo (simulador-agulha) no caminho padrão da jornada.
	if (meta.revealCompleted && !meta.simulatorOfferDispatched) return "simulator-offer";
	if (meta.revealCompleted && !meta.decisionDispatched) return "decision";
	return "search"; // terminal — com searchDispatched=true o orquestrador encerra cedo
}

/**
 * Decides whether to dispatch the next qualify gate (button) at the end of a turn.
 * The state machine still tracks WHICH gate is next; this function only decides
 * if NOW is the right moment to interrupt the conversation with structured UI.
 *
 * Rule of thumb: only fire when the user is collaborating or first contact.
 * Stay silent when they're asking, doubting, or off-topic — let the agent reply
 * conversationally and re-engage on a later turn.
 */
export function decideShowGate(args: {
	gate: Gate;
	intent: UserIntent;
	meta: ConversationMetadata;
	isUserTurn: boolean;
}): boolean {
	const { gate, intent, meta, isUserTurn } = args;
	if (gate === "doubts-wait") return false;
	// Server-authored turns (button click, transition) are always followed by a gate
	// — that's the whole point of the directive flow.
	if (!isUserTurn) return true;

	// "decision" — fim do passo 4 (card "Esse plano faz sentido?"). Pós-reveal,
	// dispara em sinal de avanço do usuário (ready_to_proceed: "bora", "vamos")
	// OU afirmativo neutro de acolhimento (neutral: "ta otimo", "show", "legal").
	// NÃO dispara em what-if (providing_info → re-simular), pergunta, dúvida nem
	// off-topic. Idempotência garantida por decisionDispatched no orquestrador.
	if (gate === "decision") {
		return intent === "ready_to_proceed" || intent === "neutral";
	}

	// "simulator-offer" — oferta do simulador na sequência do reveal (docx).
	// Server-authored já retornou true acima; em turno do usuário, mesmo
	// critério do decision: afirmativo avança, pergunta/dúvida deixa conversar.
	if (gate === "simulator-offer") {
		return intent === "ready_to_proceed" || intent === "neutral";
	}

	// "search" dispara busca + cards — a acao mais invasiva do sistema.
	// Exige sinal EXPLICITO do usuario. Nunca dispara em neutral/asking/doubt/off-topic.
	if (gate === "search") {
		return intent === "ready_to_proceed" || intent === "providing_info";
	}

	if (intent === "asking_question") return false;
	if (intent === "expressing_doubt") return false;
	if (intent === "off_topic") return false;

	if (intent === "ready_to_proceed") return true;
	if (intent === "providing_info") return true;

	// Neutral: only fire if this is effectively the first contact
	// (no qualify data yet) — invites the user into the funnel.
	// Otherwise stay quiet and let the conversation breathe.
	const hasNoQualifyData =
		!meta.experiencePrev &&
		!meta.qualifyAnswers?.creditMax &&
		!meta.qualifyAnswers?.prazoMeses &&
		!meta.qualifyAnswers?.hasLance;
	return hasNoQualifyData;
}
