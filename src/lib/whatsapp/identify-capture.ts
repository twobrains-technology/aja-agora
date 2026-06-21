// Gate "identify" no WhatsApp (D1, docs/jornada/CONTEXT.md) — coleta textual.
//
// No WhatsApp o celular JÁ é conhecido (o próprio waId da conversa); falta só o
// CPF + aceite LGPD. O prompt avisa que enviar o CPF autoriza a consulta
// (consentimento por conduta, com aviso prévio explícito); a captura valida os
// dígitos verificadores antes de persistir — sempre CIFRADO, nunca em claro.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { nextGate } from "@/lib/agent/qualify-state";
import { isValidCpf, storeIdentity } from "@/lib/conversation/identity";
import { metaOf } from "@/lib/conversation/meta";

/** Pergunta do gate identify no WhatsApp — gancho do docx (analisar várias
 * administradoras / aderentes ao perfil) + LGPD. FIX-53: a identidade subiu pra
 * ANTES do valor (logo após o consent), então o gancho é forward-looking ("pra
 * eu analisar e buscar"), não mais "Com essas informações…" (que pressupunha
 * dados já coletados). No WhatsApp o celular já é o waId — só falta o CPF. */
export const IDENTIFY_WHATSAPP_PROMPT =
	"Pra eu analisar várias administradoras e buscar as opções mais aderentes " +
	"ao seu perfil, me envia seu *CPF* (só os números). " +
	"Seus dados ficam protegidos (LGPD) e, ao enviar, você autoriza a consulta " +
	"nas administradoras — não é compromisso nenhum, tá? " +
	"Seu celular eu já tenho daqui do WhatsApp 😉";

export const IDENTIFY_INVALID_CPF_REPLY =
	"Hmm, esse CPF não confere — dá uma olhadinha nos números e me manda de novo?";

/** Confirmação quando a identidade fecha a qualificação e a busca segue logo. */
export const IDENTIFY_CONFIRMED_REPLY = "Perfeito, recebido! Já vou buscar as melhores opções 🔎";

/** FIX-53: identidade vem ANTES do valor — após o CPF a qualificação CONTINUA
 * (valor/prazo/lance), então a confirmação não promete busca ainda. */
export const IDENTIFY_CONTINUE_REPLY = "Perfeito, recebido!";

/** Extrai um CPF VÁLIDO (11 dígitos + DV) do texto livre. Null se não houver. */
export function extractCpf(text: string): string | null {
	const candidates = (text ?? "").match(/\d[\d.\-\s]{9,17}\d/g) ?? [];
	for (const c of candidates) {
		const digits = c.replace(/\D/g, "");
		if (digits.length === 11 && isValidCpf(digits)) return digits;
	}
	return null;
}

/** waId vem com DDI (ex: 5562999887766) — a Bevi espera DDD+número (62999887766). */
export function waIdToCelular(waId: string): string {
	const digits = (waId ?? "").replace(/\D/g, "");
	return digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
}

/** Parece uma tentativa de CPF (número longo) mesmo sem validar? Usado pra
 * responder "CPF inválido" em vez de mandar o número pro agente conversar. */
function looksLikeCpfAttempt(text: string): boolean {
	const digits = (text ?? "").replace(/\D/g, "");
	return digits.length >= 9 && digits.length <= 14;
}

export type IdentifyCaptureResult =
	| { handled: false }
	| { handled: true; outcome: "captured" | "invalid" };

/** Captura textual do CPF quando o funil está no gate identify.
 * Retorna handled=false pra deixar o turno seguir pro agente. */
export async function captureIdentifyText(
	from: string,
	text: string,
): Promise<IdentifyCaptureResult> {
	const conv = await db.query.conversations.findFirst({ where: eq(conversations.waId, from) });
	if (!conv) return { handled: false };
	const meta = metaOf(conv);
	if (meta.identityCollected) return { handled: false };
	if (nextGate(meta) !== "identify") return { handled: false };

	const cpf = extractCpf(text);
	if (cpf) {
		await storeIdentity(conv.id, { cpf, celular: waIdToCelular(from) });
		return { handled: true, outcome: "captured" };
	}
	if (looksLikeCpfAttempt(text)) {
		return { handled: true, outcome: "invalid" };
	}
	return { handled: false };
}
