// FIX-47 — recuperação cross-device por telefone/CPF + verificação de posse (OTP).
//
// Opção (A) — decisão do Kairo via /to-saindo (D2): telefone/CPF não são segredo,
// então CONTEXTO LEVE (objetivo/rumo) é liberado pelo identificador, mas DADO
// SENSÍVEL (CPF, PDF de proposta, valores, documentos) só após OTP via
// WhatsApp/SMS pro próprio número — anti-pretexting (caso do casal com mesmo
// WhatsApp). A recuperação é OPT-IN: só roda quando o usuário pede; a primeira
// vez sem identificação nunca a invoca.

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { beviProposals, leads, verification } from "@/db/schema";
import { findContactByIdentifier } from "@/lib/contacts";
import { maskCpf } from "@/lib/conversation/identity";
import { normalizePhoneBR } from "@/lib/leads/phone";

const OTP_TTL_MS = 5 * 60_000; // 5 min
const OTP_PREFIX = "recovery-otp:";
const isProd = () => {
	const env = (process.env.TB_ENV ?? process.env.NODE_ENV ?? "").toLowerCase();
	return env === "prod" || env === "production";
};

function otpKey(phone: string): string {
	return `${OTP_PREFIX}${phone}`;
}

function hashOtp(phone: string, code: string): string {
	const secret = process.env.BETTER_AUTH_SECRET ?? "dev-recovery-secret";
	return createHmac("sha256", secret).update(`${phone}:${code}`).digest("hex");
}

// ─── Contexto leve (livre, sem verificação) ──────────────────────────────────

export interface LightContext {
	found: boolean;
	name: string | null;
	/** Objetivo/rumo conhecido — valor do bem da última intenção, sem PII. */
	creditValueHint: string | null;
}

/**
 * Contexto LEVE pelo identificador (telefone/CPF). Liberado sem verificação — é o
 * que a pessoa já contou. NUNCA inclui CPF, proposta, link ou documento.
 */
export async function getLightContext(input: {
	phone?: string | null;
	cpf?: string | null;
}): Promise<LightContext> {
	const contact = await findContactByIdentifier(input);
	if (!contact) return { found: false, name: null, creditValueHint: null };

	const lead = await db.query.leads.findFirst({
		where: eq(leads.contactId, contact.id),
		orderBy: [desc(leads.updatedAt)],
		columns: { creditValue: true },
	});

	return {
		found: true,
		name: contact.name,
		creditValueHint: lead?.creditValue ?? null,
	};
}

// ─── OTP (verificação de posse pra dado sensível) ─────────────────────────────

export type OtpSender = (phone: string, code: string) => Promise<void>;

/** Sender default: NÃO loga o código (seria vazamento). Em prod, plugar
 * WhatsApp/SMS real (PENDENTE-KAIRO — outbound). Aqui só registra o evento. */
const defaultSender: OtpSender = async (phone) => {
	console.log(
		JSON.stringify({ level: "info", source: "recovery-otp", event: "sent", phone_set: !!phone }),
	);
};

export interface RequestOtpResult {
	/** true se existe contato pro telefone (sem isso, não há o que recuperar). */
	found: boolean;
	/** Código em claro SÓ em ambiente local (echo pra teste/dev). Nunca em prod. */
	devCode?: string;
}

/**
 * Gera e "envia" um OTP pro PRÓPRIO número do contato. Não cria contato. Se o
 * telefone não casa nenhum contato, retorna found:false (sem enviar). Idempotente
 * por janela: sobrescreve o OTP anterior do mesmo telefone.
 */
export async function requestRecoveryOtp(
	rawPhone: string,
	deps: { sender?: OtpSender; now?: Date } = {},
): Promise<RequestOtpResult> {
	const phone = normalizePhoneBR(rawPhone);
	if (!phone) return { found: false };

	const contact = await findContactByIdentifier({ phone });
	if (!contact) return { found: false };

	const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
	const now = deps.now ?? new Date();
	const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

	// Sobrescreve OTP anterior do mesmo telefone (uma janela ativa por número).
	await db.delete(verification).where(eq(verification.identifier, otpKey(phone)));
	await db.insert(verification).values({
		id: `${otpKey(phone)}:${now.getTime()}`,
		identifier: otpKey(phone),
		value: hashOtp(phone, code),
		expiresAt,
	});

	await (deps.sender ?? defaultSender)(phone, code);

	return { found: true, ...(isProd() ? {} : { devCode: code }) };
}

/**
 * Verifica o OTP. Sucesso → consome o código (single-use) e devolve o contactId.
 * Falha (código errado, expirado, inexistente) → null. Comparação em tempo
 * constante (anti-timing).
 */
export async function verifyRecoveryOtp(
	rawPhone: string,
	code: string,
	deps: { now?: Date } = {},
): Promise<{ contactId: string } | null> {
	const phone = normalizePhoneBR(rawPhone);
	if (!phone || !/^\d{6}$/.test(code)) return null;

	const row = await db.query.verification.findFirst({
		where: eq(verification.identifier, otpKey(phone)),
	});
	if (!row) return null;

	const now = deps.now ?? new Date();
	if (row.expiresAt.getTime() < now.getTime()) {
		await db.delete(verification).where(eq(verification.identifier, otpKey(phone)));
		return null;
	}

	const expected = Buffer.from(row.value, "hex");
	const actual = Buffer.from(hashOtp(phone, code), "hex");
	const ok = expected.length === actual.length && timingSafeEqual(expected, actual);
	if (!ok) return null;

	// Single-use: consome.
	await db.delete(verification).where(eq(verification.identifier, otpKey(phone)));

	const contact = await findContactByIdentifier({ phone });
	if (!contact) return null;
	return { contactId: contact.id };
}

// ─── Sessão recuperada (DADO SENSÍVEL — só após OTP verificado) ───────────────

export interface RecoveredSession {
	contact: { id: string; name: string | null; phone: string | null; cpf: string | null };
	proposals: Array<{
		proposalId: string;
		administradora: string | null;
		creditValue: string | null;
		monthlyPayment: string | null;
		proposalStatus: string | null;
		consortiumProposalLink: string | null;
	}>;
}

/**
 * Retorna o histórico SENSÍVEL do contato (propostas, links, CPF mascarado).
 * Só deve ser chamado APÓS verifyRecoveryOtp ter sucesso — o caller é responsável
 * por exigir a verificação (a rota faz isso). CPF mascarado por default.
 */
export async function getRecoveredSession(contactId: string): Promise<RecoveredSession | null> {
	const contact = await db.query.contacts.findFirst({
		where: (c, { eq: e }) => e(c.id, contactId),
	});
	if (!contact) return null;

	const proposals = await db
		.select()
		.from(beviProposals)
		.where(eq(beviProposals.contactId, contactId))
		.orderBy(desc(beviProposals.createdAt));

	return {
		contact: {
			id: contact.id,
			name: contact.name,
			phone: contact.phone,
			cpf: contact.cpf ? maskCpf(contact.cpf) : null,
		},
		proposals: proposals.map((p) => ({
			proposalId: p.proposalId,
			administradora: p.administradora,
			creditValue: p.creditValue,
			monthlyPayment: p.monthlyPayment,
			proposalStatus: p.proposalStatus,
			consortiumProposalLink: p.consortiumProposalLink,
		})),
	};
}
