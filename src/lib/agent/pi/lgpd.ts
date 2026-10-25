// O ACEITE DA LGPD É FATO, NÃO AFIRMAÇÃO DO MODELO.
//
// O aviso vale UMA vez na conversa: se foi dito em qualquer turno, não se repete.
// Um "sim / pode / pode usar" do cliente DEPOIS do aviso é o aceite, conferido no
// histórico pelo servidor — não no `aceiteLgpd: true` que o modelo manda.
//
// Medido na conversa 92dfa1ba (dev, 25/10/2026): aviso dado dois turnos antes, no
// meio o agente pediu o celular. O check antigo olhava só a ÚLTIMA fala do agente,
// não achava o aviso, a tool recusava, o modelo repetia o aviso e o texto do turno
// saía duplicado. Este módulo é o que fecha isso.

export const AVISO_LGPD_RE = /bir[oô]s?\s+de\s+cr[eé]dito|conforme a\s+lgpd/i;

/** As palavras canônicas do aviso (mesma texto da skill `proposta-com-dados-do-cliente`). */
export const AVISO_LGPD =
	"Para gerar a sua proposta, a administradora consulta seu CPF nos birôs de crédito e usa seus dados só para isso, conforme a LGPD. Posso seguir?";

// O pedido de dado é um ATO: o verbo de pedir junto do dado, ou a pergunta pelo dado.
// Só a presença da palavra não basta — "atendemos pelo WhatsApp" ou "seu celular
// cadastrado" falam do dado, não pedem nada, e não podem ser trocados pelo aviso de
// consentimento (N04: o cliente que perguntou do canal recebia "Posso seguir?" sobre CPF).
const ATO_DE_PEDIR = String.raw`(?:me\s+)?(?:pass(?:a|e|ar|em|aria)|inform(?:a|e|ar|em|aria)|envi(?:a|e|ar|em|aria)|mand(?:a|e|ar|em|aria)|d[ií]g(?:a|am|o|z)|confirma(?:r|m|ria)?|precis(?:o|amos|a|am|ava|aria)|solicit(?:o|amos|a|am|ou)|compartilh(?:a|e|ar|em|aria)|cadastr(?:a|e|ar|em|aria)|ped(?:ir|imos)|pe[cç]o|pe[çc]a)`;
const DADO = String.raw`(?:cpf|celular|telefone|whats\s?app|n[uú]mero(?:\s+(?:do|da|de|seu|sua|teu|tua)){0,3}\s+(?:celular|telefone|whats\s?app))`;
// Na terceira pessoa o verbo descreve, não pede: "o contrato informa o telefone da
// administradora" não é coleta de dado. Sujeito na frente do verbo = descrição.
const SUJEITO = String.raw`(?<![oa]s?\s|ele\s|ela\s|eles\s|elas\s|que\s|isso\s|isto\s|voc[êe]s\s|contrato\s|proposta\s|sistema\s|banco\s|administradora\s|empresa\s)`;

/** O pedido de dado pessoal — CPF ou celular — que NÃO pode vir antes do aviso. */
export const PEDE_DADO_RE = new RegExp(
	[
		// "me passa seu CPF", "preciso do celular", "envie o número do WhatsApp"
		String.raw`\b${SUJEITO}${ATO_DE_PEDIR}\b[^.?!\n]{0,40}?\b${DADO}\b`,
		// "seu CPF, por favor", "o celular pra mim"
		String.raw`\b${DADO}\b[^.?!\n]{0,20}?\b(?:por\s+favor|pra\s+mim|para\s+mim|me\s+(?:passa|envia|manda|informa|diz))\b`,
		// pergunta pelo dado: "qual o seu CPF?", "qual é o seu celular com DDD?"
		String.raw`\b(?:qual|quais|como)\b[^.?!\n]{0,25}?\b${DADO}\b`,
	].join("|"),
	"i",
);

export type ResultadoDoAviso = {
	/** O texto que sai no balão: o aviso vem ANTES do pedido de dado. */
	texto: string;
	/** true quando o aviso foi acrescentado pelo harness (não pelo modelo). */
	avisoAdicionado: boolean;
	/** O pedido de dado da fala é adiado pro turno seguinte — o aceite vem primeiro. */
	pedidoAdiado: boolean;
};

/**
 * O AVISO VEM ANTES DO PEDIDO DE DADO — decidido no HARNESS, não no prompt.
 *
 * Se o aviso ainda não foi dado na conversa e a fala pede CPF ou celular, o aviso
 * ocupa a mensagem e o pedido de dado fica para depois do aceite. Frases que não
 * são o pedido continuam (acolhimento, explicação) — não se joga a fala fora.
 */
export function garanteAvisoLgpd(args: { texto: string; avisoJaDado: boolean }): ResultadoDoAviso {
	const texto = args.texto.trim();
	if (args.avisoJaDado) return { texto, avisoAdicionado: false, pedidoAdiado: false };
	if (!PEDE_DADO_RE.test(texto)) return { texto, avisoAdicionado: false, pedidoAdiado: false };

	const frases = texto.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
	const pediu = frases.some((f) => PEDE_DADO_RE.test(f));
	// O `resto` é só o que NÃO é pedido e NÃO é pergunta: se a pergunta sobrevive, o balão
	// sai com duas perguntas (a do aviso e a que o modelo escreveu), e o cliente responde a
	// errada.
	const resto = frases
		.filter((f) => !PEDE_DADO_RE.test(f) && !/[?!]\s*$/.test(f))
		.join(" ")
		.trim();
	// O aviso vem ANTES do resto: no dev o modelo escrevia "preciso do seu CPF. Para gerar
	// sua proposta, ... conforme a LGPD. Posso seguir?" — o pedido vinha na frente do aviso,
	// e o cliente respondia o pedido sem ter aceite nada.
	const saida = resto ? `${AVISO_LGPD}\n\n${resto}` : AVISO_LGPD;
	return { texto: saida, avisoAdicionado: true, pedidoAdiado: pediu };
}

const AFIRMATIVA_RE =
	/\b(sim|pode|podes|podem|posso|aceito|autorizo|autorizado|confirmo|claro|ok|beleza|de acordo)\b/gi;

/** Recusa explícita: "não", "não aceito", "prefiro não", "melhor não, obrigado". */
function ehRecusa(frase: string): boolean {
	const f = frase.toLowerCase().trim();
	// O "não" que acompanha um problema é aceite disfarçado: "não tem problema, pode usar".
	const problema = /^n[ãa]o\s+(?:tem|h[áa]|e\s+problema|me\s+importo|tenho\s+d[uú]vidas)\b/.test(f);
	if (!problema && /^(n[ãa]o|nunca|jamais|negativo|dispenso)\b/.test(f)) return true;
	return /\b(?:n[ãa]o\s+(?:aceito|autorizo|concordo|quero|pode|podes|prefiro|obrigad[oa]|vou|preciso)|prefiro\s+n[ãa]o|melhor\s+n[ãa]o|dispenso)\b/.test(
		f,
	);
}

/**
 * Pergunta não é aceite: "pode explicar?", "posso saber pra que vocês querem meu CPF?",
 * "o que é LGPD?". O "pode/posso" da pergunta não é o "pode" do sim.
 */
function ehPergunta(frase: string): boolean {
	const f = frase.trim();
	if (/\?\s*$/.test(f)) return true;
	return /^(?:o\s+que|que\s+(?:é|e|s[ãa]o)|qual|quais|quando|onde|como|por\s*que|porqu[êe]|pra\s+que|para\s+que|quem|quanto|posso\s+saber|pode(?:m)?\s+(?:me\s+)?(?:explicar|esclarecer|detalhar|dizer|falar)|voc[êe]s?\s+podem\s+(?:me\s+)?(?:explicar|esclarecer|detalhar))\b/i.test(
		f,
	);
}

/**
 * Resposta afirmativa do cliente. Negativa não vale ("não pode", "não autorizo") e
 * pergunta não vale ("pode explicar?"): aceite é o cliente DIZENDO sim.
 */
export function clienteAceitouLgpd(texto: string): boolean {
	const frases = texto.split(/(?<=[.!?;])\s+|\n+/).filter((f) => f.trim());
	let aceitou = false;
	for (const frase of frases) {
		// A recusa derruba a mensagem inteira: "sim, mas não aceito" não é aceite.
		if (ehRecusa(frase)) return false;
		if (ehPergunta(frase)) continue;
		for (const m of frase.matchAll(AFIRMATIVA_RE)) {
			const antes = frase.slice(Math.max(0, m.index - 24), m.index).toLowerCase();
			// "não" dentro da mesma frase também anula o sim ("não, pode" é recusa).
			if (/(n[ãa]o|negativo|jamais)\s*$/.test(antes)) continue;
			aceitou = true;
		}
	}
	return aceitou;
}

/* A REVOGAÇÃO É UMA FALA SOBRE A AUTORIZAÇÃO, NÃO SOBRE A OFERTA.
 *
 * Na main a recusa tem prioridade sobre o aceite (`contract-capture.ts:87`), e é por isso
 * que um "não autorizo" depois do "sim" derruba a autorização inteira. Mas a recusa que
 * revoga é a que fala do USO DO DADO: "não aceito o prazo de 80 meses" é recusa da oferta
 * — se ela revogasse o consentimento, toda negociação de prazo e parcela travaria a
 * proposta de um cliente que já autorizou.
 */
const REVOGA_RE =
	/\b(?:revogo|revogar|n[ãa]o\s+(?:autorizo|autorizei|aceito|concordo|permito)|n[ãa]o\s+(?:pode|podem|podes)\s+(?:usar|usem|consultar|consultem|guardar|guardem|compartilhar|compartilhem)|n[ãa]o\s+quero\s+(?:mais|que\s+(?:voc[êe]s\s+)?(?:usem|usar|consultem|consultar|guardem|guardar)))\b/i;

/** "não aceito o prazo de 80 meses": o objeto da recusa é a OFERTA, não a autorização. */
const RECUSA_DA_OFERTA_RE =
	/\bn[ãa]o\s+(?:aceito|autorizo|concordo|permito|quero)\s+(?:mais\s+)?(?:o|a|esse|essa|este|esta|aquele|aquela|um|uma)\s+(?:prazo|parcela|carta|plano|lance|valor|m[eê]s|meses|simula[cç][aã]o|oferta|op[cç][aã]o|administradora|embutido)\b/i;

/** O cliente revogou o consentimento que já tinha dado? Pergunta não revoga. */
function revogaConsentimento(texto: string): boolean {
	const frases = texto.split(/(?<=[.!?;])\s+|\n+/).filter((f) => f.trim());
	return frases.some((f) => !ehPergunta(f) && REVOGA_RE.test(f) && !RECUSA_DA_OFERTA_RE.test(f));
}

export type FalaDeLgpd = { role: "user" | "assistant"; content: string };

export type ResultadoDoAceite = {
	ok: boolean;
	/** `aceite-ja-registrado` | `aceite-do-cliente` | `aceite-revogado` | `aviso-nao-dado` | `falta-o-aceite` */
	motivo: string;
};

/**
 * O servidor resolve o aceite olhando a CONVERSA INTEIRA, não a última fala.
 *
 * `falaDoCliente` e `textoDoTurno` são o turno em curso (ainda não persistido):
 * o aviso dado nesta mesma fala conta, e a fala do cliente deste turno também.
 *
 * O consentimento é resolvido EM ORDEM CRONOLÓGICA: cada fala do cliente depois do
 * aviso pode dar ou tirar o aceite, e a ÚLTIMA que fala disso decide. Ler o primeiro
 * "sim" e parar ali autorizava a consulta de bureau mesmo depois de um "não autorizo"
 * (P262) — e o registro gravado, aceito sem conferir o que veio depois, escondia a
 * mesma revogação.
 */
export function resolverAceiteLgpd(args: {
	falas: readonly FalaDeLgpd[];
	falaDoCliente?: string | null;
	textoDoTurno?: string;
	aceiteJaGravado?: { em: string; fala: string } | null;
}): ResultadoDoAceite {
	const linha: FalaDeLgpd[] = [...args.falas];
	if (args.falaDoCliente) linha.push({ role: "user", content: args.falaDoCliente });
	if (args.textoDoTurno) linha.push({ role: "assistant", content: args.textoDoTurno });

	// O PRIMEIRO aviso é o que conta. O último já não servia: o modelo repete o aviso no
	// turno em curso (era o que ele fazia quando a tool recusava), e o aviso novo apagava
	// o sim que o cliente tinha dado antes dele.
	let avisoEm = -1;
	for (let i = 0; i < linha.length; i++) {
		if (avisoEm >= 0) break;
		if (linha[i].role === "assistant" && AVISO_LGPD_RE.test(linha[i].content)) avisoEm = i;
	}

	// O aceite gravado entra na linha do tempo como o primeiro "sim" conhecido — ele vale
	// até uma fala posterior do cliente revogá-lo.
	let consentiu: boolean | null = args.aceiteJaGravado ? true : null;
	let aceiteDaConversa = false;
	for (let i = 0; i < linha.length; i++) {
		const fala = linha[i];
		if (fala.role !== "user") continue;
		// Recusa tem prioridade sobre o aceite na MESMA fala ("não autorizo, sim" revoga).
		if (consentiu === true && revogaConsentimento(fala.content)) {
			consentiu = false;
			aceiteDaConversa = false;
			continue;
		}
		// Sem aviso na conversa, o "sim" não é aceite — é resposta a outra coisa.
		if (avisoEm >= 0 && i >= avisoEm && clienteAceitouLgpd(fala.content)) {
			consentiu = true;
			aceiteDaConversa = true;
		}
	}

	if (consentiu === true) {
		return { ok: true, motivo: aceiteDaConversa ? "aceite-do-cliente" : "aceite-ja-registrado" };
	}
	if (consentiu === false) return { ok: false, motivo: "aceite-revogado" };
	if (avisoEm < 0) return { ok: false, motivo: "aviso-nao-dado" };
	return { ok: false, motivo: "falta-o-aceite" };
}
