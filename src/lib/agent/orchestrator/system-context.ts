import type { ConversationMetadata } from "@/lib/agent/personas";
import type { ChatMessage } from "./types";

export function buildSystemContext(args: {
	knownName: string | null;
	newlyExtractedExperience: ConversationMetadata["experiencePrev"] | null;
	meta: ConversationMetadata;
}): ChatMessage[] {
	const { knownName, newlyExtractedExperience, meta } = args;
	const out: ChatMessage[] = [];

	if (knownName) {
		out.push({ role: "system", content: `Nome do usuario: "${knownName}"` });
	}

	if (newlyExtractedExperience === "first") {
		out.push({
			role: "system",
			content: `O usuario acabou de revelar nesta mensagem que e a PRIMEIRA VEZ dele com consorcio. FLUXO IMPORTANTE: na sua resposta agora, reaja brevemente E EM SEGUIDA dê uma explicação curta (3-4 frases) sobre o essencial: grupo de pessoas que paga parcelas mensais sem juros, contemplacao por sorteio ou lance, diferenca de financiamento. Tom acolhedor, sem jargao tecnico (nada de cota/lance livre/fundo reserva). Termine sem pergunta — o sistema dispara a proxima etapa.`,
		});
	} else if (newlyExtractedExperience === "returning") {
		out.push({
			role: "system",
			content: `O usuario acabou de revelar que ja tem familiaridade com consorcio. FLUXO: reaja em UMA frase curta tipo "Show, vamos direto ao ponto entao." NAO explique o produto, NAO faca pergunta. O sistema dispara a proxima etapa em seguida.`,
		});
	}

	if (meta.experiencePrev === "doubts" && !meta.doubtsAddressed) {
		out.push({
			role: "system",
			content: `O usuario clicou "Tenho duvidas" anteriormente e agora esta perguntando algo especifico. Responda a duvida dele de forma direta e CLARA, em 2-4 frases. NAO termine com "tem mais alguma duvida?", "ficou claro?", "alguma outra pergunta?" ou similar — o sistema dispara automaticamente a transicao com botoes pra ele decidir se quer seguir ou pedir mais info. Voce so precisa entregar a resposta e parar.`,
		});
	}

	return out;
}
