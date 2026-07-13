import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, leads } from "@/db/schema";
import { createLeadFromConversation } from "@/lib/admin/lead-stage-tracker";
import { transitionLeadStage } from "@/lib/admin/lead-transitions";
import { attachContact } from "@/lib/contacts";
import { normalizePhoneBR } from "./phone";

export type ContactCaptureResult =
	| { ok: true; leadId: string; created: boolean }
	| { ok: false; error: string };

// Stopwords PT-BR que aparecem antes do nome em respostas coloquiais
// ("sou o Kairo", "me chamo Alan", "eu sou a Helena", "meu nome é Pedro").
// Defensivo contra agent extrair tokens errados ao chamar save_contact_name
// (PF-01 detectado pelo PO Lead). Inclui pronomes, copulas, e palavras
// estruturais comuns. Compare em lowercase + sem acentos.
const NAME_STOPWORDS = new Set([
	"sou",
	"e",
	"eh",
	"o",
	"a",
	"os",
	"as",
	"eu",
	"me",
	"meu",
	"minha",
	"nome",
	"chamo",
	"chama",
	"chamam",
	"to",
	"ta",
	"sim",
	"oi",
	"ola",
	"ola,",
	"se",
	"de",
	"da",
	"do",
	"das",
	"dos",
]);

function stripAccents(s: string): string {
	return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function extractFirstName(raw: string): string | null {
	const tokens = raw.trim().split(/\s+/);
	for (const t of tokens) {
		const cleaned = t.replace(/[.,;:!?]+$/, "");
		if (!cleaned) continue;
		const normalized = stripAccents(cleaned).toLowerCase();
		if (NAME_STOPWORDS.has(normalized)) continue;
		return cleaned;
	}
	return null;
}

// FIX-299 (loop-de-goal r10, P9/P10 — Qwen 3.5 Fast, 2026-07-12): "Show,
// kairo!" — o agente ecoou o nome em minúscula porque `contactName` é
// salvo/ecoado como veio do usuário. Regra soft de capitalização no prompt não
// segura sob modelo mais fraco (Lei 4) — normalização determinística no save.
const NAME_PARTICLES = new Set(["de", "da", "do", "das", "dos"]);

/** Title Case determinístico de um nome (ou nome composto), respeitando
 * partículas comuns pt-BR ("de"/"da"/"do"/"das"/"dos" ficam minúsculas quando
 * não são a primeira palavra) e capitalizando cada lado de nome hifenizado
 * ("jean-luc" → "Jean-Luc"). Independe de como o usuário digitou
 * (minúsculo/maiúsculo/misto). FIX-299. */
export function capitalizeName(raw: string): string {
	return raw
		.trim()
		.split(/\s+/)
		.map((word, i) => capitalizeWord(word, i === 0))
		.join(" ");
}

function capitalizeWord(word: string, isFirst: boolean): string {
	if (!isFirst && NAME_PARTICLES.has(word.toLowerCase())) return word.toLowerCase();
	return word
		.split("-")
		.map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part))
		.join("-");
}

/**
 * Persiste o nome capturado conversacionalmente. Idempotente:
 *  - Cria lead novo se não existir (stage='novo')
 *  - Atualiza nome se lead já existir (não regride stage)
 * Sempre atualiza `conversations.contactName`.
 *
 * Aceita free-text do usuário ("sou o Alan Carlos") — extrai só o
 * primeiro nome. Aceita letras (incl. acentos), hífen e apóstrofo.
 */
export async function saveContactName(
	conversationId: string,
	rawName: string,
): Promise<ContactCaptureResult> {
	const trimmed = rawName.trim();
	if (!trimmed) return { ok: false, error: "name_invalid" };

	const firstToken = extractFirstName(trimmed);
	if (!firstToken || firstToken.length < 2 || firstToken.length > 30) {
		return { ok: false, error: "name_invalid" };
	}
	// Letras (incluindo acentos), hífen e apóstrofo — sem dígitos.
	if (!/^[\p{L}'-]+$/u.test(firstToken)) {
		return { ok: false, error: "name_invalid" };
	}
	// FIX-299: capitalização determinística — independe de como o usuário digitou.
	const displayName = capitalizeName(firstToken);

	await db
		.update(conversations)
		.set({ contactName: displayName, updatedAt: new Date() })
		.where(eq(conversations.id, conversationId));

	const existing = await db.query.leads.findFirst({
		where: eq(leads.conversationId, conversationId),
	});

	if (existing) {
		await db
			.update(leads)
			.set({ name: displayName, updatedAt: new Date() })
			.where(eq(leads.id, existing.id));
		return { ok: true, leadId: existing.id, created: false };
	}

	const { leadId } = await createLeadFromConversation({
		conversationId,
		name: displayName,
		phone: null,
		email: null,
	});
	return { ok: true, leadId, created: true };
}

/**
 * Persiste o WhatsApp capturado via card UI. Idempotente:
 *  - Cria lead se não existir (com phone), promovendo stage 'novo'→'engajado'
 *  - Atualiza phone + promove stage 'novo'→'engajado' (onlyAdvance)
 *  - Se já em 'qualificado+', só atualiza phone (não regride)
 *  - Atualiza conversations.waId pra suportar cross-channel
 *
 * Vale também pra lead simulado: o simulador é "demo path" e deve
 * refletir o mesmo comportamento de stage que prod.
 */
export async function saveContactWhatsapp(
	conversationId: string,
	rawPhone: string,
): Promise<ContactCaptureResult> {
	const phone = normalizePhoneBR(rawPhone);
	if (!phone) {
		return { ok: false, error: "phone_invalid" };
	}

	await db
		.update(conversations)
		.set({ waId: phone, updatedAt: new Date() })
		.where(eq(conversations.id, conversationId));

	const existing = await db.query.leads.findFirst({
		where: eq(leads.conversationId, conversationId),
	});

	if (existing) {
		await db.update(leads).set({ phone, updatedAt: new Date() }).where(eq(leads.id, existing.id));

		await transitionLeadStage(existing.id, "engajado", { type: "system" }, { onlyAdvance: true });
		// FIX-42: religa cliente unificado pelo telefone.
		await attachContact({ conversationId, leadId: existing.id, input: { phone } });
		return { ok: true, leadId: existing.id, created: false };
	}

	const { leadId } = await createLeadFromConversation({
		conversationId,
		name: null,
		phone,
		email: null,
	});
	await transitionLeadStage(leadId, "engajado", { type: "system" }, { onlyAdvance: true });
	return { ok: true, leadId, created: true };
}
