// O ACEITE DA LGPD É FATO, NÃO AFIRMAÇÃO DO MODELO.
//
// O aviso vale UMA vez na conversa: se foi dito em qualquer turno, não se repete.
// Um "sim / pode / pode usar" do cliente DEPOIS do aviso é o aceite, conferido no
// histórico pelo servidor — não no `aceiteLgpd: true` que o modelo manda.
//
// O ACEITE É LISTA DE PERMISSÃO (rodada 6): só aceita a mensagem que passa por todas
// as travas e casa a forma POSITIVA estreita. Tudo o mais é "ainda não" — nunca
// "autorizado". O desenho e o porquê estão em `clienteAceitouLgpd`.
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

/* O LADO PERIGOSO É O ACEITE FALSO — e o desenho dele é o que manda no resto do módulo.
 *
 * Um aceite lido errado libera a consulta de bureau no CPF de quem só fez uma dúvida ou
 * uma recusa. O erro contrário — não ver um aceite que existia — custa um turno: o
 * modelo pergunta de novo e o cliente responde "sim".
 *
 * LISTA DE PERMISSÃO, não de bloqueio. As rodadas 4, 5 e 6 fecharam as negações UMA A
 * UMA e o auditor achou outra forma a cada rodada ("não estou de acordo", "não preciso
 * do seu CPF", "faltam 30 mil"): bloqueio nunca fecha, porque quem fala português
 * sempre arruma uma forma que ninguém enumerou. O lado perigoso só acontece quando a
 * mensagem inteira passa por todas as travas E casa a forma positiva, e essa forma é
 * estreita. Qualquer outra coisa cai no lado SEGURO: o aceite fica pendente, o modelo
 * pergunta de novo, e a consulta de bureau não sai.
 *
 * A decisão é a da main (`decideConfirmStage` em `src/lib/whatsapp/contract-capture.ts`,
 * a2bc3024), lida sobre a MENSAGEM INTEIRA — não se separa frase nem oração:
 *   0. revogação do consentimento ....... não aceita (o lado seguro, que atravessa até
 *      a pergunta: "não autorizo, podemos seguir sem isso?")
 *   1. pergunta ......................... não aceita
 *   2. negação/recusa ................... não aceita
 *   3. forma positiva do aceite ......... aceita
 *   4. qualquer outra coisa ............. não aceita
 */

/** A interrogativa que ABRE a mensagem — o `isQuestion` da main, com as duas adições
 * medidas nesta casa: `podem`/`vocês` abrindo a fala (quem abre falando com a empresa
 * está perguntando, e no WhatsApp a pergunta costuma vir sem "?") e o pedido de
 * explicação sem "?" ("pode me explicar como funciona"). As duas só AMPLIAM o que é
 * pergunta, e pergunta nunca aceita — não abrem o lado perigoso. */
const ABRE_COMO_PERGUNTA_RE =
	/^(?:o\s+que|que\s+(?:é|e|s[ãa]o)|por\s?que|porqu[êe]|pq|qual|quais|quanto|quantos|quando|como|onde|quem|tem\s|teria|e\s+se|ser[áa]|seria|d[áa]\s+pra|posso\s+saber|pode(?:m)?\s+(?:me\s+)?(?:explicar|esclarecer|detalhar|dizer|falar)|podem\b|voc[êe]s\b)\b/i;

/** A interrogativa no MEIO da mensagem também é pergunta: "… e QUANTO precisaria de
 * lance?" virou aceite na main (2026-07-21) porque só se olhava o começo. */
const INTERROGATIVA_NO_MEIO_RE =
	/\b(quanto|quantos|qual|quais|como\s+fica|e\s+se|ser[áa]\s+que|seria)\b/i;

/** Pedido de PAUSA: quem diz "pera" está freando, não aceitando. */
const PEDIDO_DE_PAUSA_RE = /\b(pera[ií]?|espera|calma|antes\s+de|só\s+um|aguenta|segura)\b/i;

/** A mensagem INTEIRA é uma pergunta? Na dúvida, sim — pergunta não aceita nada. */
function ehPergunta(texto: string): boolean {
	const s = (texto ?? "").trim();
	if (s.includes("?")) return true;
	if (ABRE_COMO_PERGUNTA_RE.test(s)) return true;
	if (INTERROGATIVA_NO_MEIO_RE.test(s)) return true;
	return PEDIDO_DE_PAUSA_RE.test(s);
}

/** A recusa da main (`CANCEL_RE` de `contract-capture.ts`, literal) — recusa tem
 * prioridade sobre o aceite: "quero ver outras" contém "quero". */
const RECUSA_RE =
	/\b(n[ãa]o|outras?|outra op|ver mais|mais op|compar|cancel|depois|espera|agora n[ãa]o|talvez)\b/i;

/** A TRAVA GERAL, na mensagem inteira: qualquer negação, em qualquer lugar, impede o
 * aceite. É o que pega a forma que ninguém enumerou — "ainda não estou de acordo",
 * "nem sei", "jamais autorizo", "sim, mas só se não venderem meus dados". */
const NEGACAO_NA_MENSAGEM_RE = /\b(n[ãa]o|nem|nunca|jamais)\b/i;

/** A FORMA POSITIVA do aceite — estreita de propósito: só o que, dito pelo cliente,
 * autoriza a consulta de bureau. Ficam de fora os verbos que abrem dúvida no domínio do
 * dado, inclusive o `\bquero\b` e o `confirm\w*` do `AFFIRM_RE` da main, onde o
 * "quero" já criou proposta real por uma dúvida (`contract-capture.ts:137-142`):
 * "quero entender como vocês usam meu CPF", "deixa eu confirmar com a esposa". */
const ACEITE_RE =
	/\b(sim|pode|podes|podem|aceito|autorizo|autorizado|confirmo|confirmado|claro|ok|beleza|de acordo|com certeza|positivo)\b/i;

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

/**
 * O cliente AUTORIZOU o uso dos dados? Só a mensagem que não revoga, não pergunta, não
 * nega, não recusa e casa a forma positiva estreita do aceite. Qualquer outra fala
 * responde `false` — e `false` aqui não é "recusou", é "ainda não": quem repergunta é
 * o modelo, no turno seguinte.
 */
export function clienteAceitouLgpd(texto: string): boolean {
	// A revogação derruba a fala inteira: "sim, mas revogo a autorização" não autoriza.
	if (revogaConsentimento(texto)) return false;
	if (ehPergunta(texto)) return false;
	// A trava geral vem antes da recusa enumerada: ela é o que fecha o lado perigoso.
	if (NEGACAO_NA_MENSAGEM_RE.test(texto)) return false;
	if (RECUSA_RE.test(texto)) return false;
	return ACEITE_RE.test(texto);
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
