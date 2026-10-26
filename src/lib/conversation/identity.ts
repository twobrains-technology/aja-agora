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
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { attachContact } from "@/lib/contacts";
import { persistMeta, reloadMeta } from "@/lib/conversation/meta";
import { normalizePhoneBR } from "@/lib/leads/phone";

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

/** Persiste a identidade cifrada no meta da conversa + liga identityCollected
 * quando o par está COMPLETO. */
export async function storeIdentity(
	conversationId: string,
	identity: StoredIdentity,
): Promise<void> {
	const meta = await reloadMeta(conversationId);
	// A identidade chega em PEDAÇOS: o cliente dita o CPF num turno e o celular no
	// seguinte (ou o contrário). O que já estava guardado entra na conta — gravar
	// só o pedaço novo apagava o outro e a identidade nunca fechava.
	const completa = juntarIdentidade(identity, identidadeGuardada(meta));
	await persistMeta(conversationId, {
		...meta,
		// `identityCollected` NÃO é "guardei algum dado", é o FATO de o cliente ter
		// dado CPF **e** celular — era o que a `main` marcava no gate `identify` e o
		// que qualifica o lead (`persist.ts:374` na a2bc3024). Marcar com metade do
		// par promovia a `qualificado` quem só tinha digitado o CPF.
		identityCollected: isCompleteIdentity(completa),
		identityEnc: encryptIdentity(completa),
	});
	// FIX-42: identidade capturada (CPF + celular) → resolve o cliente unificado
	// e religa a conversa. attachContact nunca lança nem loga o CPF.
	await attachContact({
		conversationId,
		input: { cpf: completa.cpf, phone: completa.celular },
	});
	await vincularCelularAoLead(conversationId, completa.celular).catch((erro: unknown) => {
		// O telefone do LEAD é o que faz a pessoa contar como identificada no
		// painel — mas não é o que fecha a venda: falhar aqui não pode derrubar o
		// turno que acabou de capturar a identidade.
		console.error("[identity] celular não chegou ao lead (ignorado):", erro);
	});
}

/** O par que a Bevi exige (e que a `main` chamava de identidade coletada): CPF
 * com DV válido **e** celular com DDD. */
export function isCompleteIdentity(identity: Partial<StoredIdentity> | null | undefined): boolean {
	return isValidCpf(identity?.cpf ?? "") && normalizePhoneBR(identity?.celular ?? "") !== null;
}

/** O pedaço que já estava guardado, ou null se não há (ou não abre). */
function identidadeGuardada(meta: { identityEnc?: string }): StoredIdentity | null {
	if (!meta.identityEnc) return null;
	try {
		return decryptIdentity(meta.identityEnc);
	} catch (erro) {
		// Blob de outra chave/ambiente: o pedaço novo ainda vale, e o turno não cai.
		console.error("[identity] identidade guardada ilegível (ignorada):", erro);
		return null;
	}
}

/** O dado NOVO vence o guardado, campo a campo — o cliente pode corrigir o CPF
 * sem perder o celular que já tinha ditado. */
function juntarIdentidade(
	identity: StoredIdentity,
	guardada: StoredIdentity | null,
): StoredIdentity {
	return {
		cpf: onlyDigits(identity?.cpf ?? "") || guardada?.cpf || "",
		celular: onlyDigits(identity?.celular ?? "") || guardada?.celular || "",
	};
}

/**
 * O celular capturado no WEB também é o telefone do LEAD.
 *
 * Na `main` quem fazia esta ligação era o handler do gate `identify`
 * (route.ts, `saveContactWhatsapp` logo depois de `storeIdentity`). Com o funil
 * fora, a captura do CPF/celular passou a acontecer AQUI — e `leads.phone`
 * ficava vazio. O painel mede exatamente isso: a métrica de identificados lê
 * `leads.phone`/`email` (performance-queries.ts), então quem digitou o celular
 * no chat não contava como identificado.
 *
 * Só no canal WEB. No WhatsApp o telefone JÁ é a conversa (`conversations.waId`,
 * de onde a captura tirou o número) e no simulador o `waId` é o hash `SIM-…`
 * que o fechamento usa para achar o par de teste da vitrine — sobrescrevê-lo
 * mandaria o contrato para outro telefone.
 */
async function vincularCelularAoLead(conversationId: string, celular: string): Promise<void> {
	const phone = normalizePhoneBR(celular ?? "");
	if (!phone) return;
	const conversa = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
		columns: { channel: true },
	});
	if (conversa?.channel !== "web") return;
	const { saveContactWhatsapp } = await import("@/lib/leads/contact-capture");
	await saveContactWhatsapp(conversationId, phone);
}

/** Carrega a identidade da conversa — null quando ainda não coletada. */
export async function loadIdentity(conversationId: string): Promise<StoredIdentity | null> {
	const meta = await reloadMeta(conversationId);
	if (!meta.identityEnc) return null;
	return decryptIdentity(meta.identityEnc);
}
