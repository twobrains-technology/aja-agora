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
/**
 * O texto PERGUNTA o nome da pessoa?
 *
 * Patterns observados em prod (comparados já sem acento):
 *   "como posso te chamar?" · "como te chamar?" · "como prefere ser chamado?"
 *   "qual seu nome?" · "me diz seu nome?" · "como voce se chama?"
 *
 * Extraída de `isLikelyNameResponse` porque tem um segundo uso, do outro lado
 * do turno: decidir se o CARD do gate `name` deve aparecer. Ver
 * `deveEmitirCardDeNome` (emit-card.ts) — o agente que pergunta o imóvel não
 * pode receber embaixo um campo pedindo o nome.
 */
export function perguntouONome(texto: string | undefined | null): boolean {
	const prev = stripAccents((texto ?? "").toLowerCase());
	return (
		// "chamado/chamada" além de "chamar": "como prefere ser chamado?" é uma das
		// formas que o agente mais usa e escapava da âncora original.
		/como\s+(te\s+|posso\s+(te\s+)?|prefere\s+ser\s+|gosta\s+de\s+ser\s+)?(chamar|chamad[oa]|chama)\b/.test(
			prev,
		) ||
		// FOLGA entre o possessivo e "nome" — até duas palavras.
		//
		// Os padrões antigos exigiam `seu nome` ADJACENTE, e a variação mais
		// natural que o modelo escreve escapava: ao vivo, ele perguntou "Qual é o
		// seu PRIMEIRO nome, pra eu poder te chamar?", o cliente respondeu
		// "Marina", o agente disse "Prazer, Marina!" — e o servidor emitiu embaixo
		// o card "Como posso te chamar?", pedindo de novo o que ela acabara de dar.
		//
		// A folga é a FORMA da pergunta, não mais uma instância dela: cobre
		// "seu primeiro nome", "seu nome completo", "teu nome de batismo". Somar
		// `/seu primeiro nome/` à lista consertaria só aquele caso e falharia no
		// seguinte — o "porta a porta" que o CLAUDE.md nomeia.
		//
		// O teto de duas palavras impede a folga de atravessar a frase: sem ele,
		// um "seu" no começo e um "nome" seis palavras depois casariam.
		/(seu|teu)(\s+\S+){0,2}\s+nome\b/.test(prev) ||
		/como\s+(voce\s+)?se\s+chama/.test(prev)
	);
}

/**
 * O texto pede o nome de forma INEQUÍVOCA — pergunta explícita, não menção.
 *
 * ── Por que existe um segundo predicado ─────────────────────────────────────
 *
 * `perguntouONome` (acima) tem três consumidores, e o custo do erro é oposto
 * entre eles:
 *
 *   `deveEmitirCardDeNome` e `isLikelyNameResponse` decidem TELA. Falso negativo
 *   custa a pergunta de nome em dobro no mesmo balão — o caso que o FIX-379
 *   descreve. Falso positivo custa MENOS, mas não custa zero: quando o modelo
 *   perguntou OUTRA coisa, ele faz o card sair junto ("…no nome da Embracon,
 *   tudo bem?" + campo de nome embaixo), roubando a resposta da pergunta que
 *   foi de fato feita — é o caso do Erik. Só no ramo em que o modelo não
 *   perguntou nada o custo é realmente nulo. A direção do erro é a benigna (um
 *   card um turno antes, contra um nome que não é capturado), e é isso que
 *   justifica o largo aqui — não a ausência de custo.
 *
 *   `captureAnswerNode` decide ESCRITA. Falso positivo custa um lead com nome
 *   errado chegando à mesa — o lead "Suv".
 *
 * Em 31/08/2026 os dois foram colapsados num predicado só, com a âncora
 * interrogativa aplicada a todos. O efeito, medido na revisão: cinco falsos
 * positivos viraram cinco falsos NEGATIVOS ("Seu nome?", "Me passa seu nome?",
 * "Preciso do seu nome pra seguir"), e essa cobertura a base tinha. Trocar a
 * pergunta duplicada por outra pergunta duplicada não é conserto.
 *
 * Então são dois. Este é o estreito, e ele é subconjunto do largo por
 * construção — nunca autoriza escrita sobre um turno que a tela nem reconheceu
 * como pedido (há teste travando isso).
 *
 * A âncora é a FORMA interrogativa antes do possessivo. É ela que separa
 * "Qual é o seu primeiro nome?" de "Vou deixar o seu plano no nome da
 * Embracon" — o vocabulário é o mesmo, a forma não. O corte em `[^?.!]` prende
 * a âncora à mesma oração: sem ele, um "qual" numa frase e um "seu nome" na
 * seguinte casariam.
 */
export function pediuONomeExplicitamente(texto: string | undefined | null): boolean {
	const prev = stripAccents((texto ?? "").toLowerCase());
	return (
		/como\s+(te\s+|posso\s+(te\s+)?|prefere\s+ser\s+|gosta\s+de\s+ser\s+)?(chamar|chamad[oa]|chama)\b/.test(
			prev,
		) ||
		/como\s+(voce\s+)?se\s+chama/.test(prev) ||
		/\b(qual|como|me\s+diz|me\s+diga|diga|dizer|informe|informa)\b[^?.!]{0,40}(seu|teu)(\s+\S+){0,2}\s+nome\b/.test(
			prev,
		)
	);
}

export function isLikelyNameResponse(args: {
	previousAssistantText: string | undefined;
	currentUserText: string;
	conversationContactName: string | null;
}): boolean {
	if (args.conversationContactName) return false;

	// Sem âncora de pergunta de nome no turno anterior → não força.
	if (!perguntouONome(args.previousAssistantText)) return false;

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

/**
 * O modelo JÁ pediu a identidade (CPF) na fala deste turno?
 *
 * Julgamento de 14/08: em 4 de 4 turnos de identidade, o cliente recebeu o
 * pedido DUAS vezes — a fala do modelo ("preciso do seu CPF e do seu celular,
 * a administradora exige…") e, colada, a pergunta canônica do canal
 * ("Pra eu trazer as ofertas reais das administradoras, preciso do seu CPF e
 * celular."). Idêntica nas quatro, em conversas diferentes: template, não
 * modelo. É o turno de maior atrito da jornada — pedir CPF em dobro é o pior
 * lugar possível para soar automático.
 *
 * `modelAsked` não pega este caso: ele responde "o modelo fez ALGUMA pergunta",
 * e o pedido de CPF quase nunca sai como pergunta ("preciso do seu CPF" é
 * afirmação). Aqui a checagem é do FATO específico — a palavra CPF está na fala
 * ou não está —, exatamente como `perguntouONome` faz para o nome.
 */
export function pediuIdentidade(texto: string | undefined | null): boolean {
	const t = stripAccents((texto ?? "").toLowerCase());
	return /\bcpf\b/.test(t);
}
