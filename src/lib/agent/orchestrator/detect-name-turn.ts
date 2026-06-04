/**
 * Detector heurístico: o turn atual é "user respondeu com nome"?
 *
 * Quando esse padrão é detectado, o orchestrator FORÇA a tool
 * `save_contact_name` via `toolChoice: { type: "tool", toolName: ... }`
 * passado pro `streamText`. Anthropic então obriga o modelo a chamar a
 * tool — não depende de obediência ao prompt.
 *
 * Contexto do bug (tb-dev pós-deploy 6b10312, 2026-05-18/19): regras
 * duras no prompt ("ANTES de saudar com nome, OBRIGATÓRIO chamar
 * save_contact_name") foram ignoradas pelo Claude Sonnet 4-6. Variantes
 * curtas (e.g. "Prazer, Paulo!") escaparam da lista de variantes longas.
 * A defesa de prompt sozinha não foi suficiente — código tem que forçar.
 *
 * Heurística (cumulativa — todas as condições têm que valer):
 *   1. `conversationContactName` ainda é NULL (sem isso já temos o nome
 *      persistido — não força).
 *   2. O turn anterior do agent foi uma pergunta de nome ("como te chamar?"
 *      / "seu nome?" / "qual é seu nome?"). Sem essa âncora corremos
 *      risco de forçar a tool em mensagens curtas que não são nome
 *      (e.g. "oi", "sim", "carro").
 *   3. A mensagem atual do user é curta (≤4 palavras, ≤50 chars).
 *   4. A mensagem só contém letras unicode, espaços, apóstrofo ou hífen
 *      (sem dígitos, URL, símbolos). Nome humano básico.
 *
 * Implementação isolada pra ter unit test puro (sem mock de orchestrator
 * inteiro).
 */
export function isLikelyNameResponse(args: {
	previousAssistantText: string | undefined;
	currentUserText: string;
	conversationContactName: string | null;
}): boolean {
	if (args.conversationContactName) return false;

	// Normaliza acentos pra comparar regex sem ç/ã/é (mais robusto).
	const prev = stripAccents((args.previousAssistantText ?? "").toLowerCase());
	// Sem âncora de pergunta de nome no turno anterior → não força.
	// Patterns observados em prod (já com acentos removidos):
	//   - "como posso te chamar?"
	//   - "como te chamar?"
	//   - "como prefere ser chamado?"
	//   - "qual seu nome?"
	//   - "me diz seu nome?"
	//   - "como voce se chama?"
	const askedForName =
		/como\s+(te\s+|posso\s+(te\s+)?|prefere\s+ser\s+)?chamar/.test(prev) ||
		/qual.{0,20}seu\s+nome/.test(prev) ||
		/(seu|teu)\s+nome\??/.test(prev) ||
		/como\s+(voce\s+)?se\s+chama/.test(prev);
	if (!askedForName) return false;

	const txt = args.currentUserText.trim();
	if (txt.length === 0 || txt.length > 50) return false;

	const words = txt.split(/\s+/).filter(Boolean);
	if (words.length === 0 || words.length > 4) return false;

	// Heurística de "parece nome": apenas letras unicode (acentos OK),
	// espaços, apóstrofo (D'Avila) ou hífen (Maria-Clara). Sem dígitos,
	// URL, "@", "?", "!" etc.
	if (!/^[\p{L}\s'-]+$/u.test(txt)) return false;

	// Blacklist de PRIMEIRA palavra: verbos/pronomes/saudações comuns em PT
	// que indicam que a mensagem NÃO é "só nome" — mesmo que ≤4 palavras e
	// só letras. Sem isso, "Quero comprar carro" forçaria save_contact_name
	// com name="Quero" (UX quebra).
	//
	// "Sou", "Me" e "Pode" SÃO permitidos como prefixo de NOME ("Sou Paulo",
	// "Me chamo Marina", "Pode me chamar de Kairo") — só barramos quando a
	// frase inteira não cheira a nome.
	const firstWord = stripAccents(words[0].toLowerCase());
	const blacklistFirstWord = new Set([
		"quero",
		"queria",
		"quer",
		"preciso",
		"vou",
		"posso",
		"oi",
		"ola",
		"olha",
		"bom",
		"boa",
		"sim",
		"nao",
		"talvez",
		"tudo",
		"obrigado",
		"obrigada",
		"valeu",
		"opa",
		"hey",
		"hello",
		"hola",
		"qual",
		"quanto",
		"quando",
		"onde",
		"porque",
		"como",
		"ok",
	]);
	if (blacklistFirstWord.has(firstWord)) return false;

	return true;
}

function stripAccents(s: string): string {
	// NFD decompõe acentos, daí filtramos os combining marks (U+0300–U+036F).
	return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}
