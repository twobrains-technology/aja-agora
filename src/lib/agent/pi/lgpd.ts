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
	/\b(sim|pode|podes|podem|posso|aceito|autorizo|autorizado|confirmo|claro|ok|beleza|de acordo)\b/i;

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

/* O LADO PERIGOSO É O ACEITE FALSO — e é ele que manda no desenho.
 *
 * Um aceite lido errado libera a consulta de bureau no CPF de quem só fez uma dúvida.
 * O erro contrário — não ver um aceite que existia — custa um turno: o modelo pergunta
 * de novo e o cliente responde "sim". É o princípio do `isQuestion` da main
 * (`src/lib/whatsapp/contract-capture.ts`, a2bc3024), conservador nos DOIS sentidos:
 * na dúvida, ninguém decide por regex — quem responde é o modelo.
 *
 * Três regras simples sobre a FRASE (a pontuação original fica; oração não se separa):
 *   1. a frase tem "?" .......................... não é aceite
 *   2. a frase abre/contém interrogativa ......... não é aceite
 *   3. a frase tem recusa ........................ não é aceite
 * Aceite é a frase que passa pelas três e casa o padrão afirmativo.
 *
 * Por que não se separa oração: a rodada 5 mostrou que atribuir o "?" só à última
 * parte de "Vocês podem consultar meu CPF e vender meus dados?" deixava o "podem" da
 * primeira parte virar autorização (P262).
 */

/** A fala em FRASES, com a pontuação original no fim de cada uma. */
const FIM_DE_FRASE_RE = /(?<=[.!?…])\s+|\n+/;

function frasesDe(texto: string): string[] {
	return texto
		.split(FIM_DE_FRASE_RE)
		.map((frase) => frase.trim())
		.filter(Boolean);
}

/** A interrogativa que ABRE a frase — é o `isQuestion` da main, com duas adições
 * medidas aqui: `podem` e `vocês`. Quem abre falando com a empresa ("podem consultar
 * meu CPF", "vocês consultam meu CPF") está perguntando, e no WhatsApp a pergunta
 * costuma vir sem "?"; o aceite do cliente abre com "pode", "sim", "ok" — e
 * "sim, podem usar" continua aceite, porque a regra é ancorada no COMEÇO da frase. */
const ABRE_COMO_PERGUNTA_RE =
	/^(?:o\s+que|que\s+(?:é|e|s[ãa]o)|por\s?que|porqu[êe]|pq|qual|quais|quanto|quantos|quando|como|onde|quem|tem\s|teria|e\s+se|ser[áa]|seria|d[áa]\s+pra|posso\s+saber|pode(?:m)?\s+(?:me\s+)?(?:explicar|esclarecer|detalhar|dizer|falar)|podem\b|voc[êe]s\b)\b/i;

/** A interrogativa no MEIO da frase também é pergunta: "… e QUANTO precisaria de
 * lance?" virou aceite na main (2026-07-21) porque só se olhava o começo. */
const INTERROGATIVA_NO_MEIO_RE =
	/\b(quanto|quantos|qual|quais|como\s+fica|e\s+se|ser[áa]\s+que|seria)\b/i;

/** Pedido de PAUSA: quem diz "pera" está freando, não aceitando. */
const PEDIDO_DE_PAUSA_RE = /\b(pera[ií]?|espera|calma|antes\s+de|só\s+um|aguenta|segura)\b/i;

/** Esta frase é uma PERGUNTA? Na dúvida, sim — pergunta não aceita nada. */
function ehPergunta(frase: string): boolean {
	const s = frase.trim();
	if (s.includes("?")) return true;
	if (ABRE_COMO_PERGUNTA_RE.test(s)) return true;
	if (INTERROGATIVA_NO_MEIO_RE.test(s)) return true;
	return PEDIDO_DE_PAUSA_RE.test(s);
}

/**
 * Resposta afirmativa do cliente. Negativa não vale ("não pode", "não autorizo") e
 * pergunta não vale ("pode explicar?"): aceite é o cliente DIZENDO sim — numa frase
 * que não pergunta nada.
 */
export function clienteAceitouLgpd(texto: string): boolean {
	// A revogação derruba o aceite da fala inteira: "sim, mas revogo a autorização"
	// não autoriza nada.
	if (revogaConsentimento(texto)) return false;
	const frases = frasesDe(texto);
	// A recusa derruba a mensagem inteira: "sim, mas não aceito" não é aceite.
	if (frases.some(ehRecusa)) return false;
	return frases.some((frase) => !ehPergunta(frase) && AFIRMATIVA_RE.test(frase));
}

/* A REVOGAÇÃO É O LADO SEGURO — e por isso é o único que atravessa a pergunta.
 *
 * "Não autorizo consultar meu CPF, podemos seguir sem isso?" é uma fala com uma
 * revogação e uma pergunta: se a pergunta apagasse a revogação, a consulta de bureau ia
 * em frente depois de um "não autorizo" explícito (P262, rodadas 4 e 5). Aqui, uma
 * declaração de revogação derruba o consentimento em qualquer lugar da fala.
 *
 * O que a revogação NÃO pode é nascer de uma recusa da OFERTA: na main a recusa tem
 * prioridade sobre o aceite (`contract-capture.ts:87`), mas "não aceito o prazo de 80
 * meses" fala da carta, não do uso do dado — e travaria toda negociação de prazo de um
 * cliente que já autorizou. A fronteira é o OBJETO da negação, não a oração: recusar
 * prazo/parcela/carta não revoga; negar o uso do dado revoga, mesmo ao lado da recusa.
 *
 * E o verbo vale só na PRIMEIRA PESSOA do presente, a forma de quem declara: o
 * infinitivo é dúvida ("posso revogar isso depois?") e o subjuntivo é hipótese ("se eu
 * não autorizar a consulta, o que acontece?"). Hipótese não revoga.
 */
const REVOGA_OS_DADOS: readonly RegExp[] = [
	// "revogo a autorização", "revogamos o consentimento"
	/\brevogo\b|\brevogamos\b/i,
	// "não autorizo", "não autorizei", "não autorizamos"
	/\bn[ãa]o\s+(?:autorizo|autorizei|autorizamos)\b/i,
	/\bn[ãa]o\s+permito\b/i,
	/\bn[ãa]o\s+concordo\s+com\s+(?:o|a)\s+(?:uso|consulta|compartilhamento)\b/i,
	// "não pode usar meu CPF", "não podem consultar", "não podes guardar"
	/\bn[ãa]o\s+(?:pode|podem|podes)\s+(?:mais\s+)?(?:usar|usem|consultar|consultem|guardar|guardem|compartilhar|compartilhem)\b/i,
	// "não quero mais que vocês consultem", "não quero guardar meus dados"
	/\bn[ãa]o\s+quero\s+(?:mais\s+)?(?:que\s+(?:voc[êe]s\s+)?)?(?:usem|usar|consultem|consultar|guardem|guardar|compartilhem|compartilhar)\b/i,
	// "não vou autorizar", "não vou mais permitir"
	/\bn[ãa]o\s+(?:vou|vamos)\s+(?:mais\s+)?(?:autorizar|permitir|deixar)\b/i,
	// "não aceito que consultem", "não aceito a consulta do meu CPF"
	/\bn[ãa]o\s+aceito\s+(?:que\s+|a\s+|o\s+|as\s+|os\s+)?(?:consult\w+|us\w+|guard\w+|compartilh\w+|autoriza\w+)\b/i,
];

/** O cliente revogou o consentimento que já tinha dado? Basta UMA declaração. */
function revogaConsentimento(texto: string): boolean {
	return REVOGA_OS_DADOS.some((re) => re.test(texto));
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
