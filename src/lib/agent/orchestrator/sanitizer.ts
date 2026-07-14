import { isValidCpf, maskCpf } from "@/lib/conversation/identity";
import { normalizeAdministradora } from "./choose-offer";

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
// "vou usar a ferramenta"). NÃO incluímos "simular"/"ver" sozinhos — o prompt
// endossa narrações legítimas com conteúdo ("Vou simular a Rodobens com R$
// 900k:") e dropá-las seria falso-positivo. Conservador de propósito.
const PROCESS_ACTION_PATTERNS: RegExp[] = [
	/\bdeixa\s+eu\s+(buscar|puxar|procurar|pegar|consultar|usar)\b/i,
	/\bvou\s+(buscar|puxar|procurar|consultar)\b/i,
	/\bvou\s+usar\s+a\s+ferramenta\b/i,
	/\bpreciso\s+(primeiro\s+)?(buscar|puxar|procurar|consultar)\b/i,
];

// FIX-335 (rodada 2, veredito Sonnet — 4/4 dossiês web, "soam como log de
// pipeline"): o prompt já proíbe narrar MECÂNICA de ferramenta ("vou
// buscar"), mas "Agora vou <ação de produto>" escapa — não é mecânica, é
// ANÚNCIO DE PASSO ("Agora vou te recomendar a mais adequada:", "Agora vou
// detalhar como fica sua simulação:"). recomendar/destacar/detalhar/
// aprofundar como preâmbulo "(agora) vou/deixa eu" quase nunca carregam
// conteúdo por si (o modelo deveria só FAZER — dizer a recomendação direto,
// não anunciar que vai recomendar). mostrar/simular são mais arriscados
// (usados em narração legítima com entidade real, ver comentário acima) —
// só entram quando seguidos de um objeto VAGO ("a mais adequada", "a melhor
// opção", "como funciona em detalhes"), nunca um nome/número concreto.
const PRODUCT_STEP_ANNOUNCEMENT_PATTERNS: RegExp[] = [
	/\b(agora\s+)?(vou|deixa\s+eu)\s+(te\s+)?(recomendar|destacar|detalhar|aprofundar)\b/i,
	/\b(agora\s+)?(vou|deixa\s+eu)\s+(te\s+)?(mostrar|simular)\s+(a\s+mais\s+adequada|a\s+melhor\s+op[çc][ãa]o|como\s+funciona\s+em\s+detalhes)\b/i,
	/\bagora\s+d[áa]\s+uma\s+olhada\s+no\s+detalhe\b/i,
];

// Fillers de processo puros ("um segundo", "só um instante"). Ancorados no
// segmento inteiro pra NÃO pegar "tem um segundo grupo" (falso-positivo).
const PROCESS_FILLER_PATTERNS: RegExp[] = [
	/^\s*(um\s+segundo|s[óo]\s+um\s+(instante|segundo|minuto))\s*[:.!…]*\s*$/i,
];

export const PROCESS_PREAMBLE_PATTERNS: RegExp[] = [
	...PROCESS_ACTION_PATTERNS,
	...PROCESS_FILLER_PATTERNS,
	...PRODUCT_STEP_ANNOUNCEMENT_PATTERNS,
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

// FIX-334 (rodada 2, veredito Sonnet — dossiê imóvel, "Você tem a Itaú em
// destaque com score de 73%"): regressão contra decisão de produto já
// registrada (FIX-7, `score-label.ts`) — o card NUNCA mostra o % numérico de
// score, só o rótulo qualitativo ("boa compatibilidade"), porque "% numérico
// baixo mina a confiança". `executeRecommendGroups` parou de mandar o score
// cru pro modelo (ai-sdk.ts, só `scoreLabel`), mas essa é a barreira em CÓDIGO
// (Lei 4) — se o modelo inventar/lembrar um percentual mesmo assim, o
// segmento nunca chega ao usuário. Checa CO-OCORRÊNCIA na mesma sentença
// (já isolada por `splitSegments`) em vez de distância fixa de caracteres —
// "score"/"aderência"/"compatibilidade" + qualquer "N%" na mesma frase é
// sinal forte o bastante (falso positivo aceitável, mesmo padrão de
// conservadorismo do FIX-243/249 acima).
const SCORE_WORD_PATTERN = /\b(score|ader[êe]ncia|compatibilidade)\b/i;
const PERCENTAGE_PATTERN = /\d{1,3}\s*%/;

/** Um segmento cita score/aderência/compatibilidade como PERCENTUAL numérico
 * (proibido — FIX-7/FIX-334) — não pode virar bolha. */
export function isScorePercentageClaim(segment: string): boolean {
	const s = segment.trim();
	if (!s) return false;
	return SCORE_WORD_PATTERN.test(s) && PERCENTAGE_PATTERN.test(s);
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

// FIX-336 (bloco-c-whatsapp-invariantes, invariante I4 — "nunca prometer o que
// não aconteceu"): o agente afirmou "Sua proposta com a ITAÚ já saiu" e
// "Vou processar seu interesse agora pra gente fechar tudo certinho" sem
// NENHUMA linha em `bevi_proposals` pra conversa — a promessa mais cara de
// quebrar do produto. Mesma família do FIX-270 (Lei 1: o fato vem do banco,
// nunca da narrativa do LLM). A copy determinística pós-evento real
// (`signatureHandoffToWhatsApp`, "Sua proposta está pronta!... já está
// gerada") NUNCA passa por este sanitizer — é enviada fora do stream do
// modelo — então não há falso-positivo ali.
const PROPOSAL_COMPLETION_CLAIM_PATTERNS: RegExp[] = [
	/\bproposta\b[\s\S]{0,30}\bj[áa]\s+saiu\b/i,
	/\bsua\s+proposta\s+(est[áa]|ficou|j[áa]\s+est[áa])\s+pronta\b/i,
	/\bj[áa]\s+est[áa]\s+fechando\b[\s\S]{0,40}\bproposta\b/i,
	/\bproposta\s+(real\s+)?(j[áa]\s+)?(foi\s+)?(criada|gerada|confirmada)\b/i,
	/\bvou\s+processar\s+seu\s+interesse\b/i,
];

/** Um segmento afirma que a PROPOSTA já saiu/está pronta/foi criada (estado
 * COMPLETO) — só pode virar bolha se existir de fato uma linha em
 * `bevi_proposals` pra esta conversa. FIX-336. */
export function isProposalCompletionClaim(segment: string): boolean {
	const s = segment.trim();
	if (!s) return false;
	return PROPOSAL_COMPLETION_CLAIM_PATTERNS.some((rx) => rx.test(s));
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

// FIX-299 (loop-de-goal r10, P9/P10 — mesma transcrição, "Perfeito, kairo! ✅"):
// emoji sobrevivendo com modelo mais fraco apesar da regra de parcimônia do
// system-prompt (Lei 4 de novo — regra-no-prompt não segura sob carga). Strip
// determinístico, cobre os blocos Unicode de emoji mais comuns (emoticons,
// símbolos/pictogramas, transporte, dingbats, bandeiras, seletor de variação e
// ZWJ). Não mexe em acentuação pt-BR (Latin-1 Supplement/Latin Extended-A
// ficam fora de todas essas faixas).
const EMOJI_PATTERN =
	/[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{FE0F}\u{200D}]/gu;

/** Remove emoji de um texto de forma determinística (independe do modelo
 * obedecer a regra de parcimônia do prompt). Colapsa o espaço duplo deixado
 * pelo emoji removido, sem tocar em espaçamento de borda (join entre blocos).
 * FIX-299. */
export function stripEmoji(text: string): string {
	if (!text) return text;
	return text.replace(EMOJI_PATTERN, "").replace(/[ \t]{2,}/g, " ");
}

// FIX-337 (invariante I6, docs/jornada/decisoes-do-cliente.md — "dado
// sensível não trafega no WhatsApp"): defesa em profundidade da mesma
// barreira do formatter.ts (`scrubCpf`, whatsapp/formatter.ts) — o modelo
// pode ecoar o CPF em texto livre em qualquer canal ("Perfeito, anotei seu
// CPF: 529.982.247-25", dossiê auto-whatsapp t10). Mesmo candidato de captura
// de identify-capture.ts (extractCpf): qualquer sequência de dígitos, com ou
// sem pontuação, entre 9 e 17 chars. Só mascara o que VALIDA como CPF real
// (dígito verificador) — nunca outros números (valor, data, telefone).
const CPF_CANDIDATE_PATTERN = /\d[\d.\-\s]{9,17}\d/g;

/** Mascara qualquer sequência que valide como CPF real. Independe do modelo
 * obedecer a regra de não ecoar dado sensível (Lei 1/4). FIX-337. */
export function scrubCpf(text: string): string {
	if (!text) return text;
	return text.replace(CPF_CANDIDATE_PATTERN, (match) =>
		isValidCpf(match) ? maskCpf(match) : match,
	);
}

/** Fatos reais do turno/conversa contra os quais uma afirmação de estado é
 * verificada — NUNCA a narrativa do LLM (Lei 1/5). FIX-270. */
export type StateVerificationContext = {
	/** true só quando `meta.documentSlotsSent` tem upload confirmado de fato. */
	hasReceivedDocuments: boolean;
	/** true só quando uma tool de busca (search_groups/recommend_groups) já
	 * rodou neste turno até o ponto corrente do stream. */
	hasSearchToolCall: boolean;
	/** FIX-333 (rodada 2, veredito Sonnet rodada 1, loop-de-goal desamarra):
	 * true enquanto o gate `reco-consent` não foi respondido
	 * (`meta.recoConsentAnswered !== true`) — o hero (recommendation_card)
	 * ainda está pendente e o usuário não pode ver de qual oferta se trata. */
	recoConsentPending?: boolean;
	/** A oferta top-1 (maior score) já indexada NESTE turno a partir do
	 * tool-result real de `recommend_groups`/`search_groups` — nunca a
	 * narrativa do LLM. `null`/ausente enquanto a busca ainda não resolveu. */
	pendingTopOffer?: { administradora?: string; monthlyPayment?: number } | null;
	/** FIX-349 (P1.2, veredito rodada 4): TODAS as ofertas já indexadas neste
	 * turno (via `search_groups` OU `recommend_groups`), não só a de maior
	 * `rank`. O fluxo obrigatório do reveal chama `search_groups` e manda o
	 * modelo ANUNCIAR o resultado ANTES de chamar `recommend_groups` (o único
	 * que preenche `rank` — ver `pickBestRankedGroup`); nessa janela,
	 * `pendingTopOffer` ainda é `null`, mas a administradora/parcela de cada
	 * grupo JÁ é dado real (mesmo shape de `recommend_groups`). Sem esta
	 * lista, `isPrematureTopOfferClaim` fica cego pra qualquer narração
	 * baseada só no retorno de `search_groups` (achado ao vivo:
	 * imovel-whatsapp t6 / servicos-whatsapp t6, rodada 4). */
	pendingOffers?: Array<{ administradora?: string; monthlyPayment?: number }>;
	/** true só quando existe pelo menos uma linha em `bevi_proposals` pra esta
	 * conversa (fato do banco). FIX-336: o agente afirmou "Sua proposta com a
	 * ITAÚ já saiu" com `bevi_proposals` VAZIO pra conversa (I4 quebrado,
	 * dossiê auto-whatsapp t14/t17) — a criação da proposta é SEMPRE um evento
	 * determinístico fora do turno do LLM (startContract/fireContract), nunca
	 * a narrativa do próprio modelo. */
	hasProposal: boolean;
	/** FIX-342: administradoras REALMENTE exibidas nesta conversa até o ponto
	 * corrente (runner.ts — união do histórico persistido via
	 * `listShownOffersForConversation`, choose-offer.ts, com os grupos
	 * indexados NESTE turno, `revealGroupsById`). Fonte pra
	 * `isHallucinatedAdministradoraClaim` nunca confiar na narrativa do LLM pra
	 * saber quais ofertas existem (Lei 1/3). Ausente → o detector nunca dropa
	 * (compat retroativa). */
	shownAdministradoras?: string[];
};

/** Um segmento afirma estado (documento recebido / re-busca) sem o evento
 * real por trás — dropar. Sem contexto, nunca dropa (compat retroativa). */
function isFabricatedStateSegment(segment: string, ctx?: StateVerificationContext): boolean {
	if (!ctx) return false;
	if (isDocumentReceiptClaim(segment) && !ctx.hasReceivedDocuments) return true;
	if (isCatalogResearchClaim(segment) && !ctx.hasSearchToolCall) return true;
	if (isProposalCompletionClaim(segment) && !ctx.hasProposal) return true;
	return false;
}

// FIX-333 (rodada 2, veredito Sonnet rodada 1 — 4/4 dossiês web): o guard
// `hero-awaits-reco-consent` (artifact-guard.ts) suprime o CARD
// (recommendation_card) enquanto `reco-consent` não foi respondido — mas o
// MODELO já viu administradora/parcela/score do top-1 no tool-result de
// `recommend_groups` (mesmo turno) e narra em texto livre ("Tá aí a ITAÚ em
// destaque — parcela de R$ 3.549,75..."), teatro do consentimento: o usuário
// já sabe da recomendação antes de "ver" o card ou dizer sim. Regra-no-prompt
// ("seu texto deve introduzir, não comentar atributos específicos") já existe
// em directives.ts e é ignorada 4/4 vezes — barreira real é código (Lei 1/4):
// dropa qualquer segmento que cite a administradora ou o valor de parcela da
// oferta AINDA pendente de consentimento, goste o modelo ou não.
function formatMoneyVariants(value: number): string[] {
	const rounded = Math.round(value * 100) / 100;
	const [intPart, centsPart = "00"] = rounded.toFixed(2).split(".");
	const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
	return [`${withThousands},${centsPart}`, `${intPart},${centsPart}`];
}

// FIX-342 (P0, veredito Sonnet rodada 2, "P0.1 — alucinação de administradora
// inexistente"): o agente RECOMENDOU "Bradesco" (imóvel-web t8/t10) e
// "Estrela" (serviços-web t8-t12) — nenhuma das duas jamais esteve entre as
// ofertas REAIS retornadas pela Bevi nessas conversas; o usuário perseguiu a
// oferta fantasma por 4 turnos até o próprio agente admitir o erro. Os cards
// já são coagidos server-side (`coerceRevealCota`), mas o TEXTO do modelo
// não era — nada impedia a fala de citar uma administradora que não está nas
// ofertas da conversa. Regra-no-prompt não segura invariante (mesma classe de
// falha documentada em todo este arquivo, Lei 4) — a barreira real é código:
// a fala só pode citar uma administradora do mercado se ela estiver de fato
// em `ctx.shownAdministradoras` (runner.ts, fato — nunca a narrativa do LLM).
// Lista fechada de administradoras do mercado (gatilho da detecção) — nome
// fora dela nunca é bloqueado (falso-negativo aceitável, mesmo
// conservadorismo do FIX-243/249 acima: dado real da Bevi pode trazer
// administradora nova não listada aqui, e essa nunca deve ser barrada).
const KNOWN_MARKET_ADMINISTRADORAS = [
	"Bradesco",
	"Itaú",
	"Santander",
	"Caixa",
	"Porto",
	"Rodobens",
	"Âncora",
	"Canopus",
	"Embracon",
	"Estrela",
	"Tradição",
	"Banco do Brasil",
	"Magalu",
	"HS",
	"Servopa",
];

const KNOWN_MARKET_ADMINISTRADORA_PATTERNS = KNOWN_MARKET_ADMINISTRADORAS.map((name) => {
	const normalized = normalizeAdministradora(name);
	const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return { normalized, pattern: new RegExp(`\\b${escaped}\\b`) };
});

/** Um segmento cita uma administradora do MERCADO (lista fechada acima) que
 * NÃO está entre as ofertas REALMENTE exibidas nesta conversa
 * (`ctx.shownAdministradoras`) — entidade fabricada, não pode virar bolha.
 * Sem `shownAdministradoras` no contexto, nunca dropa (compat retroativa,
 * mesmo padrão do FIX-270/336 acima). FIX-342. */
export function isHallucinatedAdministradoraClaim(
	segment: string,
	ctx?: StateVerificationContext,
): boolean {
	if (!ctx?.shownAdministradoras) return false;
	const s = segment.trim();
	if (!s) return false;
	const normalizedSegment = normalizeAdministradora(s);
	const shown = ctx.shownAdministradoras.map(normalizeAdministradora);

	// FIX-345 — casar por CONTINÊNCIA, não por igualdade exata.
	//
	// A Bevi devolve os nomes como "ITAU CONSORCIOS" / "ANCORA ADMINISTRADORA",
	// e o mercado (e o usuário) chama de "ITAÚ" / "Âncora". Com `Set.has("ITAU")`
	// contra `{"ITAU CONSORCIOS"}` o resultado era `false` — e o guard DROPAVA a
	// citação VÁLIDA da ITAÚ. Ao vivo (rodada 3, servicos-web) o agente ficou mudo
	// sobre a própria recomendação e inventou uma desculpa ("tive um probleminha
	// pra renderizar os dados aqui"): o fix tinha trocado um bug por uma mentira.
	//
	// Uma administradora está "exibida" se o nome do mercado aparece DENTRO do
	// nome que a Bevi devolveu, ou vice-versa.
	const foiExibida = (nomeDeMercado: string) =>
		shown.some((exibida) => exibida.includes(nomeDeMercado) || nomeDeMercado.includes(exibida));

	return KNOWN_MARKET_ADMINISTRADORA_PATTERNS.some(
		({ normalized, pattern }) => !foiExibida(normalized) && pattern.test(normalizedSegment),
	);
}

/** FIX-349: `\b` nativo do JS só entende `[A-Za-z0-9_]` como caractere de
 * palavra — nomes reais de administradora com acento (ITAÚ, ÂNCORA, Tradição)
 * têm a letra acentuada tratada como NÃO-palavra, e o boundary desaparece bem
 * na borda do nome (ex.: `\bITAÚ\b` nunca fecha depois do "Ú"). Boundary
 * manual via lookaround Unicode-aware (`\p{L}`/`\p{N}`) entende qualquer
 * alfabeto e não deixa esses nomes escaparem do guard silenciosamente. */
function wholeWordRegex(literal: string): RegExp {
	const escaped = literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu");
}

/** Um segmento cita a administradora ou o valor de parcela de uma oferta REAL
 * (`offer`) — usado tanto pra `pendingTopOffer` quanto pra cada item de
 * `pendingOffers` (FIX-349). */
function segmentClaimsOffer(
	segment: string,
	offer: { administradora?: string; monthlyPayment?: number },
): boolean {
	if (offer.administradora && wholeWordRegex(offer.administradora).test(segment)) return true;
	if (typeof offer.monthlyPayment === "number" && offer.monthlyPayment > 0) {
		if (formatMoneyVariants(offer.monthlyPayment).some((v) => segment.includes(v))) return true;
	}
	return false;
}

/** Um segmento cita a administradora ou o valor de parcela de QUALQUER oferta
 * REAL já indexada neste turno ENQUANTO o consentimento (`reco-consent`)
 * ainda está pendente — não pode virar bolha. Sem oferta pendente conhecida
 * ou com consentimento já dado, nunca dropa (a comparison_table já mostra
 * administradora+parcela de TODAS as opções por design — só a narração em
 * texto corrido é vedada aqui).
 *
 * FIX-349: checa `pendingTopOffer` (a oferta de maior `rank`, quando
 * `recommend_groups` já rodou) E `pendingOffers` (TODAS as ofertas indexadas
 * até agora, mesmo só via `search_groups` — cobre a janela em que o modelo
 * narra a "melhor opção" ANTES de `recommend_groups` estabelecer o rank). */
export function isPrematureTopOfferClaim(segment: string, ctx?: StateVerificationContext): boolean {
	if (!ctx?.recoConsentPending) return false;
	if (ctx.pendingTopOffer && segmentClaimsOffer(segment, ctx.pendingTopOffer)) return true;
	if (ctx.pendingOffers?.some((offer) => segmentClaimsOffer(segment, offer))) return true;
	return false;
}

/** Segmento EFÊMERO: preâmbulo de processo (FIX-188), fallback técnico
 * (FIX-190), redução de prazo/reserva prematura/léxico banido (FIX-234),
 * taxa de contemplação (FIX-243), promessa de retorno proativo (FIX-249),
 * estado fabricado sem lastro real (FIX-270), narração do próprio mecanismo
 * interno (FIX-283), oferta top-1 revelada antes do reco-consent (FIX-333),
 * score/aderência em percentual numérico (FIX-334), administradora do
 * mercado fora das ofertas reais (FIX-342). Todos são dropados antes de
 * virar mensagem. */
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
		isFabricatedStateSegment(segment, ctx) ||
		isPrematureTopOfferClaim(segment, ctx) ||
		isScorePercentageClaim(segment) ||
		isHallucinatedAdministradoraClaim(segment, ctx)
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
	// FIX-299: strip de emoji determinístico, independe do modelo obedecer a
	// regra de parcimônia do prompt. FIX-337: scrub de CPF, mesma garantia.
	return scrubCpf(stripEmoji(kept.join("")));
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

	/** Fim REAL do turno: libera a cauda (última frase sem delimitador), também
	 * filtrada, seguido da pergunta segurada (se houver — FIX-298). Só chame
	 * isto no fim de verdade do turno — pra fronteiras INTERMEDIÁRIAS (troca de
	 * bloco, pré-tool-call), use `flushPending()`. */
	flush(): string {
		const rest = this.pending;
		this.pending = "";
		const out = rest ? this.filterComplete(rest) : "";
		return out + this.releaseHeldQuestion();
	}

	/** FIX-330 — mesma coisa que `flush()`, mas NUNCA libera a pergunta
	 * segurada (FIX-298). Usado nas fronteiras INTERMEDIÁRIAS do turno (troca
	 * de bloco multi-tool-call, pré-tool-call) — essas NÃO são o fim real do
	 * turno, e `flush()` ali liberava a pergunta cedo demais: achado ao vivo
	 * (dossiê Mario) — "Quer ajustar o valor do bem?" (bloco 1, antes de uma
	 * tool-call) escapava pro stream ANTES de "Você já fez consórcio antes?"
	 * (bloco final, gate real) — 2 perguntas no mesmo turno persistido, P4
	 * escapando pela ponta CONTRÁRIA do que `discardHeldQuestion` (FIX-326)
	 * cobre (lá a pergunta escapa DEPOIS do ponto de decisão; aqui, ANTES dele
	 * sequer existir). */
	flushPending(): string {
		const rest = this.pending;
		this.pending = "";
		return rest ? this.filterComplete(rest) : "";
	}

	/** Filtra um trecho COMPLETO (1+ segmentos fechados): dropa efêmero, segura
	 * a sentença interrogativa (FIX-298), limpa emoji (FIX-299) e mascara CPF
	 * (FIX-337) do que sobra. */
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
		return scrubCpf(stripEmoji(out));
	}

	private releaseHeldQuestion(): string {
		const held = this.heldQuestion;
		this.heldQuestion = "";
		return held ? scrubCpf(stripEmoji(held)) : "";
	}

	/** O modelo tem uma pergunta segurada pra este turno?
	 *
	 * SUBSTITUI o `discardHeldQuestion` (FIX-326), que JOGAVA FORA a pergunta do
	 * modelo quando um gate com pergunta canônica ia disparar — o modelo ficava
	 * mudo e o card falava sozinho, sempre com a mesma frase. Agora a prioridade é
	 * a inversa: a pergunta do MODELO vence, e é o CARD que deixa de repetir a
	 * dele (`modelAsked` no evento de gate). A regra do cliente ("nunca 2 perguntas
	 * no mesmo balão") continua valendo — só mudou quem cala. */
	hasHeldQuestion(): boolean {
		return this.heldQuestion.trim().length > 0;
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
