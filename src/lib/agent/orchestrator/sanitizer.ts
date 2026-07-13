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

// FIX-243 (rodada 2, Fable r1, §D5.2 do veredito — 05-compliance-e-dados.md):
// `taxaContemplacao` é campo PROIBIDO — semântica não documentada pela Bevi
// (registro honesto da spec: foi inferência sem base durante a prototipagem).
// O guard estático (`no-taxa-contemplacao.guard.test.ts`) só cobre payload/UI;
// a FALA do LLM vazava o conceito como argumento de venda ("A ITAÚ se destaca
// pela boa taxa de contemplação"). Fonte permitida de sinal de contemplação:
// `monthlyAwardedQuotas`/contemplados por mês (contagem REAL), nunca "taxa".
const TAXA_CONTEMPLACAO_PATTERNS: RegExp[] = [/\btaxa\s+de\s+contempla[çc][ãa]o\b/i];

/** Um segmento cita "taxa de contemplação" (campo proibido, sem semântica
 * documentada) — não pode virar bolha. */
export function isTaxaContemplacaoClaim(segment: string): boolean {
	const s = segment.trim();
	if (!s) return false;
	return TAXA_CONTEMPLACAO_PATTERNS.some((rx) => rx.test(s));
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

// FIX-249 (rodada 3, Fable r2, N2 P0): "deixa eu resolver isso e já te
// retorno" / "assim que eu conseguir… te retorno" — a web NÃO TEM canal
// proativo (nenhum worker manda mensagem "depois" pro usuário nesta
// conversa); prometer isso é um beco-sem-saída, o turno morre e o usuário
// fica esperando algo que nunca chega. Mira a PROMESSA de contato futuro,
// não menções neutras a "contato" (ex.: "seus dados de contato").
const PROACTIVE_CALLBACK_PATTERNS: RegExp[] = [
	/\bj[áa]\s+te\s+retorno\b/i,
	/\bte\s+retorno\b/i,
	/\bentro\s+em\s+contato\s+(depois|em\s+breve|em\s+instantes)\b/i,
	/\bvou\s+verificar\s+e\s+(te\s+)?(volto|aviso)\b/i,
	/\bj[áa]\s+te\s+aviso\b/i,
];

/** Um segmento promete retorno/contato proativo (proibido — a web não tem
 * canal proativo, FIX-249) — não pode virar bolha. */
export function isProactiveCallbackClaim(segment: string): boolean {
	const s = segment.trim();
	if (!s) return false;
	return PROACTIVE_CALLBACK_PATTERNS.some((rx) => rx.test(s));
}

// FIX-270 (rodada 8, veredito Fable r7, D5 — ÚNICO bloqueador pra prod): o
// agente FABRICOU estado no pós-fecho — "os documentos já foram recebidos
// pela administradora" quando NENHUM upload aconteceu (o cliente pode nunca
// enviar, achando que já era) e 2× alegou ter re-buscado o catálogo com 0
// tool-calls ("Não apareceu nenhum grupo novo na faixa hoje"). Estado NUNCA
// vem da narrativa do LLM (Lei 1) — vem da fonte real: upload confirmado
// (`meta.documentSlotsSent`, WhatsApp — na web nada escreve nesse campo hoje,
// então a claim é sempre falsa lá) ou tool-call de busca (`search_groups`/
// `recommend_groups`) de fato disparada NESTE turno (turn-trace.toolsCalled).
// Padrões "documentos... já... recebidos/chegaram" exigem "já" pra não pegar
// frase futura/condicional legítima ("assim que enviar, confirmamos").
// Nota: `\b` logo após uma vogal acentuada ("á") não funciona como fronteira
// no modo não-unicode do JS (regex \w não reconhece acento) — usa lookahead
// de espaço em vez de `\b` nesse ponto específico.
const DOCUMENT_RECEIPT_CLAIM_PATTERNS: RegExp[] = [
	/\bdocumentos?\b[\s\S]{0,40}\bj[áa](?=\s)[\s\S]{0,25}\b(recebid[oa]s?|chegaram)\b/i,
	/\bj[áa]\s+recebemos\s+(seus\s+|os\s+|as\s+)?(fotos|documentos?)\b/i,
	/\brecebemos\s+(seus\s+|os\s+)?documentos?\b/i,
];

/** Um segmento afirma que documentos JÁ foram recebidos (estado COMPLETO,
 * não pedido/futuro) — só pode virar bolha se houve upload real. FIX-270. */
export function isDocumentReceiptClaim(segment: string): boolean {
	const s = segment.trim();
	if (!s) return false;
	return DOCUMENT_RECEIPT_CLAIM_PATTERNS.some((rx) => rx.test(s));
}

const CATALOG_RESEARCH_CLAIM_PATTERNS: RegExp[] = [
	/\bre-?busquei\b/i,
	/\bbusquei\s+(de\s+novo|novamente)\b/i,
	/\bconsultei\s+o\s+cat[áa]logo\b/i,
	/\bverifiquei\s+o\s+cat[áa]logo\b/i,
	/\bn[ãa]o\s+apareceu\s+(nenhum[a]?\s+)?(grupo|oferta|op[çc][ãa]o)s?\s+nov[ao]s?\b/i,
	/\bn[ãa]o\s+(encontrei|achei)\s+(nada|nenhum[a]?)\s+nov[ao]\b/i,
];

/** Um segmento afirma re-busca/consulta ao catálogo (estado COMPLETO) — só
 * pode virar bolha se uma tool de busca real rodou NESTE turno. FIX-270. */
export function isCatalogResearchClaim(segment: string): boolean {
	const s = segment.trim();
	if (!s) return false;
	return CATALOG_RESEARCH_CLAIM_PATTERNS.some((rx) => rx.test(s));
}

// FIX-283 (P2, veredito Sonnet r9pos, G-D — viola D23, jornada-canonica.md):
// o modelo parafraseou a instrução server-side do WhatsApp optin ("por conta
// própria", "o SISTEMA [...] automaticamente, com card próprio",
// `system-prompt.ts` `whatsappOptinSection("done")`) como se fosse algo a
// VERBALIZAR pro usuário em vez de regra interna a seguir em silêncio —
// meta-narrativa do próprio mecanismo. D23: o agente NUNCA narra o próprio
// mecanismo, mesmo se o cliente perguntar diretamente. Escopo estreito de
// propósito (preferindo falso-negativo a falso-positivo, mesma decisão do
// FIX-243/249 acima): mira os padrões literais do dossiê, nunca copy
// operacional legítima que mencione "sistema"/"automaticamente" noutro
// sentido (ex. "o sistema vai te avisar quando a proposta mudar de status").
const MECHANISM_NARRATION_PATTERNS: RegExp[] = [
	/\bn[ãa]o\s+cri[eo]\s+esse\s+tipo\s+de\s+texto\s+por\s+conta\s+pr[óo]pria\b/i,
	/\bconduzid[oa]\s+automaticamente\s+pelo\s+sistema\b/i,
	/\bo\s+sistema\s+decide\s+isso\s+automaticamente\b/i,
	// Nota: sem `\b` antes de "é" — vogal acentuada não conta como \w no modo
	// não-unicode do JS, então `\b` entre espaço e "é" nunca casa (mesma
	// pegadinha documentada acima em DOCUMENT_RECEIPT_CLAIM_PATTERNS).
	/\bn[ãa]o\s+sou\s+eu\s+que\s+decid[eo]\b[\s\S]{0,30}[ée]\s+o\s+sistema\b/i,
	/\bpor\s+conta\s+pr[óo]pria\b[\s\S]{0,60}\bsistema\b/i,
];

/** Um segmento narra o próprio mecanismo interno do sistema ("não crio isso
 * por conta própria, o sistema conduz automaticamente") — viola D23, mesmo
 * se o cliente perguntar. Não pode virar bolha. FIX-283. */
export function isMechanismNarrationClaim(segment: string): boolean {
	const s = segment.trim();
	if (!s) return false;
	return MECHANISM_NARRATION_PATTERNS.some((rx) => rx.test(s));
}

// FIX-298 (loop-de-goal r10, P4 — transcrição real com Qwen 3.5 Fast): "Quer
// ajustar o valor do bem ou seguir com essa opção da ITAÚ mesmo? Você já fez
// consórcio antes?" — duas sentenças interrogativas no mesmo balão, usuário só
// conseguiu responder uma. A regra "nunca mais de uma pergunta por mensagem"
// só existia como texto no system-prompt (Lei 4: instruction-following degrada
// sob modelo mais fraco). Corte é por SENTENÇA (delimitada por . ! ? : \n, os
// mesmos limites já usados pelo splitSegments) — NÃO por "pedido": uma frase
// composta com um único "?" ("Que carro você tem em mente, e quanto custa mais
// ou menos?") é UMA sentença válida e não pode ser cortada.
function isInterrogativeSentence(segment: string): boolean {
	return /\?\s*$/.test(segment.trimEnd());
}

/** Um segmento é a última sentença interrogativa dentre `segments` (índice
 * `index`) — usado pra decidir quais perguntas anteriores são dropadas.
 * FIX-298: nunca mais de 1 sentença interrogativa sobrevive por turno. */
function lastInterrogativeIndex(segments: string[]): number {
	let last = -1;
	segments.forEach((seg, i) => {
		if (isInterrogativeSentence(seg)) last = i;
	});
	return last;
}

/** Fatos reais do turno/conversa contra os quais uma afirmação de estado é
 * verificada — NUNCA a narrativa do LLM (Lei 1/5). FIX-270. */
export type StateVerificationContext = {
	/** true só quando `meta.documentSlotsSent` tem upload confirmado de fato. */
	hasReceivedDocuments: boolean;
	/** true só quando uma tool de busca (search_groups/recommend_groups) já
	 * rodou neste turno até o ponto corrente do stream. */
	hasSearchToolCall: boolean;
};

/** Um segmento afirma estado (documento recebido / re-busca) sem o evento
 * real por trás — dropar. Sem contexto, nunca dropa (compat retroativa). */
function isFabricatedStateSegment(segment: string, ctx?: StateVerificationContext): boolean {
	if (!ctx) return false;
	if (isDocumentReceiptClaim(segment) && !ctx.hasReceivedDocuments) return true;
	if (isCatalogResearchClaim(segment) && !ctx.hasSearchToolCall) return true;
	return false;
}

/** Segmento EFÊMERO: preâmbulo de processo (FIX-188), fallback técnico
 * (FIX-190), redução de prazo/reserva prematura/léxico banido (FIX-234),
 * taxa de contemplação (FIX-243), promessa de retorno proativo (FIX-249),
 * estado fabricado sem lastro real (FIX-270), narração do próprio mecanismo
 * interno (FIX-283). Todos são dropados antes de virar mensagem. */
function isEphemeralSegment(segment: string, ctx?: StateVerificationContext): boolean {
	return (
		isProcessPreamble(segment) ||
		isTechnicalFallback(segment) ||
		isPrazoReductionClaim(segment) ||
		isPrematureReservationClaim(segment) ||
		isBannedLexicon(segment) ||
		isTaxaContemplacaoClaim(segment) ||
		isProactiveCallbackClaim(segment) ||
		isMechanismNarrationClaim(segment) ||
		isFabricatedStateSegment(segment, ctx)
	);
}

const SEGMENT_BOUNDARY_CHARS = new Set([".", "!", "?", ":", "\n"]);

/** FIX-248 (rodada 3, Fable r2, N1 P0): "Juntando R$ 4." | "000,00 por mês" —
 * quebrava em 2 bolhas ao vivo (narração de dinheiro do FIX-241). Um "."
 * colado a um DÍGITO é separador de milhar/decimal ("R$ 4.000,00"), nunca fim
 * de frase real (que sempre segue LETRA) — nunca conta como fronteira. */
function isThousandsSeparatorDot(text: string, dotIndex: number): boolean {
	return /\d/.test(text[dotIndex - 1] ?? "");
}

function isSegmentBoundary(text: string, index: number): boolean {
	const ch = text[index];
	if (!SEGMENT_BOUNDARY_CHARS.has(ch)) return false;
	if (ch === "." && isThousandsSeparatorDot(text, index)) return false;
	return true;
}

/** Quebra o texto em segmentos (frases) mantendo o delimitador (. ! ? : \n) à
 * esquerda. Usado pelo sanitizer e pela normalização anti-colagem (FIX-189).
 * FIX-248: guarda de dígito — "." de milhar/decimal nunca é fronteira. */
export function splitSegments(text: string): string[] {
	const out: string[] = [];
	let start = 0;
	for (let i = 0; i < text.length; i++) {
		if (isSegmentBoundary(text, i)) {
			out.push(text.slice(start, i + 1));
			start = i + 1;
		}
	}
	if (start < text.length) out.push(text.slice(start));
	return out.filter((p) => p.length > 0);
}

/**
 * Remove os segmentos de preâmbulo de processo, preservando o espaçamento
 * original entre os segmentos mantidos (a separação de frases legítimas não é
 * tocada — a granularidade de streaming garante que nada seja emitido colado).
 *
 * FIX-270: `ctx` opcional habilita a checagem de estado fabricado (documento
 * recebido / re-busca de catálogo) contra o fato real. Sem `ctx` (chamadas
 * pré-existentes), o comportamento é idêntico ao anterior.
 */
export function stripProcessPreamble(text: string, ctx?: StateVerificationContext): string {
	if (!text) return text;
	const segments = splitSegments(text);
	const survivors = segments.filter((seg) => !isEphemeralSegment(seg, ctx));
	// FIX-298: nunca mais de 1 sentença interrogativa por balão — só a ÚLTIMA
	// pergunta sobrevive; perguntas anteriores no mesmo texto são dropadas.
	const lastQuestion = lastInterrogativeIndex(survivors);
	const kept = survivors.filter((seg, i) => !isInterrogativeSentence(seg) || i === lastQuestion);
	return kept.join("");
}

/** FIX-248: mesma guarda de dígito do splitSegments — no STREAM, um "." colado
 * a dígito ("R$ 4.") nunca é fronteira, mesmo que os dígitos do milhar
 * ("000,00") ainda não tenham chegado no delta seguinte. Segura a frase até
 * um limite real (ou o flush final) em vez de cortar o valor ao meio. */
function lastBoundaryIndex(s: string): number {
	for (let i = s.length - 1; i >= 0; i--) {
		if (isSegmentBoundary(s, i)) return i;
	}
	return -1;
}

/**
 * Filtro de stream por FRASE (DR1). Segura só a frase INCOMPLETA corrente; cada
 * frase COMPLETA (fechada por . ! ? : ou \n) é checada contra o blocklist ANTES
 * de emitir — preâmbulo de processo é DROPADO (nunca vira delta nem entra em
 * `fullResponse`); frase legítima é liberada. Garante o invariante "preâmbulo
 * nunca é enviado" (não só "não persistido"), sem matar o streaming (aparece
 * frase-a-frase; o chip determinístico cobre a latência da tool).
 *
 * FIX-270: `getContext` opcional (chamado a cada `push`/`flush`, sempre o
 * estado MAIS RECENTE) habilita a checagem de estado fabricado ao vivo —
 * `hasSearchToolCall` reflete as tool-calls JÁ processadas até este ponto do
 * stream (causal: uma claim "já busquei" só é verdadeira se a tool já rodou
 * ANTES dela na própria geração do modelo).
 */
export class EphemeralTextFilter {
	private pending = "";
	// FIX-298: a sentença interrogativa mais recente vista até agora NUNCA é
	// emitida na hora — só no próximo flush(). Isso garante que uma pergunta
	// SEGUINTE no mesmo turno sempre substitui a anterior antes de qualquer
	// uma delas chegar ao usuário (ao vivo, não dá pra "desmandar" uma frase já
	// emitida — segurar é a única forma de garantir que só a última sobrevive).
	private heldQuestion = "";

	constructor(private readonly getContext?: () => StateVerificationContext) {}

	/** Alimenta um delta; devolve o texto LIMPO pronto pra emitir agora. */
	push(delta: string): string {
		this.pending += delta;
		const idx = lastBoundaryIndex(this.pending);
		if (idx < 0) return "";
		const complete = this.pending.slice(0, idx + 1);
		this.pending = this.pending.slice(idx + 1);
		return this.filterComplete(complete);
	}

	/** Fim do bloco/stream: libera a cauda (última frase sem delimitador), também
	 * filtrada, seguido da pergunta segurada (se houver — FIX-298). */
	flush(): string {
		const rest = this.pending;
		this.pending = "";
		const out = rest ? this.filterComplete(rest) : "";
		return out + this.releaseHeldQuestion();
	}

	/** Filtra um trecho COMPLETO (1+ segmentos fechados): dropa efêmero e
	 * segura a sentença interrogativa (FIX-298). */
	private filterComplete(complete: string): string {
		const ctx = this.getContext?.();
		const segments = splitSegments(complete);
		let out = "";
		for (const seg of segments) {
			if (isEphemeralSegment(seg, ctx)) continue;
			if (isInterrogativeSentence(seg)) {
				this.heldQuestion = seg;
				continue;
			}
			out += seg;
		}
		return out;
	}

	private releaseHeldQuestion(): string {
		const held = this.heldQuestion;
		this.heldQuestion = "";
		return held;
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
