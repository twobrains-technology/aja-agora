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

/** O cliente DECLAROU o dado nesta fala. CPF formatado (`111.444.777-35`)
 *  também é declaração, mas não aparece aqui: ele é reconhecido pela forma, não
 *  pela palavra. */
function declaraCpf(text: string): boolean {
	return /\bcpf\b/i.test(text ?? "");
}

/**
 * Este número pertence ao TELEFONE, e não ao CPF?
 *
 * Sim quando ele tem cara de celular e nada na fala nem no momento diz que é
 * CPF: sem a palavra "cpf" e sem o pedido do CPF ter acabado de sair. Passar no
 * dígito verificador não desempata — é coincidência em ~1% dos celulares.
 */
export function celularEhTelefone(args: {
	digitos: string;
	texto: string;
	pedidoDeCpf: boolean;
}): boolean {
	if (!ehCelularBR(args.digitos)) return false;
	return !declaraCpf(args.texto) && !args.pedidoDeCpf;
}

/** Extrai um CPF VÁLIDO (11 dígitos + DV) do texto, com ou sem pontuação. Null
 *  se não houver. Não aplica o desempate telefone × CPF — quem decide é
 *  `decidirCpfDoTexto`/`celularEhTelefone`. */
export function extractCpf(text: string): string | null {
	const candidates = (text ?? "").match(/\d[\d.\-\s]{9,17}\d/g) ?? [];
	for (const c of candidates) {
		const digits = c.replace(/\D/g, "");
		if (digits.length === 11 && isValidCpf(digits)) return digits;
	}
	return null;
}

/** Parece uma tentativa de CPF (número longo) mesmo sem validar? Usado pra
 * responder "CPF inválido" em vez de mandar o número pro agente conversar. */
function looksLikeCpfAttempt(text: string): boolean {
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
 * telefone pro modelo conversar. */
export function decidirCpfDoTexto(
	text: string,
	args: { pedidoDeCpf: boolean },
): DecisaoDoCpfDoTexto {
	const candidates = (text ?? "").match(/\d[\d.\-\s]{9,17}\d/g) ?? [];
	for (const c of candidates) {
		const digitos = c.replace(/\D/g, "");
		if (!isValidCpf(digitos)) continue;
		if (celularEhTelefone({ digitos, texto: text, pedidoDeCpf: args.pedidoDeCpf })) continue;
		return { outcome: "captured", cpf: digitos };
	}
	if (args.pedidoDeCpf && looksLikeCpfAttempt(text)) return { outcome: "invalid" };
	return { outcome: "none" };
}

/** O pedido de CPF é a ÚLTIMA coisa que o agente disse — sem turno do cliente no
 * meio. `false` quando a última fala é do cliente (aí o número comprido dele não
 * é resposta a pedido nenhum) ou a conversa não tem histórico. */
export function pedidoDeCpfNoUltimoBalao(
	ultima: { role: string; content: string } | null | undefined,
): boolean {
	if (!ultima || ultima.role !== "assistant") return false;
	return declaraCpf(ultima.content ?? "");
}
