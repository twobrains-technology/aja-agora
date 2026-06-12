// Identidade do usuário (CPF + celular) — coletada no gate "identify" ao fim do
// passo 2 da jornada canônica (D1, docs/jornada/CONTEXT.md): a Bevi exige
// CPF+celular+LGPD ANTES de qualquer simulação real. Não existe descoberta
// anônima com dado real.
//
// Segurança (LGPD): o CPF NUNCA é persistido em claro. O blob vai cifrado com
// AES-256-GCM (IV aleatório + auth tag) dentro do metadata da conversation,
// com chave exclusiva `IDENTITY_ENC_KEY` (32 bytes, base64) fora do banco.
// Sem a chave → falha alto, sem fallback silencioso.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { persistMeta, reloadMeta } from "@/lib/conversation/meta";

export interface StoredIdentity {
	cpf: string; // só dígitos
	celular: string; // só dígitos
}

const onlyDigits = (s: string) => (s ?? "").replace(/\D/g, "");

/** Validação completa de CPF (dígitos verificadores, módulo 11). */
export function isValidCpf(raw: string): boolean {
	const cpf = onlyDigits(raw);
	if (cpf.length !== 11) return false;
	if (/^(\d)\1{10}$/.test(cpf)) return false; // 111.111.111-11 etc.

	const dv = (sliceLen: number): number => {
		let sum = 0;
		for (let i = 0; i < sliceLen; i++) sum += Number(cpf[i]) * (sliceLen + 1 - i);
		const rest = (sum * 10) % 11;
		return rest === 10 ? 0 : rest;
	};
	return dv(9) === Number(cpf[9]) && dv(10) === Number(cpf[10]);
}

/** Exibição segura: ***.***.247-25 (últimos 5 dígitos visíveis). */
export function maskCpf(raw: string): string {
	const cpf = onlyDigits(raw);
	if (cpf.length !== 11) return "***.***.***-**";
	return `***.***.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

/** FIX-27 — telefone mascarado pra exibição/confirmação ("(62) 9...-6793").
 * Guardado no meta (vai pro prompt do LLM): nunca o número em claro. DDD +
 * últimos 4 dígitos. Número curto/inválido → "" (caller omite). */
export function maskPhoneForDisplay(raw: string): string {
	const d = onlyDigits(raw);
	if (d.length < 10) return "";
	return `(${d.slice(0, 2)}) 9...-${d.slice(-4)}`;
}

const KEY_ERROR =
	"IDENTITY_ENC_KEY ausente ou inválida (esperado: 32 bytes em base64). " +
	"CPF não pode ser persistido em claro — gere com `openssl rand -base64 32`.";

function loadKey(): Buffer {
	const raw = process.env.IDENTITY_ENC_KEY;
	if (!raw) throw new Error(KEY_ERROR);
	const key = Buffer.from(raw, "base64");
	if (key.length !== 32) throw new Error(KEY_ERROR);
	return key;
}

/** Cifra a identidade → blob `v1.<iv>.<tag>.<ciphertext>` (base64url). */
export function encryptIdentity(identity: StoredIdentity): string {
	const key = loadKey();
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", key, iv);
	const plaintext = JSON.stringify({
		cpf: onlyDigits(identity.cpf),
		celular: onlyDigits(identity.celular),
	});
	const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();
	return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

export function decryptIdentity(blob: string): StoredIdentity {
	const key = loadKey();
	const [version, ivB64, tagB64, dataB64] = blob.split(".");
	if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) {
		throw new Error("Blob de identidade em formato desconhecido.");
	}
	const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
	decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
	const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64url")), decipher.final()]);
	return JSON.parse(dec.toString("utf8")) as StoredIdentity;
}

/** Persiste a identidade cifrada no meta da conversa + liga identityCollected. */
export async function storeIdentity(
	conversationId: string,
	identity: StoredIdentity,
): Promise<void> {
	const meta = await reloadMeta(conversationId);
	await persistMeta(conversationId, {
		...meta,
		identityCollected: true,
		identityEnc: encryptIdentity(identity),
	});
}

/** Carrega a identidade da conversa — null quando ainda não coletada. */
export async function loadIdentity(conversationId: string): Promise<StoredIdentity | null> {
	const meta = await reloadMeta(conversationId);
	if (!meta.identityEnc) return null;
	return decryptIdentity(meta.identityEnc);
}
