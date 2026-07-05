// Gate "identify" no WhatsApp (D1, docs/jornada/CONTEXT.md) — coleta textual.
//
// No WhatsApp o celular JÁ é conhecido (o próprio waId da conversa); falta só o
// CPF + aceite LGPD. O prompt avisa que enviar o CPF autoriza a consulta
// (consentimento por conduta, com aviso prévio explícito); a captura valida os
// dígitos verificadores antes de persistir — sempre CIFRADO, nunca em claro.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { gateQuestion } from "@/lib/agent/orchestrator/gate-questions";
import { nextGate } from "@/lib/agent/qualify-state";
import { isValidCpf, storeIdentity } from "@/lib/conversation/identity";
import { metaOf, persistMeta, reloadMeta } from "@/lib/conversation/meta";
import { isSimulatedWaId } from "./simulator-bus";

/** Beat 1 (CONTEXTO) da cadência 2-tempos do identify (FIX-210). Carrega o gancho
 * literal do docx — "analisar várias administradoras" + "aderentes ao seu perfil"
 * — que JUSTIFICA o pedido do CPF, mais o aviso LGPD (consentimento por conduta:
 * enviar o CPF autoriza a consulta). Fixo e determinístico: não deixamos o gancho
 * a cargo do LLM. Curto, sem emoji, sem hedge ("não é compromisso nenhum, tá?"). */
export const IDENTIFY_CONTEXT_WHATSAPP =
	"Pra eu analisar várias administradoras e achar as opções mais aderentes ao seu " +
	"perfil, preciso confirmar quem é você. Seus dados ficam protegidos (LGPD).";

/** Beat 2 (PEDIDO) do identify — FONTE ÚNICA (FIX-210). Antes havia dois textos
 * concorrentes (este e gateQuestion("identify")), o que gerava inconsistência
 * ("me envia seu CPF" aqui vs "preciso do CPF e celular" lá). Agora reexporta
 * gateQuestion("identify") — o pedido curto. O contexto (beat 1,
 * IDENTIFY_CONTEXT_WHATSAPP) sai como balão próprio antes deste. No WhatsApp o
 * celular já é o waId — só falta o CPF. */
export const IDENTIFY_WHATSAPP_PROMPT = gateQuestion("identify") as string;

export const IDENTIFY_INVALID_CPF_REPLY =
	"Hmm, esse CPF não confere — dá uma olhadinha nos números e me manda de novo?";

/** Confirmação quando a identidade fecha a qualificação e a busca segue logo. */
export const IDENTIFY_CONFIRMED_REPLY = "Perfeito, recebido! Já vou buscar as melhores opções.";

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
// Normaliza um número BR pro formato que a Bevi espera: DDD + 9 + 8 = 11 dígitos.
function normalizeCelularBR(raw: string): string {
	const digits = (raw ?? "").replace(/\D/g, "");
	// Remove o código do país (55) — a Bevi espera DDD + número, sem +55.
	const withoutCC = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
	// 9º dígito (bug de prod 2026-07-02, "CELULAR inválido" no fechamento): o waId
	// do WhatsApp DERRUBA o 9 inicial dos móveis BR → chega DDD + 8 dígitos (10). A
	// Bevi (Trilho A/fechamento) exige DDD + 9 + 8 (11) e rejeita 10. Todo waId de
	// WhatsApp é MÓVEL (não existe WhatsApp em fixo), então 10 dígitos = 9 faltando:
	// reinsere o 9 após o DDD.
	if (withoutCC.length === 10) return `${withoutCC.slice(0, 2)}9${withoutCC.slice(2)}`;
	return withoutCC;
}

// Fallback sintético (formato VÁLIDO, 11 díg) pro simulador quando
// SIMULATOR_TEST_CELULAR não está setado — evita a sequência de 24 dígitos que o
// UUID gerava. NÃO fecha na Bevi (ela valida o celular contra o CPF real), mas não
// crasha o formato. Determinístico a partir do UUID.
function syntheticCelularFromSimulatedWaId(waId: string): string {
	const digits = waId.replace(/\D/g, "");
	let hash = 0;
	for (const ch of digits) hash = (hash * 31 + ch.charCodeAt(0)) % 100_000_000;
	return `629${String(hash).padStart(8, "0")}`;
}

export function waIdToCelular(waId: string): string {
	// Simulador (SIM-<uuid>, src/app/api/admin/simulator/sessions/route.ts): a Bevi
	// VALIDA o celular (contra o CPF), então um número sintético não fecha — precisa
	// ser um número REAL. Usa o celular de teste do env (PII no vault/.env.local,
	// NUNCA hardcoded — regra do projeto). Sem o env, cai no sintético só pra não
	// quebrar o formato. Pareie com o CPF da MESMA conta de teste (ex.: Kairo).
	if (isSimulatedWaId(waId)) {
		const testCelular = process.env.SIMULATOR_TEST_CELULAR;
		return testCelular ? normalizeCelularBR(testCelular) : syntheticCelularFromSimulatedWaId(waId);
	}
	return normalizeCelularBR(waId);
}

/** Parece uma tentativa de CPF (número longo) mesmo sem validar? Usado pra
 * responder "CPF inválido" em vez de mandar o número pro agente conversar. */
function looksLikeCpfAttempt(text: string): boolean {
	const digits = (text ?? "").replace(/\D/g, "");
	return digits.length >= 9 && digits.length <= 14;
}

export type IdentifyCaptureResult =
	| { handled: false }
	| { handled: true; outcome: "captured" | "invalid" | "ask-cpf" };

/** Captura textual do CPF quando o funil está no gate identify.
 * Retorna handled=false só quando o gate identify NÃO está ativo (conversa
 * inexistente, identidade já coletada, ou nextGate ainda não chegou aqui) —
 * nesse caso o turno segue pro agente normalmente.
 *
 * FIX-217 (Ata 2026-07-04, item 9): enquanto o gate identify ESTÁ ativo, o
 * texto do usuário é SEMPRE interceptado — CPF válido (captured), CPF-like
 * inválido (invalid) ou qualquer outra coisa (ask-cpf, reemite o pedido). Antes,
 * texto sem cara de CPF (pergunta, tentativa de pular) caía em handled:false e
 * seguia pro pipeline geral do agente, que podia narrar avanço/busca sem o CPF
 * coletado — o gate virava sugestão, não trava (Lei 4: invariante crítico vira
 * código, não regra-no-prompt). Espelha o padrão exaustivo de contract-capture. */
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
		// FIX-211: dado capturado → zera o contador de cobranças do identify (sobre o
		// meta JÁ atualizado por storeIdentity, sem sobrescrever identityCollected).
		const after = await reloadMeta(conv.id);
		if (after.gateAttempts?.identify !== undefined) {
			const { identify: _drop, ...rest } = after.gateAttempts;
			await persistMeta(conv.id, { ...after, gateAttempts: rest });
		}
		return { handled: true, outcome: "captured" };
	}
	if (looksLikeCpfAttempt(text)) {
		return { handled: true, outcome: "invalid" };
	}
	return { handled: true, outcome: "ask-cpf" };
}
