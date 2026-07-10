/**
 * FIX-188 — Camada de composição: texto EFÊMERO (preâmbulo de processo) × FINAL.
 *
 * Print do Kairo (2026-07-01): em turno multi-step o modelo escreve preâmbulos de
 * PROCESSO antes de cada tool-call ("deixa eu puxar os números reais", "vou buscar
 * as opções certas", "preciso primeiro buscar os grupos", "um segundo", "deixa eu
 * usar a ferramenta certa") e TODOS eram persistidos/enviados como mensagem final.
 *
 * A defesa soft no `system-prompt.ts` não segura sob carga (Lei 4 —
 * instruction-following degrada). A BARREIRA REAL é este sanitizer determinístico
 * (Lei 1: o LLM não decide o que vira bolha; só a resposta de RESULTADO vira). É
 * DETECÇÃO de meta-narrativa de processo (mesma natureza dos detectores de
 * meta-narrativa/refresh que já existem) — a governança de FLUXO segue allowlist.
 *
 * Pós-onda-1 (FIX-186): o erro de descoberta já vira diretiva e o runner suprime
 * TODA a narração após uma falha → este sanitizer só cuida de preâmbulo de
 * SUCESSO, nunca de narração de erro.
 */

// Ações de processo ("deixa eu buscar", "vou puxar", "preciso primeiro buscar",
// "vou usar a ferramenta"). NÃO incluímos "simular"/"ver" — o prompt endossa
// narrações legítimas com conteúdo ("Vou simular a Rodobens com R$ 900k:") e
// dropá-las seria falso-positivo. Conservador de propósito.
const PROCESS_ACTION_PATTERNS: RegExp[] = [
	/\bdeixa\s+eu\s+(buscar|puxar|procurar|pegar|consultar|usar)\b/i,
	/\bvou\s+(buscar|puxar|procurar|consultar)\b/i,
	/\bvou\s+usar\s+a\s+ferramenta\b/i,
	/\bpreciso\s+(primeiro\s+)?(buscar|puxar|procurar|consultar)\b/i,
];

// Fillers de processo puros ("um segundo", "só um instante"). Ancorados no
// segmento inteiro pra NÃO pegar "tem um segundo grupo" (falso-positivo).
const PROCESS_FILLER_PATTERNS: RegExp[] = [
	/^\s*(um\s+segundo|s[óo]\s+um\s+(instante|segundo|minuto))\s*[:.!…]*\s*$/i,
];

export const PROCESS_PREAMBLE_PATTERNS: RegExp[] = [
	...PROCESS_ACTION_PATTERNS,
	...PROCESS_FILLER_PATTERNS,
];

/** Um segmento (frase) é preâmbulo de processo (efêmero) — não pode virar bolha. */
export function isProcessPreamble(segment: string): boolean {
	const s = segment.trim();
	if (!s) return false;
	return PROCESS_PREAMBLE_PATTERNS.some((rx) => rx.test(s));
}

// FIX-190 — fallback técnico ("atualiza/recarregue a página", "dá um refresh"):
// solução manual preguiçosa que empurra trabalho pro usuário. O FIX-52 já vetou a
// frase no prompt + HARD_RULES + cassette; ESTA é a barreira em CÓDIGO (Lei 4): se
// o modelo emitir mesmo assim, o segmento é dropado e nunca chega ao usuário. O
// gêmeo do FIX-186 (na falha, o fallback é a mensagem determinística + ação, nunca
// "atualiza a página"). Requer "página/tela" perto do verbo pra NÃO pegar copy
// legítima ("vou atualizar o valor da simulação").
const TECHNICAL_FALLBACK_PATTERNS: RegExp[] = [
	/\batualiz[ae]\s+a?\s*(p[áa]gina|tela)\b/i,
	/\brecarregu?e?\s+a?\s*(p[áa]gina|tela)\b/i,
	/\brecarregar\s+a?\s*(p[áa]gina|tela)\b/i,
	/\bd[áê]\s+um\s+refresh\b/i,
	/\brecarregando\s+a?\s*(p[áa]gina|tela)\b/i,
];

/** Um segmento instrui o usuário a atualizar/recarregar a página (fallback técnico
 * proibido) — não pode virar bolha. FIX-190. */
export function isTechnicalFallback(segment: string): boolean {
	const s = segment.trim();
	if (!s) return false;
	return TECHNICAL_FALLBACK_PATTERNS.some((rx) => rx.test(s));
}

// FIX-234 (handoff agente-vendas-consorcio, 2026-07-09 — D7/05-compliance) —
// "reduzir o prazo"/"terminar antes"/"quitar antes": o abatimento do lance
// (dinheiro OU embutido) vira PARCELA MENOR, nunca prazo menor. Prometer prazo
// reduzido é a mesma classe de risco regulatório de "garantir contemplação em
// mês específico" (CDC art. 37) — barreira em CÓDIGO (Lei 4), a regra no
// prompt sozinha não segura sob carga.
const PRAZO_REDUCTION_PATTERNS: RegExp[] = [
	/\breduzir\s+o\s+prazo\b/i,
	/\bterminar\s+antes\b/i,
	/\bquitar\s+antes\b/i,
];

/** Um segmento promete redução de prazo (D7, proibido) — não pode virar bolha. */
export function isPrazoReductionClaim(segment: string): boolean {
	const s = segment.trim();
	if (!s) return false;
	return PRAZO_REDUCTION_PATTERNS.some((rx) => rx.test(s));
}

// FIX-234 — "reservado/cota garantida/você já está no grupo" ANTES da
// contratação real (invariante #9, docs/05-compliance-e-dados.md): nada foi
// contratado ainda até o `present_contract_form`/offer-confirm self-service
// completar. Mira a LLM afirmando isso na própria fala, não a copy
// determinística pós-evento (que usa a terminologia oficial "reserva de
// cota" da Ata 2026-07-04 e não passa por este sanitizer).
const PREMATURE_RESERVATION_PATTERNS: RegExp[] = [
	/\bcota\b[\s\S]{0,25}\bgarantida\b/i,
	/\breservad[ao]\b/i,
	/\bvoc[êe]\s+j[áa]\s+est[áa]\s+no\s+grupo\b/i,
];

/** Um segmento afirma reserva/garantia prematura (proibido, invariante #9) —
 * não pode virar bolha. */
export function isPrematureReservationClaim(segment: string): boolean {
	const s = segment.trim();
	if (!s) return false;
	return PREMATURE_RESERVATION_PATTERNS.some((rx) => rx.test(s));
}

// FIX-234 — léxico banido (docs/04-copy-fluxos.md): tom consultivo, não
// "brother". "carro-problema" mira o COMPOSTO pejorativo (não a menção neutra
// de "problema no carro"); "na sua cabeça" mira a expressão de gíria completa
// ("qual carro tá na sua cabeça"), não qualquer menção a "cabeça".
const BANNED_LEXICON_PATTERNS: RegExp[] = [
	/\bsaco\b/i,
	/\bfurar\s+a\s+fila\b/i,
	/\bcarro-problema\b/i,
	/\bna\s+sua\s+cabe[çc]a\b/i,
];

/** Um segmento usa léxico banido (gíria/tom informal demais) — não pode virar
 * bolha. */
export function isBannedLexicon(segment: string): boolean {
	const s = segment.trim();
	if (!s) return false;
	return BANNED_LEXICON_PATTERNS.some((rx) => rx.test(s));
}

/** Segmento EFÊMERO: preâmbulo de processo (FIX-188), fallback técnico
 * (FIX-190), redução de prazo/reserva prematura/léxico banido (FIX-234).
 * Todos são dropados antes de virar mensagem. */
function isEphemeralSegment(segment: string): boolean {
	return (
		isProcessPreamble(segment) ||
		isTechnicalFallback(segment) ||
		isPrazoReductionClaim(segment) ||
		isPrematureReservationClaim(segment) ||
		isBannedLexicon(segment)
	);
}

/** Quebra o texto em segmentos (frases) mantendo o delimitador (. ! ? : \n) à
 * esquerda. Usado pelo sanitizer e pela normalização anti-colagem (FIX-189). */
export function splitSegments(text: string): string[] {
	return text.split(/(?<=[.!?:\n])/).filter((p) => p.length > 0);
}

/**
 * Remove os segmentos de preâmbulo de processo, preservando o espaçamento
 * original entre os segmentos mantidos (a separação de frases legítimas não é
 * tocada — a granularidade de streaming garante que nada seja emitido colado).
 */
export function stripProcessPreamble(text: string): string {
	if (!text) return text;
	const segments = splitSegments(text);
	const kept = segments.filter((seg) => !isEphemeralSegment(seg));
	return kept.join("");
}

function lastBoundaryIndex(s: string): number {
	let idx = -1;
	for (const ch of [".", "!", "?", ":", "\n"]) {
		const i = s.lastIndexOf(ch);
		if (i > idx) idx = i;
	}
	return idx;
}

/**
 * Filtro de stream por FRASE (DR1). Segura só a frase INCOMPLETA corrente; cada
 * frase COMPLETA (fechada por . ! ? : ou \n) é checada contra o blocklist ANTES
 * de emitir — preâmbulo de processo é DROPADO (nunca vira delta nem entra em
 * `fullResponse`); frase legítima é liberada. Garante o invariante "preâmbulo
 * nunca é enviado" (não só "não persistido"), sem matar o streaming (aparece
 * frase-a-frase; o chip determinístico cobre a latência da tool).
 */
export class EphemeralTextFilter {
	private pending = "";

	/** Alimenta um delta; devolve o texto LIMPO pronto pra emitir agora. */
	push(delta: string): string {
		this.pending += delta;
		const idx = lastBoundaryIndex(this.pending);
		if (idx < 0) return "";
		const complete = this.pending.slice(0, idx + 1);
		this.pending = this.pending.slice(idx + 1);
		return stripProcessPreamble(complete);
	}

	/** Fim do bloco/stream: libera a cauda (última frase sem delimitador), também
	 * filtrada. */
	flush(): string {
		const rest = this.pending;
		this.pending = "";
		if (!rest) return "";
		return stripProcessPreamble(rest);
	}
}

/**
 * FIX-189 — separa falas que o MODELO colou no mesmo bloco sem espaço
 * ("...com os dados corretos.Show, esse plano encaixa"). Insere `\n\n` entre uma
 * pontuação de fim de frase precedida por letra MINÚSCULA e seguida por letra
 * MAIÚSCULA — padrão conservador que NÃO pega valor monetário (`R$ 1.000`),
 * número com ponto (`72.000`) nem sigla (`U.S.A.`, maiúscula antes do ponto).
 * Complementa o `textBlockSeparator` (cross-block) e o `joinSeparator` (emit).
 */
export function normalizeGluedSentences(text: string): string {
	if (!text) return text;
	return text.replace(/(\p{Ll})([.!?])(\p{Lu})/gu, "$1$2\n\n$3");
}

/**
 * Separador de CONTEÚDO entre a fala acumulada e a próxima a emitir (FIX-189
 * anti-colagem): só insere `\n\n` quando há colagem real — o acumulado termina
 * SEM espaço e o próximo começa SEM espaço. Complementa o `textBlockSeparator`
 * (FIX-182, por id de bloco) no ponto de emissão por frase.
 */
export function joinSeparator(accumulated: string, next: string): string {
	if (!accumulated || !next) return "";
	if (/\s$/.test(accumulated)) return "";
	if (/^\s/.test(next)) return "";
	return "\n\n";
}
