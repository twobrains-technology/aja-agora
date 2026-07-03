import type { Category } from "@/lib/agent/personas";
import type { Gate } from "@/lib/agent/qualify-state";

const TIMEFRAME_QUESTIONS: Record<Category, string> = {
	imovel: "Em quanto tempo você quer estar com o seu imóvel?",
	auto: "Em quanto tempo você quer estar com o carro novo?",
	moto: "Em quanto tempo você quer estar com a moto nova?",
	servicos: "Em quanto tempo você quer realizar isso?",
};

export function gateQuestion(gate: Gate, category?: Category | null): string | null {
	switch (gate) {
		case "name":
			// FIX-17: a pergunta do nome ("Como posso te chamar?") já sai no TEXTO
			// do agente (directive de primeiro contato). O card só complementa com
			// input focado — null aqui evita a pergunta aparecer duas vezes.
			return null;
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
			// Educação do doc, em prosa — explica lance embutido sem jargão de engine.
			return (
				"Você sabe o que é lance embutido? Fica tranquilo, a gente te ajuda!\n\n" +
				"Ele permite usar parte da própria carta de crédito como lance — numa carta de R$ 100 mil, " +
				"por exemplo, você usa uma fatia desse valor pra aumentar suas chances de contemplação, sem " +
				"precisar ter todo o lance em dinheiro hoje.\n\n" +
				"Quer considerar esse tipo de lance nas suas simulações?"
			);
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
