import type { Category } from "@/lib/agent/personas";
import type { Gate } from "@/lib/agent/qualify-state";

/** FIX-212 (split 2 tempos) — a EDUCAÇÃO do lance embutido e a PERGUNTA são
 * constantes separadas. Preserva as âncoras do docx (própria carta / R$ 100 mil /
 * chances de contemplação / sem precisar hoje / "a gente te ajuda"). Na WEB o card
 * mostra as duas juntas (gateQuestion compõe abaixo); no WhatsApp a educação sai
 * como balão de contexto e o card carrega SÓ a pergunta — channel-aware, o card
 * deixa de ser 3 parágrafos de aula + a pergunta numa unidade só. */
const formatCredit0 = (n: number) =>
	n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** FIX-245 (rodada 2, Fable r1, §D4.d do veredito): o gate `lance-embutido`
 * roda PÓS-reveal desde o FIX-215 — `meta.recommendedOffer.creditValue` já é
 * a carta REAL que o cliente está vendo na tela. Um consultor de verdade usa
 * o número do cliente, não um exemplo genérico. Sem carta real (chamador que
 * ainda não tem o snapshot) → mantém o exemplo honesto de "R$ 100 mil". */
export function lanceEmbutidoEdu(creditValue?: number): string {
	const cartaPhrase =
		creditValue != null && Number.isFinite(creditValue) && creditValue > 0
			? `na sua carta de ${formatCredit0(creditValue)}`
			: "numa carta de R$ 100 mil";
	return (
		"Você sabe o que é lance embutido? Fica tranquilo, a gente te ajuda. " +
		`É usar parte da própria carta de crédito como lance — ${cartaPhrase}, por exemplo, ` +
		"você usa uma fatia desse valor pra aumentar suas chances de contemplação, " +
		"sem precisar ter todo o lance em dinheiro hoje."
	);
}
/** @deprecated Use `lanceEmbutidoEdu(creditValue)` pra usar a carta REAL do
 * cliente — este const mantém só o fallback genérico, pra quem ainda não
 * repassou o valor real. */
export const LANCE_EMBUTIDO_EDU = lanceEmbutidoEdu();
export const LANCE_EMBUTIDO_ASK = "Quer considerar esse tipo de lance nas suas simulações?";

const TIMEFRAME_QUESTIONS: Record<Category, string> = {
	imovel: "Em quanto tempo você quer estar com o seu imóvel?",
	auto: "Em quanto tempo você quer estar com o carro novo?",
	moto: "Em quanto tempo você quer estar com a moto nova?",
	servicos: "Em quanto tempo você quer realizar isso?",
};

/** FIX-233 (handoff agente-vendas-consorcio, 2026-07-09) — gate `desire`, não
 * bloqueante: 1ª das duas perguntas de contexto (bem específico + motivo de
 * agora). A pergunta sai no TEXTO do agente (directive), não num card — a
 * segunda pergunta (motivo) é conversa livre, sem gate próprio. */
const DESIRE_QUESTIONS: Record<Category, string> = {
	imovel: "Qual imóvel você tem em mente?",
	auto: "Qual carro você tem em mente?",
	moto: "Qual moto você tem em mente?",
	servicos: "O que você tem em mente pra realizar?",
};

export function gateQuestion(
	gate: Gate,
	category?: Category | null,
	creditValue?: number,
): string | null {
	switch (gate) {
		case "name":
			// FIX-17: a pergunta do nome ("Como posso te chamar?") já sai no TEXTO
			// do agente (directive de primeiro contato). O card só complementa com
			// input focado — null aqui evita a pergunta aparecer duas vezes.
			return null;
		case "desire":
			return category ? DESIRE_QUESTIONS[category] : null;
		case "experience":
			return "Você já fez consórcio antes?";
		case "consent":
			return "Posso te fazer 3 perguntinhas rápidas pra entender seu perfil?";
		case "credit":
			// FIX-2: "valor do bem" (linguagem do docx), não "faixa de crédito".
			return "Qual valor do bem faz mais sentido pra você?";
		case "timeframe":
			return category ? TIMEFRAME_QUESTIONS[category] : null;
		case "lance":
			return "Você teria uma reserva pra dar um lance e antecipar a contemplação?";
		case "lance-value":
			// docx passo 2 (linha 21-22): se "sim" → "Qual valor aproximado?"
			return "Boa! E qual valor aproximado você pensa em dar de lance?";
		case "lance-embutido":
			// FIX-212: educação + pergunta compostas (a WEB usa o card completo). No
			// WhatsApp o adapter usa lanceEmbutidoEdu()/LANCE_EMBUTIDO_ASK separados
			// (educação num balão, card só com a pergunta) — split 2 tempos.
			// FIX-245: creditValue (carta REAL, pós-reveal) substitui o exemplo
			// genérico de "R$ 100 mil" quando disponível.
			return `${lanceEmbutidoEdu(creditValue)}\n\n${LANCE_EMBUTIDO_ASK}`;
		case "identify":
			// FIX-210 (reforma de conversa WhatsApp): a copy do identify foi UNIFICADA
			// e encurtada — aqui vive só o PEDIDO (beat 2 da cadência 2-tempos). O
			// contexto (beat 1: "pra comparar as administradoras e achar sua melhor
			// opção") vem do LLM como balão próprio, entregue pelo adapter antes deste
			// pedido. Antes havia DOIS textos concorrentes — este e o
			// IDENTIFY_WHATSAPP_PROMPT ("me envia seu CPF... celular eu já tenho") —
			// que agora reexporta ESTA fonte única (identify-capture.ts). No WhatsApp o
			// celular já é o waId, então só falta o CPF. Sem emoji, sem hedge, sem
			// "preciso do CPF e celular" (FIX-53 pedia identidade antes do valor; o
			// gancho forward-looking migrou pro beat de contexto do LLM).
			return "Me manda seu CPF, só os números. Seu celular eu já pego aqui do WhatsApp.";
		case "simulator-offer":
			// docx passo 4 (linha 34): oferta literal do simulador.
			return (
				"Se quiser, temos o nosso simulador pra ver como ficariam as suas parcelas, " +
				"caso você seja contemplado em 3, 6 ou 12 meses — que tal?"
			);
		case "doubts-wait":
		case "search":
		case "decision":
			// "decision" não é uma pergunta de chip — é o card present_decision_prompt
			// ("Esse plano faz sentido?"), dirigido pelo orquestrador no fim do passo 4.
			return null;
	}
}
