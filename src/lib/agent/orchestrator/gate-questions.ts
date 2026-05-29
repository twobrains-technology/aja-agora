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
		case "experience":
			return "Você já fez consórcio antes?";
		case "consent":
			return "Posso te fazer 3 perguntinhas rápidas pra entender seu perfil?";
		case "credit":
			return "Qual faixa de crédito faz mais sentido pra você?";
		case "timeframe":
			return category ? TIMEFRAME_QUESTIONS[category] : null;
		case "lance":
			return "Você teria uma reserva pra dar um lance e antecipar a contemplação?";
		case "lance-embutido":
			// Educação do doc, em prosa — explica lance embutido sem jargão de engine.
			return (
				"Você sabe o que é lance embutido? Fica tranquilo, a gente te ajuda!\n\n" +
				"Ele permite usar parte da própria carta de crédito como lance — numa carta de R$ 100 mil, " +
				"por exemplo, você usa uma fatia desse valor pra aumentar suas chances de contemplação, sem " +
				"precisar ter todo o lance em dinheiro hoje.\n\n" +
				"Quer considerar esse tipo de lance nas suas simulações?"
			);
		case "doubts-wait":
		case "search":
			return null;
	}
}
