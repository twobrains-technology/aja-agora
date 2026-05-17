// src/lib/memory/identity.ts
//
// Resolução de identidade do usuário pra mapear pessoa ↔ agent Letta.
// Convenção: phone E.164 normalizado é a chave primária estável. Cookie
// `AJA_UID` é fallback pra web anônimo (lazy create após N=3 turnos).

import { randomBytes } from "node:crypto";

import type { UserIdentity } from "./types";

export const COOKIE_NAME = "aja_uid";
export const COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60; // 90 dias
export const ENGAGEMENT_THRESHOLD = 3; // turnos antes de criar agent web anônimo

/**
 * Retorna o namespace Letta a usar. Lê `LETTA_NAMESPACE` do env. Default
 * pra dev local sem env var configurada: `aja-agora-local-default`.
 */
export function getNamespace(): string {
	return process.env.LETTA_NAMESPACE ?? "aja-agora-local-default";
}

/**
 * Normaliza um phone pra E.164 brasileiro. Aceita várias formas:
 *   - "+5511999999999"     → "+5511999999999"
 *   - "5511999999999"      → "+5511999999999"
 *   - "11 99999-9999"      → "+5511999999999"
 *   - "(11) 99999-9999"    → "+5511999999999"
 *   - "55 11 9 9999-9999"  → "+5511999999999"
 *
 * Retorna `null` se o input não puder ser normalizado pra um phone BR
 * válido (11 ou 12 dígitos após o código de país 55).
 */
export function normalizePhoneBR(input: string | null | undefined): string | null {
	if (!input) return null;
	const digits = input.replace(/\D/g, "");
	if (!digits) return null;

	// Se já vier com 55 na frente
	const withoutCC = digits.startsWith("55") ? digits.slice(2) : digits;

	// BR: DDD (2) + 9 + 8 dígitos (móvel) = 11. Fixo: DDD + 8 = 10.
	if (withoutCC.length < 10 || withoutCC.length > 11) return null;

	return `+55${withoutCC}`;
}

/**
 * Constrói uma identidade de phone. Throw se phone inválido (caller deve
 * normalizar antes ou tratar null aqui).
 */
export function identityFromPhone(phoneE164: string, namespace = getNamespace()): UserIdentity {
	if (!/^\+\d{8,15}$/.test(phoneE164)) {
		throw new Error(`Invalid E.164 phone: "${phoneE164}"`);
	}
	return { kind: "phone", value: phoneE164, namespace };
}

/**
 * waIds começando com `SIM-` são sintéticos (criados pelo simulator admin tool).
 * Eles NÃO passam por normalizePhoneBR (que rejeita não-dígitos) — são tratados
 * como identidade phone direta, mantendo o waId como `value`. Garante que conv
 * whatsapp simulada tenha identity Letta funcional desde o 1º turno.
 *
 * Single source of truth pra detectar waId simulado (espelha `isSimulatedWaId`
 * de `src/lib/whatsapp/simulator-bus.ts`, mantido aqui pra não criar import
 * cross-domínio).
 */
const SIM_WA_ID_PREFIX = "SIM-";

/** Identidade de waId (formato WhatsApp Cloud: dígitos sem `+`, ou SIM-<uuid>). */
export function identityFromWaId(waId: string, namespace = getNamespace()): UserIdentity {
	if (waId.startsWith(SIM_WA_ID_PREFIX)) {
		return { kind: "phone", value: waId, namespace };
	}
	const e164 = normalizePhoneBR(waId);
	if (!e164) throw new Error(`Invalid waId: "${waId}"`);
	return identityFromPhone(e164, namespace);
}

/** Identidade de email — só usado quando única chave disponível. */
export function identityFromEmail(email: string, namespace = getNamespace()): UserIdentity {
	const lower = email.trim().toLowerCase();
	if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(lower)) {
		throw new Error(`Invalid email: "${email}"`);
	}
	return { kind: "email", value: lower, namespace };
}

/** Identidade de cookie web anônimo. */
export function identityFromCookie(cookieValue: string, namespace = getNamespace()): UserIdentity {
	if (!/^[a-f0-9]{16,64}$/.test(cookieValue)) {
		throw new Error(`Invalid cookie value: "${cookieValue}"`);
	}
	return { kind: "anon-cookie", value: cookieValue, namespace };
}

/** Gera um novo cookie value hexadecimal de 32 chars (128 bits). */
export function generateCookieValue(): string {
	return randomBytes(16).toString("hex");
}

/**
 * Decide se uma conversa anônima já atingiu o threshold de engajamento pra
 * justificar criar um agent Letta temporário. Conta turnos do usuário no
 * histórico atual.
 */
export function shouldCreateAnonAgent(userTurnCount: number): boolean {
	return userTurnCount >= ENGAGEMENT_THRESHOLD;
}
