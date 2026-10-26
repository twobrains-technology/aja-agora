// Gate "identify" no WhatsApp (D1, docs/jornada/CONTEXT.md) — coleta textual.
//
// No WhatsApp o celular JÁ é conhecido (o próprio waId da conversa); falta só o
// CPF + aceite LGPD. O prompt avisa que enviar o CPF autoriza a consulta
// (consentimento por conduta, com aviso prévio explícito); a captura valida os
// dígitos verificadores antes de persistir — sempre CIFRADO, nunca em claro.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { gateQuestion } from "@/lib/agent/orchestrator/gate-questions";
import {
	ehIdentidadeDeVitrine,
	identidadeDeVitrine,
	vitrineDisponivel,
} from "@/lib/bevi/identidade-vitrine";
import { storeIdentity } from "@/lib/conversation/identity";
import { metaOf, persistMeta, reloadMeta } from "@/lib/conversation/meta";
import { decidirCpfDoTexto, pedidoDeCpfNoUltimoBalao } from "@/lib/conversation/telefone-ou-cpf";
import { isSimulatedWaId } from "./simulator-bus";

// A classificação telefone × CPF mora num módulo só
// (`@/lib/conversation/telefone-ou-cpf`), importada daqui e pelo Pi. Reexportada
// porque `contract-capture.ts` já a importa deste arquivo.
export {
	type DecisaoDoCpfDoTexto,
	decidirCpfDoTexto,
	extractCpf,
	pedidoDeCpfNoUltimoBalao,
} from "@/lib/conversation/telefone-ou-cpf";

/** Beat 1 (CONTEXTO) da cadência 2-tempos do identify (FIX-210). Carrega o gancho
 * literal do docx — "analisar várias administradoras" + "aderentes ao seu perfil"
 * — que JUSTIFICA o pedido do CPF, mais o aviso LGPD (consentimento por conduta:
 * enviar o CPF autoriza a consulta). Fixo e determinístico: não deixamos o gancho
 * a cargo do LLM. Curto, sem emoji, sem hedge ("não é compromisso nenhum, tá?"). */
export function identifyContextWhatsapp(): string {
	// 2026-08-27 — a justificativa acompanha o MOMENTO do gate. Com a vitrine, as
	// opções já foram achadas e estão na conversa quando o CPF é pedido; dizer
	// "pra achar as opções aderentes ao seu perfil" ali seria falso, e o cliente
	// que acabou de comparar cartas percebe. Sem vitrine o gate volta a ser
	// pré-busca e a frase original volta com ele.
	if (!vitrineDisponivel()) {
		return (
			"Pra eu analisar várias administradoras e achar as opções mais aderentes ao seu " +
			"perfil, preciso confirmar quem é você. Seus dados ficam protegidos (LGPD)."
		);
	}
	return (
		"Pra seguir com a cota que você escolheu, preciso confirmar quem é você. " +
		"Seus dados ficam protegidos (LGPD)."
	);
}

/** Beat 2 (PEDIDO) do identify — FONTE ÚNICA (FIX-210). Antes havia dois textos
 * concorrentes (este e gateQuestion("identify")), o que gerava inconsistência
 * ("me envia seu CPF" aqui vs "preciso do CPF e celular" lá). Agora reexporta
 * gateQuestion("identify") — o pedido curto. O contexto (beat 1,
 * IDENTIFY_CONTEXT_WHATSAPP) sai como balão próprio antes deste. No WhatsApp o
 * celular já é o waId — só falta o CPF. */
// FUNÇÃO, não `const`: a copy do `identify` é condicional (segue o momento do
// gate), e uma constante de topo de módulo congelaria a decisão no instante do
// import — antes mesmo de o ambiente estar lido.
export function identifyWhatsappPrompt(): string {
	return gateQuestion("identify") as string;
}

export const IDENTIFY_INVALID_CPF_REPLY =
	"Hmm, esse CPF não confere — dá uma olhadinha nos números e me manda de novo?";

/** Confirmação quando a identidade fecha a qualificação e a busca segue logo. */
export const IDENTIFY_CONFIRMED_REPLY = "Perfeito, recebido! Já vou buscar as melhores opções.";

/** FIX-53: identidade vem ANTES do valor — após o CPF a qualificação CONTINUA
 * (valor/prazo/lance), então a confirmação não promete busca ainda. */
export const IDENTIFY_CONTINUE_REPLY = "Perfeito, recebido!";

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

/**
 * O CELULAR DO FECHAMENTO — nunca um número inventado.
 *
 * No WhatsApp o celular É o número da conversa; o modelo não precisa pedí-lo. No
 * simulador (waId `SIM-<uuid>`) o número é sintético, e a Bevi valida celular × CPF:
 * um hash não fecha (medido em 25/10/2026, `BeviApiError: Dados inválidos`). Então o
 * fechamento de uma conversa simulada usa o par de teste do ambiente — nunca o hash.
 * Sem par de teste, o fechamento é recusado: `fala como teste`, não fabrica número.
 */
export type CelularDeFechamento =
	| { ok: true; celular: string; origem: "conversa" | "par-de-teste" }
	| { ok: false; motivo: "falta-o-par-de-teste" };

export function celularDeFechamento(args: {
	waId: string | null;
	cpf: string | null;
	celular: string | null;
}): CelularDeFechamento {
	if (!args.waId || !isSimulatedWaId(args.waId)) {
		if (!args.celular) return { ok: false, motivo: "falta-o-par-de-teste" };
		return { ok: true, celular: normalizeCelularBR(args.celular), origem: "conversa" };
	}

	const parDeTeste = identidadeDeVitrine();
	if (parDeTeste && ehIdentidadeDeVitrine(args.cpf)) {
		return { ok: true, celular: parDeTeste.celular, origem: "par-de-teste" };
	}

	const testCelular = process.env.SIMULATOR_TEST_CELULAR?.trim();
	if (testCelular)
		return { ok: true, celular: normalizeCelularBR(testCelular), origem: "par-de-teste" };

	return { ok: false, motivo: "falta-o-par-de-teste" };
}

export function waIdToCelular(waId: string): string {
	// Simulador (SIM-<uuid>, src/app/api/admin/simulator/sessions/route.ts): a Bevi
	// VALIDA o celular (contra o CPF), então um número sintético não fecha — precisa
	// ser um número REAL. Usa o celular de teste do env (PII no vault/.env.local,
	// NUNCA hardcoded — regra do projeto). Sem o env, cai no sintético só pra não
	// quebrar o formato. Pareie com o CPF da MESMA conta de teste (ex.: Kairo).
	if (isSimulatedWaId(waId)) {
		const testCelular = process.env.SIMULATOR_TEST_CELULAR?.trim();
		return testCelular ? normalizeCelularBR(testCelular) : syntheticCelularFromSimulatedWaId(waId);
	}
	return normalizeCelularBR(waId);
}

/**
 * O que responder a um CPF capturado. Com o vendedor livre, a resposta é NADA e o
 * turno do agente continua: as cartas já estão na tela e o cliente acabou de dar o
 * dado que a proposta exige — ele espera a proposta, não um "recebido".
 *
 * A frase fixa (`IDENTIFY_CONFIRMED_REPLY`) era do funil, onde o CPF vinha ANTES da
 * busca e "já vou buscar as melhores opções" era verdade. Na branch ela mente e deixa
 * o cliente parado até mandar outra mensagem. Medido no dev, conversa 26dd148d
 * (25/10/2026): "pode usar meus dados, meu cpf é 529.982.247-25" respondia com a
 * frase fixa e o card de proposta só saía no turno seguinte.
 *
 * Só a tentativa de CPF inválida tem resposta própria.
 */
export function respostaDoCaptureDeCpf(capture: IdentifyCaptureResult): string | null {
	if (!capture.handled) return null;
	if (capture.outcome === "invalid") return IDENTIFY_INVALID_CPF_REPLY;
	return null;
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
 * não é uma regra que ele possa desobedecer. O gate segue pendente (`o funil antigo`) e é
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
	// Com o vendedor livre não existe gate de identidade: o CPF do cliente vale
	// sempre que ele mesmo o digitar (é dado dele, e a proposta exige). O que NÃO
	// vale é ler telefone ou número comprido como CPF — ver `decidirCpfDoTexto`.
	//
	// O "acabou de pedir" é o balão ANTERIOR do agente: a pergunta que ele fez é
	// fato de servidor (como `nameCardExibido`), não algo que se deduza do texto.
	const ultima = await db.query.messages.findFirst({
		where: eq(messages.conversationId, conv.id),
		orderBy: (m, { desc }) => [desc(m.createdAt)],
	});

	const decisao = decidirCpfDoTexto(text, { pedidoDeCpf: pedidoDeCpfNoUltimoBalao(ultima) });
	if (decisao.outcome === "captured") {
		await storeIdentity(conv.id, { cpf: decisao.cpf, celular: waIdToCelular(from) });
		// FIX-211: dado capturado → zera o contador de cobranças do identify (sobre o
		// meta JÁ atualizado por storeIdentity, sem sobrescrever identityCollected).
		const after = await reloadMeta(conv.id);
		if (after.gateAttempts?.identify !== undefined) {
			const { identify: _drop, ...rest } = after.gateAttempts;
			await persistMeta(conv.id, { ...after, gateAttempts: rest });
		}
		return { handled: true, outcome: "captured" };
	}
	if (decisao.outcome === "invalid") return { handled: true, outcome: "invalid" };
	// Não é CPF nem resposta a um pedido de CPF → não é uma resposta a este gate.
	// É OUTRA COISA, e quem responde outra coisa é o modelo.
	return { handled: false };
}
