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

/** DDDs realmente atribuídos no Brasil (Anatel). Fora desta lista, 11 dígitos
 *  não são telefone — e é o que separa o CPF `028…` da sessão `a68b1945` de um
 *  celular ditado. */
const DDD_VALIDOS = new Set([
	11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43,
	44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77,
	79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/** O texto traz um número que tem cara de CELULAR (DDD válido + 9 + 8 dígitos)? */
function pareceCelularBR(text: string): boolean {
	for (const m of (text ?? "").matchAll(/\d{11}/g)) {
		const d = m[0];
		if (DDD_VALIDOS.has(Number(d.slice(0, 2))) && d[2] === "9") return true;
	}
	return false;
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
 *
 * Só intercepta o que É um CPF: válido (captured) ou uma tentativa de CPF com os
 * dígitos errados (invalid). **Qualquer outra coisa — uma pergunta, uma objeção,
 * um "por que você precisa disso?" — segue pro MODELO.**
 *
 * FIX-357 (revoga o `ask-cpf` do FIX-217). O FIX-217 fazia o gate interceptar TODO
 * texto e reemitir o pedido do CPF em cima de qualquer desvio, sem nunca chamar o
 * LLM. Ao vivo isso é o agente bitolado: o cliente pergunta uma coisa e leva o mesmo
 * pedido de CPF na cara, de novo. Ele invocou a Lei 4 ("invariante vira código") —
 * mas aplicou ao alvo errado: o invariante é sobre a AÇÃO ("não simule sem CPF"),
 * nunca sobre a FALA ("não deixe o cliente perguntar").
 *
 * E a AÇÃO já estava blindada em código, sem depender deste regex: `tool-policy.ts`
 * só coloca `search_groups` e os cards do reveal no toolset quando
 * `identityCollected === true`. Sem CPF o modelo NÃO TEM a ferramenta de busca —
 * não é uma regra que ele possa desobedecer. O gate segue pendente (`nextGate`) e é
 * recobrado no turno seguinte. */
export async function captureIdentifyText(
	from: string,
	text: string,
): Promise<IdentifyCaptureResult> {
	const conv = await db.query.conversations.findFirst({ where: eq(conversations.waId, from) });
	if (!conv) return { handled: false };
	const meta = metaOf(conv);
	if (meta.identityCollected) return { handled: false };

	// FIX-431 — CPF OFERECIDO tem fechadura em qualquer gate.
	//
	// Produção, 2026-08-13, sessão `a68b1945`: o funil estava travado no gate
	// `credit`, o cliente perguntou "Precisou do cpf?" e digitou o CPF. Como o
	// gate corrente não era `identify`, isto aqui devolvia `handled:false`, o
	// texto caía no modelo e ele RECUSAVA o dado ("não precisa compartilhar CPF
	// comigo não"). O que destravava a venda voltou para o cliente; dois turnos
	// depois, handoff.
	//
	// Enquanto `identityCollected` for falso, CPF com DV válido é o dado que a
	// administradora exige para simular: aceitá-lo nunca atrapalha o funil, e o
	// gate se recomputa sozinho no turno seguinte. A porta continua estreita —
	// só CPF válido entra; qualquer outra coisa segue para o modelo (abaixo).
	const noGateDeIdentidade = nextGate(meta) === "identify";

	// FORA do gate, um número de 11 dígitos que PARECE CELULAR não é capturado.
	//
	// ~1% dos números de 11 dígitos passam no dígito verificador por acaso, e o
	// mais provável deles na conversa é um telefone ditado — viraria identidade
	// persistida em silêncio, com a administradora reprovando só no fechamento.
	//
	// Exigir a palavra "CPF" seria fácil e ERRADO: na sessão `a68b1945` o cliente
	// digitou o CPF sozinho, sem escrever nada em volta ("02134567880"), depois
	// de perguntar se era isso que faltava. É exatamente esse caso que a
	// fechadura existe para pegar.
	//
	// A distinção é estrutural: celular brasileiro é DDD válido + 9 + 8 dígitos.
	// O CPF daquela sessão começa em "02", que não é DDD de lugar nenhum.
	if (!noGateDeIdentidade && pareceCelularBR(text) && !/\bcpf\b/i.test(text)) {
		return { handled: false };
	}

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
	// Tentativa MALFORMADA de CPF só é interceptada quando o gate é o de
	// identidade — fora dele, um número comprido pode ser qualquer coisa (valor,
	// telefone, ano) e sequestrar o turno seria pior que deixar o modelo
	// responder.
	if (noGateDeIdentidade && looksLikeCpfAttempt(text)) {
		return { handled: true, outcome: "invalid" };
	}
	if (!noGateDeIdentidade) return { handled: false };
	// Não é CPF nem tentativa de CPF → não é uma resposta a este gate. É OUTRA COISA,
	// e quem responde outra coisa é o modelo.
	return { handled: false };
}
