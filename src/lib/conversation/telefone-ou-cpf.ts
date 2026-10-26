// TELEFONE ou CPF? — a regra ÚNICA, importada pelos dois capturadores: o do
// WhatsApp (`src/lib/whatsapp/identify-capture.ts`) e o do Pi
// (`src/lib/agent/pi/turno-livre.ts`). Antes cada um tinha a sua cópia, e a
// cópia do Pi aceitava qualquer sequência de 11 dígitos com DV de CPF (L11/P188).
//
// O número que motiva o módulo: `11900000083` é celular de São Paulo (DDD 11 +
// 9º dígito) E passa no dígito verificador do CPF, como ~1% dos celulares. Lido
// como CPF, ele custa o telefone que o cliente acabou de ditar e grava um CPF
// que não é o dele (P263).
//
// A distinção é ESTRUTURAL — DDD em uso + 9 + 8 dígitos —, e o que faz um número
// desses virar CPF é o CONTEXTO da fala, o comportamento da `main`
// (`a2bc3024:src/lib/whatsapp/identify-capture.ts:183`): o cliente DECLARA o
// dado (a palavra "cpf" no texto, ou o CPF formatado, que não existe como
// telefone) ou o agente acabou de PEDIR o CPF (`pedidoDeCpf`). Fora desse
// contexto, o número com cara de celular continua telefone.
//
// O PEDIDO do agente é um PERMISSÃO, não um bloqueio (rodada 6 da auditoria):
// ele só existe quando o balão casa uma forma POSITIVA estreita — a última frase
// que fala do dado CASA UM DOS MOLDES do pedido E o balão inteiro passa nas travas
// gerais (negação, outro contato, constatação, adiamento). Qualquer outra coisa
// cai no lado seguro: o número fica telefone e o modelo pede o CPF de novo no
// turno seguinte. O detalhe das duas condições está em
// `pedidoDeCpfNoUltimoBalao`, no fim deste arquivo.

import { isValidCpf } from "@/lib/conversation/identity";

/** DDDs em uso no Brasil (Anatel) — LISTA FECHADA, não faixa. A faixa antiga
 *  rejeitava 21/22/24/27/28 (RJ e ES, DDDs reais) e aceitava 26/30/36/39, que não
 *  existem. Fora desta lista, 11 dígitos não são telefone — é o que separa o CPF
 *  `028…` de um celular ditado. */
const DDD_VALIDOS: ReadonlySet<string> = new Set([
	"11",
	"12",
	"13",
	"14",
	"15",
	"16",
	"17",
	"18",
	"19",
	"21",
	"22",
	"24",
	"27",
	"28",
	"31",
	"32",
	"33",
	"34",
	"35",
	"37",
	"38",
	"41",
	"42",
	"43",
	"44",
	"45",
	"46",
	"47",
	"48",
	"49",
	"51",
	"53",
	"54",
	"55",
	"61",
	"62",
	"63",
	"64",
	"65",
	"66",
	"67",
	"68",
	"69",
	"71",
	"73",
	"74",
	"75",
	"77",
	"79",
	"81",
	"82",
	"83",
	"84",
	"85",
	"86",
	"87",
	"88",
	"89",
	"91",
	"92",
	"93",
	"94",
	"95",
	"96",
	"97",
	"98",
	"99",
]);

export function dddValido(ddd: string): boolean {
	return DDD_VALIDOS.has(ddd);
}

/** 11 dígitos com cara de CELULAR brasileiro: DDD em uso + 9º dígito. Não diz
 *  nada sobre o dígito verificador do CPF — ~1% dos celulares também passa. */
export function ehCelularBR(digitos: string): boolean {
	return digitos.length === 11 && digitos[2] === "9" && dddValido(digitos.slice(0, 2));
}

/** Palavras que NEGAM o dado logo antes da palavra "cpf": "não tenho cpf",
 *  "sem cpf", "não sei meu cpf". Sem elas, "não tenho cpf" seria lido como
 *  declaração e o telefone ditado na sequência viraria CPF (achado 4 da
 *  pré-auditoria da rodada 3). */
const NEGACAO_ANTES_DE_CPF = /\b(?:n[ãa]o|sem|nenhum|nenhuma|nunca)\b[^,.;!?\n]{0,24}$/i;

/** O que a fala diz sobre o CPF: `declara` quando a palavra "cpf" aparece sem
 *  negação (é o cliente oferecendo o dado); `nega` quando aparece negada ("não
 *  tenho cpf", "sem cpf"). CPF formatado (`111.444.777-35`) também é
 *  declaração, mas não passa por aqui: ele é reconhecido pela forma. */
function ditoSobreCpf(text: string): { declara: boolean; nega: boolean } {
	const t = text ?? "";
	let declara = false;
	let nega = false;
	for (const ocorrencia of t.matchAll(/\bcpf\b/gi)) {
		const index = ocorrencia.index ?? 0;
		const antes = t.slice(Math.max(0, index - 40), index);
		if (NEGACAO_ANTES_DE_CPF.test(antes)) nega = true;
		else declara = true;
	}
	return { declara, nega };
}

/** O número dito como TELEFONE na mesma oração: "meu telefone é X", "meu
 *  celular é X". `número` fica de fora de propósito — "o número do cpf é X" é
 *  fala comum, e a declaração de CPF já vence este sinal. */
const DECLARA_TELEFONE = /\b(?:telefone|tel|celular|whatsapp|whats|zap)\b/i;

/** As orações da fala que vêm ANTES de cada passagem deste número. É o que
 *  amarra a palavra "cpf" ao número: em "não tenho cpf, meu telefone é X" a
 *  oração que anuncia o X é "meu telefone é", e o "cpf" negado fica para trás.
 *  Array vazio quando o número não aparece no texto — aí não há como amarrar
 *  nada, e quem chama decide o que fazer. */
function oracoesAntesDoNumero(text: string, digitos: string): string[] {
	// O número pode vir formatado ("(11) 90000-0083"): os separadores que o
	// cliente usa entram entre os dígitos para achá-lo como ele escreveu.
	const padrao = new RegExp(digitos.split("").join("[\\s.\\-()]*"), "g");
	const oracoes: string[] = [];
	for (const ocorrencia of (text ?? "").matchAll(padrao)) {
		const antes = (text ?? "").slice(0, ocorrencia.index ?? 0);
		const corte = Math.max(
			...[".", ",", ";", "?", "!", "\n"].map((separador) => antes.lastIndexOf(separador)),
		);
		oracoes.push(antes.slice(corte + 1));
	}
	return oracoes;
}

/** O que a fala diz sobre ESTE número: `cpf` quando a declaração está na oração
 *  que o anuncia, `telefone` quando é o contrário (dito como telefone, ou com o
 *  CPF negado na mesma oração), `nenhum` quando ele não é anunciado por nada.
 *  Número que não aparece no texto (ou aparece de um jeito que os separadores
 *  acima não reconhecem) cai no texto TODO — é o comportamento anterior, e é o
 *  lado que não apaga o CPF que o cliente declarou. */
function declaracaoDoNumero(text: string, digitos: string): "cpf" | "telefone" | "nenhum" {
	const oracoes = oracoesAntesDoNumero(text, digitos);
	const anuncios = (oracoes.length > 0 ? oracoes : [text ?? ""]).map(ditoSobreCpf);
	if (anuncios.some((dito) => dito.declara)) return "cpf";
	const ditoComoTelefone = oracoes.some((oracao) => DECLARA_TELEFONE.test(oracao));
	if (ditoComoTelefone || anuncios.some((dito) => dito.nega)) return "telefone";
	return "nenhum";
}

/**
 * Este número pertence ao TELEFONE, e não ao CPF?
 *
 * Sim quando ele tem cara de celular e nada na fala nem no momento diz que é
 * CPF: sem a palavra "cpf" LIGADA a ele e sem o pedido do CPF ter acabado de
 * sair. Passar no dígito verificador não desempata — é coincidência em ~1% dos
 * celulares.
 *
 * Duas coisas vencem o pedido de CPF, porque dizem o que o número é: a
 * declaração colada nele ("meu cpf é X", "cpf: X" → CPF, mesmo sem pedido) e a
 * fala que o anuncia como telefone ("não tenho cpf, meu telefone é X" →
 * telefone, mesmo logo depois do pedido). Quem responde "não tenho cpf" a um
 * pedido está recusando o dado, não mandando o telefone como CPF.
 */
export function celularEhTelefone(args: {
	digitos: string;
	texto: string;
	pedidoDeCpf: boolean;
}): boolean {
	if (!ehCelularBR(args.digitos)) return false;
	const declaracao = declaracaoDoNumero(args.texto, args.digitos);
	if (declaracao === "cpf") return false;
	if (declaracao === "telefone") return true;
	return !args.pedidoDeCpf;
}

/** Um número DITADO na fala, com os separadores que o cliente usa — inclusive
 *  o DDD entre parênteses, `(11) 90000-0083`. O parêntese quebrava a leitura e
 *  o telefone deixava de existir como número (era o que fazia a recusa do CPF
 *  virar "CPF inválido" no fechamento do WhatsApp).
 *
 *  A forma é de 11 DÍGITOS e nada mais: é o único comprimento que pode ser CPF
 *  (11 + DV) ou celular (DDD + 9 + 8 dígitos), e as bordas `(?<!\d)`/`(?!\d)`
 *  impedem as duas leituras erradas de um número mais comprido — colar o CPF no
 *  telefone ditado na sequência (`529.982.247-25 (11) 90000-0083` são dois
 *  números, não um de 22 dígitos) e comer o dígito sobrando de um CPF digitado
 *  errado (`529982247255` é tentativa inválida, não o CPF `529.982.247-25`). */
const NUMERO_DITADO = /(?<!\d)\d(?:[.\-\s()]*\d){10}(?!\d)/g;

/** Extrai um CPF VÁLIDO (11 dígitos + DV) do texto, com ou sem pontuação. Null
 *  se não houver. Não aplica o desempate telefone × CPF — quem decide é
 *  `decidirCpfDoTexto`/`celularEhTelefone`. */
export function extractCpf(text: string): string | null {
	const candidates = (text ?? "").match(NUMERO_DITADO) ?? [];
	for (const c of candidates) {
		const digits = c.replace(/\D/g, "");
		if (digits.length === 11 && isValidCpf(digits)) return digits;
	}
	return null;
}

/** Parece uma tentativa de CPF (número longo) mesmo sem validar? Usado pra
 * responder "CPF inválido" em vez de mandar o número pro agente conversar.
 *
 * Exportada porque o fechamento do WhatsApp (`contract-capture.ts`) aplica a
 * MESMA regra quando o estágio é o pedido de CPF: uma tentativa sem DV válido é
 * resposta ao pedido ("confere os números"), não fala pra mandar ao modelo. A
 * cópia que ele tinha era idêntica — e uma regra com duas cópias só é corrigida
 * pela metade. */
export function looksLikeCpfAttempt(text: string): boolean {
	const digits = (text ?? "").replace(/\D/g, "");
	return digits.length >= 9 && digits.length <= 14;
}

export type DecisaoDoCpfDoTexto =
	| { outcome: "captured"; cpf: string }
	| { outcome: "invalid" }
	| { outcome: "none" };

/** A DECISÃO do capture de CPF, isolada da I/O pra ser testável.
 *
 * Telefone e número comprido NÃO são "CPF inválido". A regra anterior tratava
 * qualquer sequência de 9–14 dígitos como tentativa de CPF e respondia "esse CPF
 * não confere" — inclusive para o celular que o cliente acabou de ditar. Ele
 * ouvia que o PRÓPRIO CPF estava errado sem ter mandado CPF nenhum.
 *
 * CPF é uma coisa só: 11 dígitos que PASSAM no dígito verificador. O desempate
 * com o telefone está em `celularEhTelefone` — número ambíguo só é CPF quando o
 * cliente declarou o dado ou quando o pedido de CPF acabou de sair
 * (`pedidoDeCpf`). Nesse segundo caso, um número comprido que não fecha passa a
 * ser resposta à pergunta: "confere os números" é mais útil que mandar o
 * telefone pro modelo conversar.
 *
 * Exceção: quando o número era TELEFONE, não houve tentativa de CPF — responder
 * "esse CPF não confere" a quem acabou de recusar o CPF e ditar o telefone é
 * acusar de errado um dado que ele nem mandou. */
export function decidirCpfDoTexto(
	text: string,
	args: { pedidoDeCpf: boolean },
): DecisaoDoCpfDoTexto {
	const candidates = (text ?? "").match(NUMERO_DITADO) ?? [];
	let algumTelefone = false;
	for (const c of candidates) {
		const digitos = c.replace(/\D/g, "");
		if (!isValidCpf(digitos)) continue;
		if (celularEhTelefone({ digitos, texto: text, pedidoDeCpf: args.pedidoDeCpf })) {
			algumTelefone = true;
			continue;
		}
		return { outcome: "captured", cpf: digitos };
	}
	if (algumTelefone) return { outcome: "none" };
	if (args.pedidoDeCpf && looksLikeCpfAttempt(text)) return { outcome: "invalid" };
	return { outcome: "none" };
}

// ── O ATO de pedir o CPF ──────────────────────────────────────────────────
// PRINCÍPIO, herdado da `main` (`a2bc3024:src/lib/whatsapp/contract-capture.ts`,
// `isQuestion`): "É conservador de propósito, nos DOIS sentidos… Na dúvida,
// ninguém decide por regex: quem responde é o modelo."
//
// Aqui o lado PERIGOSO é um CPF FALSO: o celular ambíguo que o cliente dita
// gravado como identidade, e o telefone dele perdido no caminho. O lado SEGURO é
// "não houve pedido" — o número fica telefone, o CPF continua faltando e o modelo
// pede de novo no turno seguinte. Todo empate cai para o lado seguro.
//
// LISTA DE PERMISSÃO, não de bloqueio. As rodadas 3 a 5 tentaram enumerar as
// formas de NÃO pedir (menção explicativa, constatação cadastral, instrução de
// formato) e a rodada 6 achou mais uma: o pedido NEGADO, "não preciso do seu
// CPF agora" — `preciso` casava o verbo e a negação passava batido. Enumeração
// de bloqueio nunca fecha. Invertida, a resposta exige uma forma POSITIVA
// estreita sobre o balão:
//   1. a ÚLTIMA frase que fala do dado (`cpf` como palavra) casa um dos MOLDES do
//      pedido (rodada 7), na frase normalizada: um verbo de pedido IMPERATIVO
//      dirigido ao cliente, a pergunta pelo valor, ou o dado sozinho;
//   2. o balão INTEIRO passa nas TRAVAS gerais abaixo — negação, menção a outro
//      contato, constatação de que o CPF já existe, adiamento.
// As duas juntas. Faltando uma, não é pedido de CPF.
//
// A "última frase que fala do dado" (e não a última frase do balão) é o que
// mantém vivo o pedido seguido de instrução de formato: em "Qual é seu CPF?
// Envie só os números." a instrução não pede outro dado, e o balão inteiro já
// passa nas travas — é dela que sai o "não".

/** Fronteira de palavra que ENXERGA ACENTO. Com `\b` só, "cadastrado" casava o
 *  prefixo `cadastra` (P188) e "informação" casava o verbo `informa`: o `ç` não é
 *  caractere de palavra para o `\b`, então o prefixo passava por palavra inteira. */
const INICIO_DE_PALAVRA = "(?<![\\p{L}\\p{N}])";
const FIM_DE_PALAVRA = "(?![\\p{L}\\p{N}])";

function palavra(chave: string): RegExp {
	return new RegExp(`${INICIO_DE_PALAVRA}(?:${chave})${FIM_DE_PALAVRA}`, "iu");
}

/** O balão fala do dado. Só a palavra, sem julgar se é pedido ou constatação —
 *  quem julga são o ato de pedido e as travas. */
const MENCIONA_CPF = palavra("cpf");

/** Verbo de PEDIDO do dado. "consulta", "confiro", "explico" e "recebi" ficam de
 *  fora de propósito: são o que o agente DIZ sobre o CPF, não o que ele pede.
 *  Modal sozinho ("pode", "consegue") também fica: "você pode ficar tranquilo,
 *  seu CPF fica protegido" não pede nada — "pode informar o CPF" já casa pelo
 *  "informar". Cada forma está listada inteira, com limite de palavra dos dois
 *  lados: `pass\w*` casaria "passou" e `fal\w*` casaria "falhou". */
const VERBO_DE_PEDIDO = palavra(
	[
		"inform(?:e|a|em|ar|amos|o|aria)",
		"envi(?:e|a|em|ar|amos|o|aria)",
		"mand(?:e|a|em|ar|amos|o|aria)",
		"pass(?:e|a|em|ar|amos|o|aria)",
		"digit(?:e|a|em|ar|amos)",
		"diz|diga|digam|dizer|dizem",
		"fal(?:a|e|em|ar)",
		"precis(?:o|a|amos|am|ar|e)",
		"solicit(?:o|a|amos|am|ar)",
		"compartilh(?:e|a|em|ar|amos)",
		"confirm(?:e|a|em|ar|amos|o)",
		"ped(?:ir|imos)|pe[cç]o|pe[çc]a",
	].join("|"),
);

/** Outro dado/contato que o balão menciona. Se ele fala do celular, o número
 *  que chega sozinho é o CELULAR: "Já recebi seu CPF. Qual é seu celular?" não é
 *  pedido de CPF. Trava do balão INTEIRO, inclusive quando a menção é permissão
 *  ("você pode mandar por e-mail"). */
const TRAVA_OUTRO_CONTATO = palavra("celular|telefone|whatsapp|whats|zap|e-?mail|nome|contato");

/** Constatação: o balão fala do CPF como dado que JÁ EXISTE — não pede nada.
 *  Entra também aqui o que vem antes de uma instrução de formato: "Seu CPF já
 *  está cadastrado! Envie só os números" continua sendo constatação. */
const TRAVA_JA_TEM = palavra(
	"cadastrad[oa]|recebi|confirmad[oa]|anotad[oa]|j[áa]\\s+(?:est[áa]|tenho|recebi)",
);

/** Negação em qualquer lugar do balão. Largo de propósito: a rodada 6 mostrou
 *  que "não preciso do seu CPF agora" abre o contexto do CPF quando o verbo é
 *  lido sozinho, e que enumerar as negações deixa a próxima de fora. O preço
 *  ("pode digitar sem pontos" também cai) é o lado seguro: o modelo pede de
 *  novo no turno seguinte. */
const TRAVA_NEGACAO = palavra("n[ãa]o|nem|nunca|jamais|sem");

/** Adiamento: o pedido vale para DEPOIS, não para o número que chega agora.
 *  `depois` já cobre "pra depois", e a trava de negação cobre "agora não". */
const TRAVA_ADIAMENTO = palavra("depois|mais\\s+tarde|por\\s+enquanto");

/** O dado que uma frase PEDE, além do contato. Vale só para a frase POSTERIOR ao
 *  pedido (`frasePosteriorPediuOutroDado`), e não para a trava do balão inteiro: ali
 *  "documento" é onde o dado está, não o dado que se pede, e "Me envia o CPF que está
 *  no seu documento." continua pedido. LISTA FECHADA e piso: cada palavra é um dado que
 *  o vendedor pede; nomeado depois do CPF, ele deixa o número que chega sozinho como
 *  telefone. O preço de um piso é o caso que fica de fora — e o empate cai para "não
 *  houve pedido". */
const OUTRO_DADO_PEDIDO_NA_FRASE = palavra(
	"comprovante|documento|foto|selfie|renda|sal[áa]rio|valor|faixa|endere[çc]o|nascimento|profiss[ãa]o|carteira",
);

/** As travas gerais, uma por motivo de derrubar o pedido. Basta uma delas
 *  aparecer no balão para a resposta ser "não houve pedido". */
const TRAVAS: readonly RegExp[] = [
	TRAVA_NEGACAO,
	TRAVA_OUTRO_CONTATO,
	TRAVA_JA_TEM,
	TRAVA_ADIAMENTO,
];

/** Os MOLDES do pedido (rodada 7, ANCORADOS na rodada 8). O pedido é verdadeiro só
 *  se a última frase do balão que tem `cpf` casar um destes cinco, na frase
 *  normalizada (sem acento, em minúsculas, `trim`): o molde casa na ENTRADA da frase.
 *
 *  Entre o verbo do molde e `cpf` só cabe `ALVO`: LISTA FECHADA na ordem em que ele
 *  nomeia (`me` + `o` + `seu` + `numero do` + `seu` — é como o cliente fala: "Qual o
 *  número do seu CPF?"). Não existe mais o `X` de até 3 palavras: ele deixava a
 *  EXPLICAÇÃO passar como pedido (P188, rodada 8) — "Vou explicar qual a função do CPF
 *  na análise." casava `qual` no meio da frase com "a função do" como X, e o celular
 *  ambíguo que o cliente ditou em resposta foi gravado como identidade. Ancorado,
 *  "a função do" não cabe no ALVO e a explicação cai para o lado seguro: o número
 *  continua telefone e o modelo pede o dado de novo no turno seguinte. Cada grupo de
 *  `ALVO` já leva o espaço do fim da palavra; quando ele fica vazio, o espaço vem do
 *  `\s+` do molde.
 *
 *  `PRE` é o preâmbulo ANCORADO no começo da frase: até 30 caracteres sem pontuação
 *  terminados em vírgula. Ele mantém o pedido que começa com cortesia ("Pra seguir, me
 *  manda seu CPF?") e não salvou a explicação da rodada 8, que não tem vírgula antes
 *  do `qual`.
 *
 *  Moldes 1 e 3 vão até o FIM da frase (`.*$`) sem exigir `?`: o ponto de interrogação
 *  não é o que faz um balão pedir — "Pode digitar o CPF, por favor." pede igual.
 *
 *  O verbo do molde é IMPERATIVO, dirigido ao cliente: `informar`, `vou te
 *  informar` e `posso informar` não entram — o molde 3 só aceita o verbo no
 *  infinitivo depois de `pode`/`poderia`/`consegue`, que é a forma de pedido.
 */
const ALVO =
	"(?:me\\s+)?(?:o\\s+)?(?:seu\\s+|teu\\s+)?(?:numero\\s+d[oe]\\s+)?(?:seu\\s+|teu\\s+)?";
const PRE = "^(?:[^,.?!]{1,30},\\s*)?";
const MOLDES_DO_PEDIDO: readonly RegExp[] = [
	new RegExp(`${PRE}qual\\s+(?:e\\s+)?${ALVO}cpf\\b.*$`, "u"),
	new RegExp(
		`${PRE}(?:me\\s+)?(?:passa|passe|manda|mande|envia|envie|informe|digita|diga)\\s+${ALVO}cpf\\b`,
		"u",
	),
	new RegExp(
		`${PRE}(?:voce\\s+)?(?:pode|poderia|consegue)\\s+(?:me\\s+)?(?:passar|mandar|enviar|informar|digitar)\\s+${ALVO}cpf\\b.*$`,
		"u",
	),
	new RegExp(`${PRE}(?:agora\\s+)?preciso\\s+d[oa]\\s+(?:seu\\s+|teu\\s+)?cpf\\b`, "u"),
	new RegExp(`${PRE}(?:e\\s+)?(?:o\\s+)?(?:seu\\s+)?cpf\\s*\\??$`, "u"),
];

/** As frases do balão, cortadas por `. ! ? \n`. A pontuação que fecha a frase
 *  vai junto, porque o molde 5 compara a FRASE INTEIRA; a vírgula não corta
 *  ("pode informar o CPF, por favor?" é um pedido só) e as frases nunca
 *  são juntadas — foi a união de orações que criou a associação falsa da
 *  rodada 4. */
const FRASES = /[^.!?\n]+[.!?]*/g;

/** A frase para os moldes: sem acento, em minúsculas, com símbolo (emoji) e
 *  pontuação trocados por espaço, `trim`. A vírgula e o `?` ficam, porque `PRE`
 *  precisa distinguir o preâmbulo do verbo do pedido ("Pra seguir, me manda seu CPF?").
 *  As TRAVAS comparam o texto cru, não este. */
function normalizar(texto: string): string {
	return (texto ?? "")
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s?,.?!]/gu, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function frasesDoBalao(balao: string): string[] {
	return [...(balao ?? "").matchAll(FRASES)].map((achado) => achado[0]);
}

/** A frase PEDE o dado: ela casa um dos moldes. A presença de um verbo de pedido
 *  não basta — "Vou te informar como funciona a consulta de CPF" tem `informar`,
 *  mas é o agente falando de uma ação dele, não um pedido ao cliente (P188). */
function fraseCasaMolde(frase: string): boolean {
	return MOLDES_DO_PEDIDO.some((molde) => molde.test(normalizar(frase)));
}

/** Nenhuma frase POSTERIOR à que casa o molde pede OUTRO dado: "Qual é seu CPF?
 *  Envie só os números." e "Qual é seu CPF? Digita aí." continuam pedido — o verbo
 *  sozinho não nomeia dado nenhum — mas "Me passa seu celular?" e "Me manda o
 *  comprovante." não são: o número que chega sozinho é o celular, não o CPF.
 *
 *  É a trava de outro dado aplicada frase a frase, na frase depois do pedido: contato
 *  (`TRAVA_OUTRO_CONTATO`, que já vale para o balão INTEIRO) ou o dado nomeado na frase
 *  (`OUTRO_DADO_PEDIDO_NA_FRASE`). Compara o texto cru, como as outras travas. */
function frasePosteriorPediuOutroDado(posteriores: string[]): boolean {
	return posteriores.some(
		(frase) =>
			VERBO_DE_PEDIDO.test(frase) &&
			(TRAVA_OUTRO_CONTATO.test(frase) || OUTRO_DADO_PEDIDO_NA_FRASE.test(frase)),
	);
}

/** O pedido de CPF é o que o ÚLTIMO balão do agente pede — sem turno do cliente
 *  no meio. `false` quando a última fala é do cliente (aí o número comprido dele
 *  não é resposta a pedido nenhum) ou a conversa não tem histórico.
 *
 *  As duas condições, juntas: a última frase do balão QUE TEM `cpf` casa um dos
 *  `MOLDES_DO_PEDIDO` (na frase normalizada, sem acento e em minúsculas), e nenhuma
 *  frase posterior pede outro dado. As `TRAVAS` valem no balão INTEIRO.
 *
 *  Qualquer dúvida devolve `false`: na dúvida, quem pergunta é o modelo. */
export function pedidoDeCpfNoUltimoBalao(
	ultima: { role: string; content: string } | null | undefined,
): boolean {
	if (!ultima || ultima.role !== "assistant") return false;
	const balao = ultima.content ?? "";
	if (TRAVAS.some((trava) => trava.test(balao))) return false;
	const frases = frasesDoBalao(balao);
	// A última frase QUE TEM `cpf` é a que pode pedi-lo: uma menção anterior a ela
	// ("já expliquei como funciona a consulta do CPF") não vale como pedido.
	const indice = frases.map((frase) => MENCIONA_CPF.test(frase)).lastIndexOf(true);
	if (indice < 0) return false;
	const pedido = frases[indice];
	if (!fraseCasaMolde(pedido)) return false;
	return !frasePosteriorPediuOutroDado(frases.slice(indice + 1));
}
