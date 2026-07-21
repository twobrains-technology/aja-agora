import type { ConversationMetadata } from "@/lib/agent/personas";
import type { Gate } from "@/lib/agent/qualify-state";
import { buildMentionedOfferDirective, type ChosenOffer } from "./choose-offer";
import type { ChatMessage } from "./types";

const brl = (n: number) =>
	n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

// FIX-340(a) (bloco-c-whatsapp-invariantes): o turno atual reclama que já
// mandou um dado ("já te mandei meu CPF", "já enviei", "já passei"). Não
// checa CPF em si (index.ts já faz isso via extractCpf, mais preciso —
// dígito verificador real) — só a QUEIXA em texto livre.
const IDENTITY_RESEND_COMPLAINT_RE = /\bj[áa]\s+(te\s+)?(mandei|enviei|passei|dei)\b/i;

/** O turno reclama textualmente que já enviou um dado antes ("já te mandei
 * meu CPF"). Usado em conjunto com `extractCpf(userText) !== null` (index.ts)
 * pra detectar reenvio de identidade já coletada — FIX-340(a). */
export function looksLikeIdentityResendComplaint(text: string): boolean {
	return IDENTITY_RESEND_COMPLAINT_RE.test(text);
}

/** O que cada gate precisa descobrir — em INTENÇÃO, não em frase pronta. O
 * modelo escolhe as palavras; nós só dizemos o que falta saber. */
export const GATE_INTENT: Record<string, string> = {
	name: "como ele quer ser chamado",
	desire: "qual bem específico ele tem em mente, e por que agora",
	credit: "quanto custa o bem que ele quer",
	identify: "o CPF e o celular dele (a administradora exige pra trazer ofertas reais)",
	experience: "se ele já fez consórcio antes",
	"reco-consent": "se ele topa ver a opção que a gente recomenda",
	timeframe: "em quanto tempo ele quer estar com o bem",
	lance: "se ele teria como dar um lance pra antecipar a contemplação",
	"lance-value": "quanto ele pensa em dar de lance",
	"lance-embutido": "se ele quer considerar lance embutido (usar parte da própria carta)",
	"simulator-offer": "se ele quer simular a parcela em diferentes meses de contemplação",
	decision: "se o plano faz sentido pra ele",
};

export function buildSystemContext(args: {
	knownName: string | null;
	newlyExtractedExperience: ConversationMetadata["experiencePrev"] | null;
	meta: ConversationMetadata;
	/** FIX-258: cota que o texto do turno resolveu deterministicamente contra
	 * as já exibidas em tela (resolveOfferMentionForConversation) — rota
	 * ANTES da tool-call, nunca depende da LLM adivinhar o groupId. */
	mentionedOffer?: ChosenOffer | null;
	/** O usuário sinalizou que não entendeu, e este gate segue pendente.
	 * Substitui o antigo curto-circuito CLARIFY_LEAD_IN (FIX-301), que respondia
	 * por texto fixo SEM invocar o modelo e repetia a mesma pergunta — a causa
	 * direta do "o agente responde sempre a mesma coisa". Agora o modelo
	 * reformula; nós só informamos o que ainda falta descobrir. */
	confusedAboutGate?: Gate | null;
	/** O usuário questionou a exatidão do valor da carta ou o critério da
	 * recomendação. Substitui o fallback pré-fabricado (FIX-282/293): em vez de
	 * o servidor RESPONDER, ele entrega os NÚMEROS REAIS e o modelo redige. O
	 * invariante ("nunca inventar número") continua garantido — o número vem
	 * daqui, não da cabeça do modelo. */
	exactnessFacts?: {
		administradora?: string;
		creditValue: number;
		requestedValue?: number;
	} | null;
	/** O gate que o funil quer resolver a seguir. Informamos a INTENÇÃO (o que
	 * falta descobrir) — não a frase. O modelo pergunta com as palavras dele, e o
	 * card que vem depois mostra só o input (`modelAsked`). Isso substitui o
	 * modelo antigo, em que o servidor fazia a pergunta canônica e o modelo era
	 * proibido de perguntar ("NÃO faça pergunta") — o que deixava a conversa
	 * idêntica em toda sessão. */
	pendingGate?: Gate | null;
	/** FIX-340(a) (bloco-c-whatsapp-invariantes): a identidade (CPF) JÁ foi
	 * coletada e o turno atual reenvia o CPF ou reclama que já mandou. Sem
	 * nenhum fato no contexto, o modelo fabricava uma desculpa técnica que não
	 * existe em código nenhum ("aqui no chat não consigo ver os dados
	 * anteriores"). Mesmo padrão de exactnessFacts: entrega o FATO, o modelo
	 * decide a fala. */
	identityAlreadyCollected?: boolean;
	/** FIX-350(b) (P1.5, veredito rodada 4): o usuário pediu uma administradora
	 * do MERCADO que não está entre as ofertas reais desta conversa (ex.: "me
	 * mostra a Bradesco", quando só ITAÚ/ÂNCORA foram exibidas). O guard
	 * `isHallucinatedAdministradoraClaim` (sanitizer.ts) já impede o modelo de
	 * MENTIR que ela é uma oferta real — mas sem nenhum fato no contexto, ele
	 * respondia de 3 jeitos ruins e inconsistentes: desconversa (não-sequitur),
	 * promete simular e não cumpre, ou (só às vezes) redireciona certo. Mesmo
	 * padrão de exactnessFacts/identityAlreadyCollected: entrega o FATO (qual
	 * foi pedida + quais são as reais), o modelo decide a fala. */
	unavailableAdministradoraFacts?: { requested: string; realOffers: string[] } | null;
}): ChatMessage[] {
	const {
		knownName,
		newlyExtractedExperience,
		meta,
		mentionedOffer,
		confusedAboutGate,
		exactnessFacts,
		pendingGate,
		identityAlreadyCollected,
		unavailableAdministradoraFacts,
	} = args;
	const out: ChatMessage[] = [];

	// O gate pendente vira INTENÇÃO no contexto, nunca frase pronta. Se o modelo
	// já vai perguntar por conta própria (confusedAboutGate cobre o caso do "não
	// entendi"), não duplicamos a instrução.
	if (pendingGate && !confusedAboutGate) {
		const intent = GATE_INTENT[pendingGate];
		if (intent) {
			out.push({
				role: "system",
				content:
					`Próximo passo do funil: descobrir ${intent}. Se fizer sentido no fluxo da ` +
					`conversa, faça VOCÊ essa pergunta, com as suas palavras — o sistema mostra o ` +
					`campo/os botões logo depois e NÃO vai repetir a pergunta. Se o usuário puxar ` +
					`o assunto pra outro lado, atenda ele primeiro; o funil espera.`,
			});
		}
	}

	if (mentionedOffer) {
		out.push({ role: "system", content: buildMentionedOfferDirective(mentionedOffer) });
	}

	if (confusedAboutGate) {
		const intent = GATE_INTENT[confusedAboutGate];
		out.push({
			role: "system",
			content:
				`O usuário sinalizou que NÃO ENTENDEU. ` +
				(intent ? `O que você ainda precisa descobrir: ${intent}. ` : "") +
				`Reformule de um jeito DIFERENTE do que você já tentou — mais simples, com um exemplo ` +
				`concreto, ou explicando antes por que você está perguntando. ` +
				`NUNCA repita a mesma frase que ele não entendeu.`,
		});
	}

	if (exactnessFacts) {
		const marca = exactnessFacts.administradora ? ` (${exactnessFacts.administradora})` : "";
		const ajuste =
			typeof exactnessFacts.requestedValue === "number" &&
			exactnessFacts.requestedValue !== exactnessFacts.creditValue
				? `Ele PEDIU ${brl(exactnessFacts.requestedValue)} e a carta real ficou em ${brl(exactnessFacts.creditValue)} — houve ajuste, e ele merece saber disso com honestidade.`
				: `A carta bate exatamente com o valor que ele pediu: ${brl(exactnessFacts.creditValue)}.`;
		out.push({
			role: "system",
			content:
				`Ele está questionando o VALOR da carta ou o CRITÉRIO da recomendação. Responda com ` +
				`honestidade usando SÓ estes números reais${marca}: ${ajuste} ` +
				`O critério da recomendação foi prazo, parcela e chance de contemplação combinados — ` +
				`não só o valor de crédito isolado. NÃO invente nenhum outro número, score ou ` +
				`porcentagem: use apenas os valores acima e os que já estão na tela.`,
		});
	}

	if (identityAlreadyCollected) {
		out.push({
			role: "system",
			content:
				`A identidade dele (CPF) JÁ está registrada nesta conversa — não existe nenhuma ` +
				`limitação técnica que impeça você de "ver dados anteriores" (NUNCA alegue isso, é ` +
				`falso). Reconheça que já está tudo certo, sem pedir o CPF de novo e sem inventar ` +
				`nenhuma explicação técnica pra justificar.`,
		});
	}

	if (unavailableAdministradoraFacts) {
		const { requested, realOffers } = unavailableAdministradoraFacts;
		const lista = realOffers.join(", ");
		out.push({
			role: "system",
			content:
				`Ele pediu pra ver a ${requested} — ela NÃO existe entre as ofertas reais desta busca. ` +
				`As reais são: ${lista}. Responda com honestidade, redirecionando pra essas opções reais ` +
				`(com suas próprias palavras). NUNCA invente que a ${requested} é uma das opções, NUNCA ` +
				`prometa simulá-la ou mostrá-la (você não vai cumprir), e NUNCA desconverse pra outro ` +
				`assunto sem responder o pedido dele — reconheça que ela não está disponível agora e ` +
				`convide pra ver as reais.`,
		});
	}

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
