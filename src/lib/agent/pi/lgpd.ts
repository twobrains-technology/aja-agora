// O ACEITE DA LGPD É FATO, NÃO AFIRMAÇÃO DO MODELO.
//
// O aviso vale UMA vez na conversa: se foi dito em qualquer turno, não se repete.
// Um "sim / pode / pode usar" do cliente DEPOIS do aviso é o aceite, conferido no
// histórico pelo servidor — não no `aceiteLgpd: true` que o modelo manda.
//
// O ACEITE É A DECISÃO LITERAL DA MAIN (rodada 7): juiz = decideConfirmStage da main;
// a trava só estreita (nunca cria aceite), então não pode produzir o lado perigoso. Em
// `lgpd.ts` não há forma positiva própria — "de acordo", "concordo", "autorizo" como lista
// de aceite eram juiz próprio, e é isso que abre o caso que o auditor mediu. O desenho e o
// porquê estão em `clienteAceitouLgpd`.
//
// Medido na conversa 92dfa1ba (dev, 25/10/2026): aviso dado dois turnos antes, no
// meio o agente pediu o celular. O check antigo olhava só a ÚLTIMA fala do agente,
// não achava o aviso, a tool recusava, o modelo repetia o aviso e o texto do turno
// saía duplicado. Este módulo é o que fecha isso.

import { decideConfirmStage } from "@/lib/whatsapp/contract-capture";

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
 * O JUIZ É A MAIN, LITERAL. Rodadas 4, 5 e 6 fecharam as negações UMA A UMA e o auditor
 * achou outra forma a cada rodada ("não estou de acordo", "não preciso do seu CPF",
 * "faltam 30 mil"): lista de bloqueio nunca fecha, porque quem fala português sempre
 * arruma uma forma que ninguém enumerou. Desde a rodada 7 o aceite é a decisão da main
 * (`decideConfirmStage` em `src/lib/whatsapp/contract-capture.ts`, a2bc3024), lida sobre a
 * MENSAGEM INTEIRA — não se separa frase nem oração:
 *   0. revogação do consentimento ....... não aceita (o lado seguro, que atravessa até
 *      a pergunta: "não autorizo, podemos seguir sem isso?")
 *   1. pergunta ......................... não aceita (`isQuestion` da main)
 *   2. negação/recusa ................... não aceita (`CANCEL_RE` da main)
 *   3. forma afirmativa .................. aceita (`AFFIRM_RE` da main), se a TRAVA abaixo
 *      não estreitar
 *   4. qualquer outra coisa ............. não aceita
 *
 * A TRAVA SÓ ESTREITA: ela tira aceite e nunca acrescenta — por isso não pode abrir o lado
 * perigoso. O que ela fecha é o caso medido pelo auditor em P262, rodada 7, e as formas de
 * dúvida que o `AFFIRM_RE` da main aceita: "Estou verificando se o termo está de acordo com
 * a LGPD.", "Quero entender como vocês usam meu CPF", "Nem sei se quero isso", "deixa eu
 * confirmar com a esposa". Na main essas três casam o afirmativo e viram proposta real por
 * uma dúvida — o próprio comentário da main registra isso (`contract-capture.ts:137-142`);
 * no domínio do dado, dúvida não é consentimento, e o erro para o lado seguro custa só um
 * turno: o modelo repergunta.
 */

/** A TRAVA DO ACEITE — SÓ ESTREITA. O juiz é `decideConfirmStage` da main; esta regex não
 * cria aceite, ela tira aceite: negação em qualquer ponto da mensagem, e o verbo de
 * dúvida/verificação — falar DO termo não é consentir a ele. É o que fecha o caso medido
 * pelo auditor (P262, rodada 7): "Estou verificando se o termo está de acordo com a LGPD.",
 * "Quero entender como vocês usam meu CPF", "Nem sei se quero isso", "deixa eu confirmar com
 * a esposa". Uma trava só estreita nunca produz o lado perigoso.
 */
const TRAVA_DO_ACEITE_RE =
	/\b(n[ãa]o|nem|nunca|jamais)\b|\b(entender|saber|como|deixa eu|vou ver|pensar|confirmar com|verificando|verificar)\b/i;

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
 * O cliente AUTORIZOU o uso dos dados? O juiz é a decisão literal da main, lida sobre a
 * mensagem inteira, e a `TRAVA_DO_ACEITE_RE` só estreita o que ela aceita. Qualquer outra
 * fala responde `false` — e `false` aqui não é "recusou", é "ainda não": quem repergunta é
 * o modelo, no turno seguinte.
 */
export function clienteAceitouLgpd(texto: string): boolean {
	// A revogação derruba a fala inteira: "sim, mas revogo a autorização" não autoriza.
	if (revogaConsentimento(texto)) return false;
	// O juiz é a função da main — nada em `lgpd.ts` decide o aceite.
	// O retorno é uma união: `outcome` só existe quando a main decidiu algo (`handled`).
	const decisao = decideConfirmStage(texto);
	if (!decisao.handled || decisao.outcome !== "fire") return false;
	// A trava só tira aceite: nunca cria o lado perigoso.
	return !TRAVA_DO_ACEITE_RE.test(texto);
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
 *
 * O ACEITE É DO ESTÁGIO, como na main (P262, rodada 8): sem coleta de contratação
 * ativa, `src/lib/whatsapp/contract-capture.ts:161` retorna sem decidir e a confirmação
 * é processada em `:200` — a fala só é lida como resposta ao pedido de autorização.
 * Aqui o estágio abre no aviso e a ÚNICA fala que decide o aceite é a primeira fala do
 * cliente depois dele: a resposta de qualificação ("Quero um carro de 80 mil.") casa o
 * `quero` do `AFFIRM_RE` da main, mas responde a OUTRA pergunta do agente e por isso não
 * pode virar aceite retroativo. O estágio fecha para o aceite e reabre quando o agente
 * repete o aviso; a REVOGAÇÃO não é do estágio — ela derruba o consentimento vindo de
 * qualquer fala, porque é o lado seguro. O juiz continua `decideConfirmStage` + trava.
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

	// O aceite gravado entra na linha do tempo como o primeiro "sim" conhecido — ele vale
	// até uma fala posterior do cliente revogá-lo.
	let consentiu: boolean | null = args.aceiteJaGravado ? true : null;
	let aceiteDaConversa = false;
	// O estágio: aberto pela fala do agente com o aviso, fechado pela primeira fala do
	// cliente que o responde. Dentro dele só essa primeira fala é candidata — o aceite que
	// ela deu continua valendo (quem o derruba é a revogação), e a repetição do aviso reabre
	// o estágio para um novo aceite.
	let avisoEm = -1;
	let esperandoARespostaDoCliente = false;

	for (let i = 0; i < linha.length; i++) {
		const fala = linha[i];
		if (fala.role === "assistant") {
			if (!AVISO_LGPD_RE.test(fala.content)) continue;
			if (avisoEm < 0) avisoEm = i;
			esperandoARespostaDoCliente = true;
			continue;
		}

		const candidata = esperandoARespostaDoCliente;
		if (candidata && clienteAceitouLgpd(fala.content)) {
			consentiu = true;
			aceiteDaConversa = true;
		}
		// Recusa tem prioridade sobre o aceite na MESMA fala ("não autorizo, sim" revoga),
		// e a revogação de uma fala posterior derruba o aceite que o estágio deu.
		if (consentiu === true && revogaConsentimento(fala.content)) {
			consentiu = false;
			aceiteDaConversa = false;
		}
		if (candidata) esperandoARespostaDoCliente = false;
	}

	if (consentiu === true) {
		return { ok: true, motivo: aceiteDaConversa ? "aceite-do-cliente" : "aceite-ja-registrado" };
	}
	if (consentiu === false) return { ok: false, motivo: "aceite-revogado" };
	if (avisoEm < 0) return { ok: false, motivo: "aviso-nao-dado" };
	return { ok: false, motivo: "falta-o-aceite" };
}
