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
// `ditoSobreCpf` responde o que a fala DIZ sobre o CPF, e isso basta para ler um
// número (a menção na oração que o anuncia). PEDIR é outra coisa, e mora numa
// ORAÇÃO: "Já expliquei como funciona a consulta do CPF. Qual é seu celular?"
// fala do CPF e pede o CELULAR — lido como pedido de CPF, o celular ambíguo que
// o cliente dita em resposta vira CPF e o telefone se perde (P188/P263). Por isso
// quem decide é a ÚLTIMA oração do balão que PEDE alguma coisa: se ela pede o
// celular, o CPF mencionado antes não foi pedido.
//
// A pontuação que fecha a fala (`.;:!?` e o travessão) separa orações; a vírgula
// NÃO separa, porque "pode informar o CPF, por favor?" é um pedido só. Os
// conectivos (`mas`, `e`, `agora`) emendam uma oração na outra sem pontuação. A
// interrogação fica com a ÚLTIMA oração do trecho que ela fecha: em "não tenho
// cpf, mas qual é o seu?" a pergunta é "qual é o seu".
const SEPARA_ORACAO = /([^.;:!?\n\-–—]+)([.;:!?\n\-–—]*)/g;
const CONECTIVO = /\b(?:mas|por[eé]m|contudo|entretanto|s[óo]\s+que|e|ent[ãa]o|agora|tamb[ée]m)\b/i;

/** Verbo de PEDIDO do dado. "consulta", "confere", "explico" e "recebi" ficam
 *  de fora de propósito: são o que o agente DIZ sobre o CPF, não o que ele pede.
 *  Modal sozinho ("pode", "consegue") também fica: "você pode ficar tranquilo,
 *  seu CPF fica protegido" não pede nada — "pode informar o CPF" já casa pelo
 *  "informar". */
const VERBO_DE_PEDIR =
	/\b(?:pass(?:a|e|ar|em|aria)|inform(?:a|e|ar|em|aria)|envi(?:a|e|ar|em|aria)|mand(?:a|e|ar|em|aria)|d[ií]g(?:it(?:a|e|em|ar)|a|am|o)|diz(?:em)?|fal(?:a|e|ar|em|aria)|precis(?:o|amos|a|am|ar|e|em|ava|aria)|solicit(?:o|amos|a|am|ou)|compartilh(?:a|e|ar|em|aria)|cadastr(?:a|e|ar|em|aria)|preench(?:a|am|er)|confirm(?:a|e|ar|em|aria)|ped(?:ir|imos)|pe[cç]o|pe[çc]a)/i;

/** Pergunta que pede o VALOR do dado, e não a explicação dele ("qual o cpf?",
 *  "cadê o cpf?"). "como" fica de fora: "como funciona a consulta do CPF?" é
 *  explicação, e era por ele que a menção passava por pedido. */
const PALAVRA_QUE_PEDE_VALOR = /\b(?:qual|quais|cad[êe])\b/i;

/** O dado SOZINHO na oração é um pedido: "CPF?", "seu CPF, por favor". */
const CPF_SOZINHO = /^(?:(?:e|o|a|seu|sua)\s+)*cpf(?:\s+(?:por\s+favor|pra\s+mim|para\s+mim))?$/i;

type Oracao = {
	/** A oração sem pontuação, com o símbolo (emoji) trocado por espaço. */
	limpo: string;
	/** É pergunta: o que ela pede é o que o cliente responde. */
	interrogativa: boolean;
	mencionaCpf: boolean;
	negaCpf: boolean;
};

function oracoesDoBalao(fala: string): Oracao[] {
	const oracoes: Oracao[] = [];
	for (const trecho of (fala ?? "").matchAll(SEPARA_ORACAO)) {
		const interrogativa = trecho[2].includes("?");
		const pedacos = trecho[1]
			.split(CONECTIVO)
			.map((pedaco) =>
				pedaco
					.replace(/[^\p{L}\p{N}\s]/gu, " ")
					.replace(/\s+/g, " ")
					.trim(),
			)
			.filter(Boolean);
		pedacos.forEach((limpo, i) => {
			const dito = ditoSobreCpf(limpo);
			oracoes.push({
				limpo,
				interrogativa: interrogativa && i === pedacos.length - 1,
				mencionaCpf: dito.declara || dito.nega,
				negaCpf: dito.nega && !dito.declara,
			});
		});
	}
	return oracoes;
}

/** Esta oração PEDE alguma coisa: pergunta, imperativo com verbo de pedido, ou o
 *  dado sozinho ("CPF?"). As que só constatam algo são puladas na busca. */
function oracaoPede(oracao: Oracao): boolean {
	return (
		oracao.interrogativa || VERBO_DE_PEDIR.test(oracao.limpo) || CPF_SOZINHO.test(oracao.limpo)
	);
}

/** Esta oração pede o CPF: o dado está NELA e ela é um pedido. Menção,
 *  explicação ou confirmação ("Já recebi seu CPF", "seu CPF fica protegido") não
 *  pedem nada — e a negação não pede o contrário ("não preciso do seu cpf"). */
function oracaoPedeCpf(oracao: Oracao): boolean {
	if (!oracao.mencionaCpf || oracao.negaCpf) return false;
	if (CPF_SOZINHO.test(oracao.limpo)) return true;
	if (VERBO_DE_PEDIR.test(oracao.limpo)) return true;
	return oracao.interrogativa && PALAVRA_QUE_PEDE_VALOR.test(oracao.limpo);
}

/** O pedido de CPF é a ÚLTIMA coisa que o agente disse — sem turno do cliente no
 * meio. `false` quando a última fala é do cliente (aí o número comprido dele não
 * é resposta a pedido nenhum) ou a conversa não tem histórico. */
export function pedidoDeCpfNoUltimoBalao(
	ultima: { role: string; content: string } | null | undefined,
): boolean {
	if (!ultima || ultima.role !== "assistant") return false;
	const oracoes = oracoesDoBalao(ultima.content ?? "");
	// Da última oração para trás: a primeira que PEDE alguma coisa é a que o
	// cliente vai responder, e é ela que diz se o CPF foi pedido.
	for (let i = oracoes.length - 1; i >= 0; i--) {
		const oracao = oracoes[i];
		if (oracaoPede(oracao)) return oracaoPedeCpf(oracao);
	}
	return false;
}
