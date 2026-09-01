import type { ConversationMetadata } from "@/lib/agent/personas";
import type { Gate } from "@/lib/agent/qualify-state";
import { vitrineDisponivel } from "@/lib/bevi/identidade-vitrine";
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
/** Injeta a INTENÇÃO do gate ativo (o que o funil quer descobrir AGORA) pro
 * modelo perguntar com as palavras dele — UMA pergunta, sobre ISSO, sem pular
 * etapa. Gate ausente/desconhecido (usuário desviou, `decideShowGate` suprimiu)
 * → null: o modelo conversa livre.
 *
 * Morava em `langgraph/nodes/converse.ts` como função local; subiu pra cá
 * (FIX-393) porque a única dependência dela é o `GATE_INTENT` logo abaixo — e
 * porque um contexto que decide o que o cliente lê merece teste próprio. */
/**
 * A intenção do gate, resolvida para o MOMENTO em que ele acontece.
 *
 * Só o `identify` é condicional, e por um motivo concreto: a vitrine o moveu de
 * antes da busca para o fecho, e a justificativa que ele carregava ("a
 * administradora exige pra trazer as ofertas reais") vira falsa quando as
 * ofertas já estão na tela. Esta é a autoridade mais específica da janela do
 * modelo naquele turno — deixá-la desatualizada faz o modelo mentir mesmo com
 * todas as outras copies corretas.
 */
export function gateIntent(gate: string | undefined): string | undefined {
	if (!gate) return undefined;
	if (gate === "identify" && vitrineDisponivel()) {
		// 31/08/2026 (Kairo, conversa 590a6cf5 em prod) — a instrução mandava
		// "descobrir o CPF e o celular dele" e o modelo obedeceu ao pé da letra:
		// "Oi, Kairo! Agora é com você, os dados ficam protegidos pela LGPD. Qual
		// é seu CPF?" — perguntando UM campo, solto, enquanto o formulário entrava
		// na tela pedindo celular PRIMEIRO e CPF depois. A fala contradizia a
		// ordem do próprio card e ficava seca.
		//
		// Quem coleta é o FORMULÁRIO; a fala é a moldura (por que precisa, o que
		// protege). Por isso a intent descreve o ASSUNTO, e o texto abaixo proíbe
		// explicitamente enunciar campo — é o que faz a fala parar de brigar com
		// o card.
		return (
			"a identidade dele pra seguir com a cota que ele JÁ escolheu — o formulário " +
			"logo abaixo é que coleta os dados, na ordem certa, então NÃO enuncie campo " +
			'nenhum (nada de "qual é seu CPF?" ou "me passa seu celular"): diga, numa ' +
			"frase calorosa, que é pra seguir com a cota que ele escolheu e que os dados " +
			"ficam protegidos pela LGPD. NÃO pergunte mais nada neste turno: nada de " +
			"entrada, valor de lance ou prazo — uma segunda pergunta aqui atropela o " +
			"formulário que está entrando na tela"
		);
	}
	return GATE_INTENT[gate];
}

export function buildGateContextText(gate: string | undefined, temCard: boolean): string | null {
	if (!gate) return null;
	const intent = gateIntent(gate);
	if (!intent) return null;
	return (
		`Próximo passo do funil: descobrir ${intent}. Faça VOCÊ essa pergunta, com as suas ` +
		`palavras e de forma calorosa — ` +
		(temCard
			? // FIX-393: antes dizia só que o campo aparece depois. Faltava amarrar a
				// fala ÀQUELE card: o agente perguntou "quanto de entrada?" enquanto o
				// formulário de CPF entrava na tela, e o cliente ficou com duas
				// perguntas diferentes sem poder responder nenhuma (Bernardo, 28/07).
				`o sistema mostra o campo/os botões logo depois e NÃO vai repetir a pergunta. Sua ` +
				`pergunta tem que ser exatamente a DESSE card — é PROIBIDO fazer uma segunda pergunta ` +
				`neste turno, sobre qualquer outro assunto, porque o campo entra na tela junto com a ` +
				`sua fala e atropela o que ele fosse responder. `
			: `NÃO vai aparecer nenhum botão nem campo na tela: quem conduz é a sua fala. `) +
		`Faça UMA pergunta só, sobre ISSO; não pule etapas nem pergunte sobre ` +
		`outra coisa. Se o usuário puxar o assunto pra outro lado, atenda ele primeiro e emende a ` +
		`pergunta no fim — o turno NUNCA termina sem um próximo passo pro cliente.`
	);
}

export const GATE_INTENT: Record<string, string> = {
	name: "como ele quer ser chamado",
	// UMA coisa só. Pedir bem + motivo no mesmo balão fazia o agente disparar duas
	// perguntas de uma vez e o cliente responder só uma — o motivo tem turno
	// próprio (`shouldAskMotive`), logo depois.
	desire:
		'qual bem específico ele tem em mente — o modelo, só isso. NÃO pergunte versão/ano (não muda nada no consórcio) e NÃO presuma nada que ele não disse (se ele não falou "novo" ou "zero", não diga)',
	credit: "quanto custa o bem que ele quer",
	// FIX-393: a instrução dizia o que PEDIR e nada sobre não abrir outro assunto.
	// O Bernardo recebeu "quanto conseguiria dar de entrada?" no MESMO turno em
	// que o formulário de CPF entrou na tela (28/07) — duas perguntas diferentes
	// de uma vez, e ele não teve como responder a da fala. Pior: "entrada" é
	// conversa de LANCE, que saiu do meio do funil (FIX-215) e vive pós-reveal.
	// A justificativa deste gate é resolvida em `gateIntent()`, porque ela DEPENDE
	// do momento: antes da busca, a administradora exige o dado para trazer as
	// ofertas; no fecho (com a vitrine), as ofertas já estão na tela e essa frase
	// vira mentira. O texto abaixo é o do mundo pré-vitrine.
	identify:
		"o CPF e o celular dele — diga POR QUE precisa (a administradora exige pra trazer as ofertas reais) e que os dados ficam protegidos pela LGPD, numa frase só, sem soar burocrático. NÃO pergunte mais nada neste turno: nada de entrada, valor de lance ou prazo — o lance só entra na conversa DEPOIS das ofertas reais aparecerem, e uma segunda pergunta aqui atropela o formulário que está entrando na tela",
	// FIX-392: a instrução antiga era 'se ele já fez consórcio antes. Se ele
	// disser que é a primeira vez, EXPLIQUE o mecanismo no MESMO turno (…)'. Era
	// uma condicional cuja condição o modelo NÃO podia avaliar — o gate está
	// justamente perguntando aquilo. Pra obedecer literalmente, ele adivinhava a
	// resposta: a Bruna recebeu "Já que é sua primeira vez com consórcio, deixa eu
	// explicar…" seguido de "Você já fez consórcio antes?" no MESMO balão
	// (27/07), com a explicação sendo a lista desta instrução item por item — e
	// falando de "carro" numa conversa que não era de carro.
	//
	// O que se preserva: o motivo original, que era impedir o "te explico no
	// caminho" (promessa que nunca vinha). A explicação continua OBRIGATÓRIA —
	// só deixa de ser antecipada: ela acontece no turno seguinte, quando a
	// resposta existir de verdade.
	experience:
		'se ele já fez consórcio antes. Você AINDA NÃO SABE a resposta — então NÃO presuma nem afirme qual é ("já que é sua primeira vez", "como você já conhece"): só pergunte. Se no próximo turno ele responder que é a primeira vez, aí EXPLIQUE o mecanismo por completo (grupo de pessoas, parcela sem juros, contemplação por sorteio ou lance, carta pra comprar o bem à vista), usando o bem DESTA conversa — nunca prometa "te explico no caminho" e siga pro pitch',
	"reco-consent": "se ele topa ver a opção que a gente recomenda",
	timeframe: "em quanto tempo ele quer estar com o bem",
	lance: "se ele teria como dar um lance pra antecipar a contemplação",
	"lance-value": "quanto ele pensa em dar de lance",
	"lance-embutido": "se ele quer considerar lance embutido (usar parte da própria carta)",
	"simulator-offer": "se ele quer simular a parcela em diferentes meses de contemplação",
	decision: "se o plano faz sentido pra ele",
	// O texto descrevia a mecânica da WEB ("O formulário com os dados aparece
	// logo abaixo da sua fala") e era servido nos DOIS canais — enquanto o bloco
	// de canal do WhatsApp, na MESMA janela, afirma que não existe tela nem card.
	// Duas autoridades se contradizendo é o que produziu o CPF pedido três vezes
	// em `fd76e393` (16/08/2026): o modelo seguiu a mais específica da tarefa, que
	// era a do canal errado. A mecânica de cada canal mora no bloco de canal
	// (`langgraph/nodes/converse.ts`); aqui fica só o que vale nos dois.
	contract:
		"nada — a decisão JÁ foi tomada e o plano JÁ está escolhido. É PROIBIDO perguntar de novo qual opção ele quer ou pedir que ele confirme a escolha: isso já aconteceu. Sua fala aqui é curta e conduz ao pré-cadastro: diga que vai preparar o cadastro dele e que ele não paga nada agora (o pagamento só começa depois, quando nossa equipe enviar as instruções por e-mail). O sistema cuida de coletar e confirmar os dados logo depois da sua fala — você não pede nada disso por conta própria, e nunca diz que a cota está reservada",
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
		const intent = gateIntent(pendingGate);
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
		// Pelo resolvedor, não pelo mapa cru: o `identify` tem texto diferente
		// conforme o momento, e o cliente confuso é justamente quem mais ouviria a
		// justificativa errada ("a administradora exige pra trazer as ofertas")
		// com as ofertas já na tela.
		const intent = gateIntent(confusedAboutGate);
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
			content: `O usuário acabou de revelar que é a PRIMEIRA VEZ dele com consórcio. Reaja a isso e explique o essencial de forma curta e acolhedora: grupo de pessoas que paga parcelas mensais sem juros, contemplação por sorteio ou lance, e a diferença pro financiamento. Sem jargão (nada de cota/lance livre/fundo de reserva). Depois siga a conversa naturalmente — se couber uma pergunta sua, faça.`,
		});
	} else if (newlyExtractedExperience === "returning") {
		out.push({
			role: "system",
			content: `O usuário já tem familiaridade com consórcio — não explique o produto do zero, vá direto ao ponto e trate ele como quem já entende. Se ele tiver dito algo que merece resposta, responda.`,
		});
	}

	if (meta.experiencePrev === "doubts" && !meta.doubtsAddressed) {
		out.push({
			role: "system",
			content: `O usuario clicou "Tenho duvidas" anteriormente e agora esta perguntando algo especifico. Responda a duvida dele de forma direta e CLARA, em 2-4 frases. NAO termine com "tem mais alguma duvida?", "ficou claro?", "alguma outra pergunta?" ou similar — o sistema dispara automaticamente a transicao com botões pra ele decidir se quer seguir ou pedir mais info. Voce so precisa entregar a resposta e parar.`,
		});
	}

	return out;
}
