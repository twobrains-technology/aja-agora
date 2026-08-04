// src/lib/conversions/hash.ts
//
// Normalização e hash dos identificadores que vão pra Meta.
//
// A normalização é a parte que mais silenciosamente estraga campanha: o hash
// de "A@b.com" e o de "a@b.com" são diferentes, e a Meta compara hash contra
// hash. Errar aqui não dá erro em lugar nenhum — só faz o match despencar e a
// campanha ficar cara sem explicação. Por isso as regras vêm da doc oficial
// (Conversions API › Customer Information Parameters) e estão cobertas por
// teste com âncora externa.

import { createHash } from "node:crypto";

/** Código de país do Brasil — toda a operação é brasileira. */
const DDI_BR = "55";

/** Menor comprimento plausível: DDI + DDD + 8 dígitos. */
const MIN_DIGITOS_COM_DDI = 12;

export function normalizarEmail(valor: string | null | undefined): string | null {
	const limpo = valor?.trim().toLowerCase();
	if (!limpo) return null;
	// Um "e-mail" sem arroba ou sem domínio com ponto não casa com ninguém —
	// hashear lixo só suja a base de matching.
	if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(limpo)) return null;
	return limpo;
}

/**
 * Telefone no formato que a Meta espera: só dígitos, com código de país, sem
 * o "+". Número sem DDI recebe o do Brasil — sem código de país a Meta
 * simplesmente não casa o contato.
 */
export function normalizarTelefone(valor: string | null | undefined): string | null {
	if (!valor) return null;
	// Telefone sintético do simulador (`SIM-<uuid>`) não é gente: se passasse,
	// mandaria conversão de teste pro algoritmo.
	if (valor.trim().toUpperCase().startsWith("SIM-")) return null;

	const digitos = valor.replace(/\D/g, "");
	if (!digitos) return null;

	// 10 ou 11 dígitos = número nacional (DDD + 8/9). Acima disso, assume-se que
	// o DDI já veio.
	const comDdi = digitos.length === 10 || digitos.length === 11 ? `${DDI_BR}${digitos}` : digitos;

	if (comDdi.length < MIN_DIGITOS_COM_DDI) return null;
	return comDdi;
}

function sha256(valor: string): string {
	return createHash("sha256").update(valor).digest("hex");
}

export function hashEmail(valor: string | null | undefined): string | null {
	const normalizado = normalizarEmail(valor);
	return normalizado ? sha256(normalizado) : null;
}

export function hashPhone(valor: string | null | undefined): string | null {
	const normalizado = normalizarTelefone(valor);
	return normalizado ? sha256(normalizado) : null;
}

/**
 * Monta o `fbc` (cookie de clique do Facebook) a partir do `fbclid` que veio na
 * URL. Formato exigido: `fb.<subdomain_index>.<timestamp_ms>.<fbclid>`.
 *
 * Sem `fbclid` devolve `null` — inventar um clique falsearia a atribuição e a
 * Meta descartaria o evento de qualquer forma.
 */
export function montarFbc(fbclid: string | null | undefined, cliqueEmMs: number): string | null {
	const limpo = fbclid?.trim();
	if (!limpo) return null;
	return `fb.1.${cliqueEmMs}.${limpo}`;
}
