import type { Category, ConversationMetadata, QualifyAnswers } from "@/lib/agent/personas";
import { type Gate, nextGate } from "@/lib/agent/qualify-state";
import { scoresDeReconciliacao } from "@/lib/observability/reconciliacao-fala-estado";

export type LeadStage =
	| "novo"
	| "engajado"
	| "qualificado"
	| "em_negociacao"
	| "proposta_enviada"
	| "na_administradora"
	| "em_atendimento"
	| "aguardando_pagamento"
	| "fechado_ganho"
	| "perdido";

export type SignalsMessage = {
	id: string;
	role: "user" | "assistant" | "system";
	content: string;
	createdAt: Date;
	personaId?: string | null;
};

export type SignalsArtifact = {
	messageId: string;
	type: string;
	payload: Record<string, unknown>;
};

export type SignalsLead = {
	stage: LeadStage;
	name: string | null;
	phone: string | null;
	email: string | null;
} | null;

export type PersonaSegment = {
	personaId: string;
	startMessageId: string;
	endMessageId: string;
	turnCount: number;
};

export type DeterministicSignals = {
	replyRate: number;
	qualifyCoverage: number;
	qualifyMissing: string[];
	numbersInTextFlagged: Array<{ messageId: string; number: string; context: string }>;
	dropOffGate: Gate | null;
	conversionStage: LeadStage;
	hasLead: boolean;
	personaSegments: PersonaSegment[];
	/** Linhas em `bevi_proposals` desta conversa — o desfecho REAL, que a nota de
	 * conversão passou a medir em vez do humor do kanban (PRD §5.1). */
	propostas: number;
	/** `contractClosed` do metadata: o self-service concluiu. */
	contratoFechado: boolean;
	/** Quantas vezes o agente repetiu, quase literalmente, a fala anterior dele
	 * (PRD §D2). É NÚMERO, não trava: nenhuma palavra é proibida e nada é dropado
	 * — repetição se corrige com prompt e exemplo, e se acompanha por
	 * distribuição sobre volume. */
	repeticoesDoAgente: number;
	/** Sinais DETERMINÍSTICOS que dispararam nesta conversa (funil parado antes
	 * da decisão, escolha falada e não ancorada, venda prometida sem proposta).
	 *
	 * Eles já existiam — num worker que publica no Langfuse e não conversava com
	 * `conversation_evaluations` (PRD §5.4). Quem abria o painel via a nota do
	 * juiz e nenhum alerta, na exata conversa em que o funil tinha morrido. */
	alertas: string[];
};

const REQUIRED_BY_CATEGORY: Record<string, ReadonlyArray<keyof QualifyAnswers | "creditRange">> = {
	imovel: ["creditRange", "prazoMeses"],
	auto: ["creditRange", "hasLance"],
};

// R$, %, e número + unidade temporal/parcela. Unidade necessária pra evitar
// matchar anos calendário ("em 2026") e quantidades genéricas no texto.
// A ESCALA FAZ PARTE DO NÚMERO. "R$ 500 mil" dito pelo agente é o mesmo
// 500.000 que está no card — e, sem capturar o sufixo, o detector lia
// "R$ 500", não achava em artefato nenhum e marcava alucinação. Medido na
// conversa real de 19/08/2026: era o último falso positivo que sobrava depois
// do arredondamento.
const NUMBER_REGEX =
	/R\$\s*[\d.]+(?:,\d{1,2})?(?:\s*(?:milh[õo]es|milh[ãa]o|mil))?|\b\d+(?:[.,]\d+)?\s*%|\b\d+(?:[.,]\d+)?\s*(?:m[eê]s(?:es)?|anos?|parcelas?)\b/gi;

export function computeSignals(args: {
	metadata: ConversationMetadata | null;
	channel: "web" | "whatsapp";
	messages: SignalsMessage[];
	artifacts: SignalsArtifact[];
	lead: SignalsLead;
	/** Quantas propostas REAIS esta conversa gerou (`bevi_proposals`). */
	propostas: number;
	/** O contrato self-service foi concluído (`metadata.contractClosed`). */
	contratoFechado?: boolean;
}): DeterministicSignals {
	const { metadata, channel, messages, artifacts, lead } = args;

	return {
		propostas: args.propostas,
		contratoFechado: args.contratoFechado ?? metadata?.contractClosed === true,
		alertas: computeAlertas({ metadata, messages, artifacts, propostas: args.propostas }),
		repeticoesDoAgente: contarRepeticoes(messages),
		replyRate: computeReplyRate(messages),
		...computeQualifyCoverage(metadata),
		numbersInTextFlagged: computeNumbersFlagged(messages, artifacts),
		dropOffGate: computeDropOffGate(metadata),
		conversionStage: lead?.stage ?? "novo",
		hasLead: computeHasLead(channel, lead),
		personaSegments: computePersonaSegments(messages),
	};
}

// Web só tem o form como canal de contato → email é obrigatório. WhatsApp já
// usa o telefone como canal nativo → email é opcional (handoff direto pelo
// botão de interesse cria o lead com email=null e isso é normal).
function computeHasLead(channel: "web" | "whatsapp", lead: SignalsLead): boolean {
	if (!lead?.name || !lead.phone) return false;
	if (channel === "web" && !lead.email) return false;
	return true;
}

export function computePersonaSegments(messages: SignalsMessage[]): PersonaSegment[] {
	const segments: PersonaSegment[] = [];
	let current: PersonaSegment | null = null;

	for (const m of messages) {
		if (m.role !== "assistant") continue;
		const personaId = m.personaId ?? null;
		if (!personaId) continue;

		if (current && current.personaId === personaId) {
			current.endMessageId = m.id;
			current.turnCount++;
		} else {
			if (current) segments.push(current);
			current = {
				personaId,
				startMessageId: m.id,
				endMessageId: m.id,
				turnCount: 1,
			};
		}
	}
	if (current) segments.push(current);
	return segments;
}

function computeReplyRate(messages: SignalsMessage[]): number {
	const userTurns = messages.filter((m) => m.role === "user").length;
	const assistantTurns = messages.filter((m) => m.role === "assistant").length;
	if (assistantTurns === 0) return 1;
	return Math.min(1, userTurns / assistantTurns);
}

function computeQualifyCoverage(metadata: ConversationMetadata | null): {
	qualifyCoverage: number;
	qualifyMissing: string[];
} {
	if (!metadata) return { qualifyCoverage: 0, qualifyMissing: [] };

	// Categorias visitadas: união de personasSeen com currentCategory.
	const visited = new Set<Category>(metadata.personasSeen ?? []);
	if (metadata.currentCategory) visited.add(metadata.currentCategory);
	if (visited.size === 0) return { qualifyCoverage: 0, qualifyMissing: [] };

	const byCategory = metadata.qualifyAnswersByCategory ?? {};
	const missing: string[] = [];
	let totalFilled = 0;
	let totalRequired = 0;

	for (const cat of visited) {
		const required = REQUIRED_BY_CATEGORY[cat];
		if (!required) continue;
		// Categoria atual usa qualifyAnswers; categorias passadas usam o snapshot.
		const answers =
			cat === metadata.currentCategory
				? (metadata.qualifyAnswers ?? byCategory[cat] ?? {})
				: (byCategory[cat] ?? {});

		for (const field of required) {
			totalRequired++;
			if (field === "creditRange") {
				if (answers.creditMin !== undefined || answers.creditMax !== undefined) totalFilled++;
				else missing.push(`${cat}.creditRange`);
			} else {
				if (answers[field] !== undefined && answers[field] !== null) totalFilled++;
				else missing.push(`${cat}.${field}`);
			}
		}
	}

	return {
		qualifyCoverage: totalRequired === 0 ? 0 : totalFilled / totalRequired,
		qualifyMissing: missing,
	};
}

function computeNumbersFlagged(
	messages: SignalsMessage[],
	artifacts: SignalsArtifact[],
): Array<{ messageId: string; number: string; context: string }> {
	const knownNumbers = collectArtifactNumbers(artifacts);
	// O QUE O CLIENTE DISSE TAMBÉM É FONTE.
	//
	// "Uma casa de R$ 400 mil é um bom investimento" repete o valor que ELA
	// acabou de informar — e era marcado como alucinação, porque nenhum artefato
	// tinha 400.000 (a busca só rodou depois, na faixa corrigida). Ecoar o
	// cliente é o oposto de inventar: é escutar. O que este sinal existe para
	// pegar é número que NASCEU no modelo.
	for (const msg of messages) {
		if (msg.role !== "user") continue;
		for (const match of msg.content.matchAll(NUMBER_REGEX)) {
			const valor = parseNumeric(match[0]);
			if (valor === null) continue;
			knownNumbers.add(valor);
			knownNumbers.add(Math.round(valor));
		}
	}
	const flagged: Array<{ messageId: string; number: string; context: string }> = [];

	for (const msg of messages) {
		if (msg.role !== "assistant") continue;
		const matches = msg.content.matchAll(NUMBER_REGEX);
		for (const match of matches) {
			const raw = match[0];
			const numericValue = parseNumeric(raw);
			if (numericValue === null) continue;
			if (matchesKnownNumber(numericValue, knownNumbers)) continue;
			flagged.push({
				messageId: msg.id,
				number: raw,
				context: extractContext(msg.content, match.index ?? 0),
			});
		}
	}

	return flagged;
}

function collectArtifactNumbers(artifacts: SignalsArtifact[]): Set<number> {
	const result = new Set<number>();
	for (const a of artifacts) walkForNumbers(a.payload, result);
	return result;
}

function walkForNumbers(value: unknown, out: Set<number>): void {
	if (typeof value === "number" && Number.isFinite(value)) {
		out.add(value);
		// A FORMA COMO O NÚMERO É DITO EM PORTUGUÊS TAMBÉM É CONHECIDA.
		//
		// O artefato guarda 499633.76; o agente diz "R$ 499.634", que é o
		// arredondamento correto — e era marcado como alucinação (PRD §5.2). A
		// tolerância de ±1 do `matchesKnownNumber` não alcançava, porque o
		// arredondado nunca entrava neste conjunto. Punir o agente por falar como
		// gente, justamente quando ele tirou o número da ferramenta, ensina a
		// ignorar o painel.
		out.add(Math.round(value));
		// Forma derivada: percent fracionário (0.18) também conhecido como integer (18).
		out.add(Math.round(value * 100));
		// Cross-unit meses ↔ anos: artifact "prazoMeses: 120" precisa casar com
		// texto "10 anos" e vice-versa. Sem isso o agente fala em ano e tudo
		// vira flag de hallucination.
		if (Number.isInteger(value) && value % 12 === 0) out.add(value / 12);
		out.add(value * 12);
		return;
	}
	if (Array.isArray(value)) {
		for (const v of value) walkForNumbers(v, out);
		return;
	}
	if (value && typeof value === "object") {
		for (const v of Object.values(value)) walkForNumbers(v, out);
	}
}

function parseNumeric(raw: string): number | null {
	// "mil"/"milhão" multiplicam o que vem antes — ignorar isso transforma meio
	// milhão em quinhentos reais.
	const escala = /\bmilh[õo]es|\bmilh[ãa]o/i.test(raw)
		? 1_000_000
		: /\bmil\b/i.test(raw)
			? 1_000
			: 1;
	const cleaned = raw
		.replace(/R\$\s*/i, "")
		.replace(/\s*%/, "")
		.replace(/\s*(?:milh[õo]es|milh[ãa]o|mil)\s*$/i, "")
		.replace(/\s*(?:m[eê]s(?:es)?|anos?|parcelas?)\s*$/i, "")
		.replace(/\./g, "")
		.replace(",", ".");
	const n = Number(cleaned);
	return Number.isFinite(n) ? n * escala : null;
}

function matchesKnownNumber(value: number, known: Set<number>): boolean {
	if (known.has(value)) return true;
	const rounded = Math.round(value);
	if (known.has(rounded)) return true;
	// Tolerância de ±1 unidade pra arredondamento de centavos
	if (known.has(rounded + 1) || known.has(rounded - 1)) return true;
	return false;
}

function extractContext(content: string, matchIndex: number): string {
	const start = Math.max(0, matchIndex - 30);
	const end = Math.min(content.length, matchIndex + 60);
	return content.slice(start, end).replace(/\s+/g, " ").trim();
}

function computeDropOffGate(metadata: ConversationMetadata | null): Gate | null {
	if (!metadata) return null;
	if (!metadata.currentCategory) return null;
	try {
		return nextGate(metadata);
	} catch {
		return null;
	}
}

/**
 * OS SINAIS DETERMINÍSTICOS DESTA CONVERSA — a prova, ao lado do juízo.
 *
 * Mesma função que o worker de reconciliação usa (`scoresDeReconciliacao`), com
 * os insumos derivados do que a avaliação já tem em mãos: tipo e hora dos
 * artefatos, hora das mensagens, `bevi_proposals`, `escolha` no metadata.
 *
 * Juiz de LLM não pega funil parado: na conversa da Rute as cinco dimensões
 * saíram altas e a conversa tinha morrido três portões antes do contrato.
 */
function computeAlertas(args: {
	metadata: ConversationMetadata | null;
	messages: SignalsMessage[];
	artifacts: SignalsArtifact[];
	propostas: number;
}): string[] {
	const { metadata, messages, artifacts, propostas } = args;
	const horaDaMensagem = new Map(messages.map((m) => [m.id, m.createdAt]));
	const primeiroArtefato = (tipos: string[]): Date | null => {
		const datas = artifacts
			.filter((a) => tipos.includes(a.type))
			.map((a) => horaDaMensagem.get(a.messageId))
			.filter((d): d is Date => d instanceof Date)
			.sort((a, b) => a.getTime() - b.getTime());
		return datas[0] ?? null;
	};
	const temArtefato = (tipo: string) => artifacts.some((a) => a.type === tipo);
	const usuariosApos = (marco: Date | null): number =>
		marco === null
			? 0
			: messages.filter((m) => m.role === "user" && m.createdAt.getTime() > marco.getTime()).length;

	const revealEm = primeiroArtefato(["comparison_table", "recommendation_card"]);
	const decisaoEm = primeiroArtefato(["decision_prompt", "two_paths"]);

	return scoresDeReconciliacao({
		maxStageReached: (metadata?.maxStageReached as string | undefined) ?? null,
		decisaoOferecidaEm: decisaoEm,
		contratoOferecido: temArtefato("contract_form"),
		mensagensDoUsuarioAposDecisao: usuariosApos(decisaoEm),
		propostas,
		revealCompleted: metadata?.revealCompleted === true || revealEm !== null,
		mensagensDoUsuarioAposReveal: usuariosApos(revealEm),
		escolhaAncorada: Boolean(metadata?.escolha),
		cotaDoContrato: Boolean(metadata?.contractOffer),
		apontouUmaCota: temArtefato("simulation_result"),
	}).map((s) => s.name);
}

/** Palavras "de conteúdo" da fala, normalizadas — a base da comparação. */
function palavrasDe(texto: string): string[] {
	return texto
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9\s]/g, " ")
		.split(/\s+/)
		.filter((p) => p.length > 2);
}

/** Similaridade de Jaccard entre dois conjuntos de palavras. */
function similaridade(a: string[], b: string[]): number {
	const A = new Set(a);
	const B = new Set(b);
	if (A.size === 0 || B.size === 0) return 0;
	let comuns = 0;
	for (const p of A) if (B.has(p)) comuns += 1;
	return comuns / (A.size + B.size - comuns);
}

/** Falas curtas ("Perfeito!", "Show") repetem por cortesia e isso não é defeito —
 * o que incomoda o cliente é o PEDIDO inteiro chegando de novo. */
const PALAVRAS_MINIMAS = 8;
/** Acima disto as duas falas dizem a mesma coisa com outras palavras. Calibrado
 * nos turnos 12 e 15 da conversa da Rute (PRD §D2). */
const LIMIAR_DE_REPETICAO = 0.6;

/**
 * Quantas vezes o agente repetiu a própria fala anterior, quase igual.
 *
 * Compara FALAS CONSECUTIVAS do agente (o que o cliente sente como "ele já me
 * disse isso"), por sobreposição de vocabulário — não por lista de frases. É a
 * diferença entre medir o fenômeno e proibir palavras: nada aqui bloqueia nada,
 * o número só entra na avaliação e na rubrica.
 */
function contarRepeticoes(messages: SignalsMessage[]): number {
	const falas = messages.filter((m) => m.role === "assistant").map((m) => palavrasDe(m.content));
	let repeticoes = 0;
	for (let i = 1; i < falas.length; i++) {
		if (falas[i].length < PALAVRAS_MINIMAS || falas[i - 1].length < PALAVRAS_MINIMAS) continue;
		if (similaridade(falas[i], falas[i - 1]) >= LIMIAR_DE_REPETICAO) repeticoes += 1;
	}
	return repeticoes;
}
