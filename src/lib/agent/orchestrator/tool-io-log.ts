/**
 * FIX-181 (Mirella, 2026-07-01) — observabilidade de tool I/O.
 *
 * Lei 5 de ~/.claude/reference/arquitetura-agentes-ia.md: "Logue argumentos +
 * resultado de cada tool-call (estruturado). Sem isso, quando algo dá errado a
 * pergunta 'a IA inventou ou pegou de dado real?' fica indeterminável." Um
 * turn-trace agregado (quais tools, quantas) NÃO basta.
 *
 * O primitivo NATIVO do AI SDK 6 pra isto é `onStepFinish({ toolCalls,
 * toolResults })` (opção de chamada de `agent.stream()`/`.generate()`, confirmado
 * na doc oficial — ver ADR docs/correcoes/decisions/2026-07-01-bloco-a-governanca-agente.md).
 * O runner liga o callback; este módulo formata + mascara PII + emite o log.
 *
 * PII (LGPD): CPF/celular/documentos/e-mail NUNCA em claro no log. Mascaramento
 * por CHAVE (nome do campo) + por PADRÃO (regex de CPF/telefone em strings).
 * Nível de log = servidor (console.log estruturado, grepável) — nunca vaza pro
 * cliente.
 */

/** Chaves cujo valor é sensível por natureza (redigidas inteiras). */
const SENSITIVE_KEY = /(cpf|phone|celular|telefone|whats|e-?mail|documento|document|\brg\b|passport|passaporte)/i;

/** CPF com ou sem pontuação: 529.982.247-25 ou 52998224725. */
const CPF_RE = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
/** Telefone BR (com/sem DDI/DDD/9º dígito/pontuação). Backstop pra strings livres. */
const PHONE_RE = /(?:\+?55[\s.-]?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/g;

function maskString(s: string): string {
	// CPF primeiro (11 dígitos): evita que o PHONE_RE classifique um CPF cru.
	return s.replace(CPF_RE, "[CPF]").replace(PHONE_RE, "[TEL]");
}

/**
 * Mascara PII recursivamente em qualquer shape de args/result. Chave sensível →
 * `[REDACTED]`; string com padrão de CPF/telefone → substitui o trecho. Números,
 * booleanos, null e ids opacos passam intactos (não são o alvo do card).
 */
export function maskPii(value: unknown): unknown {
	if (typeof value === "string") return maskString(value);
	if (Array.isArray(value)) return value.map((v) => maskPii(v));
	if (value !== null && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			out[k] = SENSITIVE_KEY.test(k) ? "[REDACTED]" : maskPii(v);
		}
		return out;
	}
	return value;
}

export type ToolCallRecord = { toolCallId?: string; toolName: string; input?: unknown };
export type ToolResultRecord = { toolCallId?: string; toolName: string; output?: unknown };

export type ToolIoLogArgs = {
	conversationId?: string;
	stepNumber: number;
	toolCalls: ToolCallRecord[];
	toolResults: ToolResultRecord[];
};

/**
 * Constrói uma linha JSON por tool-call do step, pareando o RESULTADO pelo
 * toolCallId. Args e output vão MASCARADOS. Uma chamada sem resultado pareado
 * ainda é logada (output null) — nunca engole a chamada.
 */
export function buildToolIoLogLines(args: ToolIoLogArgs): string[] {
	const resultByCallId = new Map<string, unknown>();
	for (const r of args.toolResults) {
		if (r.toolCallId) resultByCallId.set(r.toolCallId, r.output);
	}
	return args.toolCalls.map((call) => {
		const output =
			call.toolCallId != null && resultByCallId.has(call.toolCallId)
				? resultByCallId.get(call.toolCallId)
				: null;
		return JSON.stringify({
			level: "info",
			source: "tool-io",
			conversation_id: args.conversationId ?? null,
			step: args.stepNumber,
			tool: call.toolName,
			input: maskPii(call.input ?? null),
			output: maskPii(output),
		});
	});
}

/** Emite as linhas de tool I/O (server-side, grepável). Nunca lança. */
export function logToolIO(args: ToolIoLogArgs): void {
	try {
		for (const line of buildToolIoLogLines(args)) {
			console.log(line);
		}
	} catch {
		// Observabilidade nunca pode derrubar o turno.
	}
}

// FIX-257 (P1, veredito Fable r4 §P1 #1) — erro de INPUT de tool (falha de
// validação Zod antes do `execute` rodar) NUNCA pode colapsar no mesmo
// `output: null` mudo de "a tool rodou e não achou nada" (buildToolIoLogLines
// acima, quando não há tool-result pareado). É essa indistinguibilidade que
// alimentou a espiral de negação: o agente tratou "sem confirmação" como "não
// existe" e negou 3× ofertas que o usuário via na própria tabela.
//
// O AI SDK v6 emite um chunk `tool-input-error` no `fullStream` pra esse
// caso — `runner.ts` precisa ligar este log nesse `case` (Camada 1
// structural, ver teste). `outcome: "invalid_input"` + `error` populado
// tornam o defeito BARULHENTO e nomeado, nunca silencioso.
export type ToolInputErrorRecord = {
	toolCallId?: string;
	toolName: string;
	input?: unknown;
	errorText?: string;
};

export type ToolInputErrorLogArgs = {
	conversationId?: string;
	stepNumber: number;
	error: ToolInputErrorRecord;
};

export function buildToolInputErrorLogLine(args: ToolInputErrorLogArgs): string {
	return JSON.stringify({
		level: "error",
		source: "tool-io",
		conversation_id: args.conversationId ?? null,
		step: args.stepNumber,
		tool: args.error.toolName,
		toolCallId: args.error.toolCallId ?? null,
		input: maskPii(args.error.input ?? null),
		output: null,
		outcome: "invalid_input",
		error: args.error.errorText ?? "Input da tool nao bateu o schema esperado (erro de validacao).",
	});
}

/** Emite o erro de input de tool via `console.error` (server-side). Nunca lança. */
export function logToolInputError(args: ToolInputErrorLogArgs): void {
	try {
		console.error(buildToolInputErrorLogLine(args));
	} catch {
		// Observabilidade nunca pode derrubar o turno.
	}
}
