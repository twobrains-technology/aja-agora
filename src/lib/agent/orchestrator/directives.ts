import type { ConversationMetadata } from "@/lib/agent/personas";
import type { PlanIntent } from "@/lib/agent/qualify-config";
import type { ChosenOffer } from "./choose-offer";

// ---- Transition ----

export function buildTransitionFirstContactDirective(
	categoryLabel: string,
	nameHint: string,
): string {
	// PF-08 (descoberto pelo QA E2E P0-01): sem este reforço explicito, o agent
	// antecipa o gate de experience e nunca pergunta o nome. Quando nameHint
	// vazio, o directive agora obriga o agent a pedir nome via save_contact_name
	// ANTES de qualquer outra coisa.
	const nameInstruction = nameHint
		? ` ${nameHint}`
		: " IMPORTANTE: você ainda NÃO sabe o nome do usuário. Sua primeira mensagem deve reagir em 1 frase curta ao objetivo dele E em SEGUIDA perguntar como pode chama-lo (ex: 'Show, carro novo abre portas! Antes de eu te ajudar, como posso te chamar?'). NÃO pergunte sobre experiência previa nem mencione outros assuntos — apenas reaja + peca o nome. Quando o usuário responder, chame save_contact_name imediatamente.";
	// docx passo 1 (linha 14): a ponte literal pro passo 2 — dita o texto que o
	// agente usa logo após saber o nome, antes da pergunta de experiência.
	const bridgeInstruction = ` PONTE DO PASSO 1 (docx): assim que souber o nome, sua resposta usa a ponte "Perfeito, [nome]! Precisamos fazer mais algumas perguntinhas pra buscar o melhor consórcio pra um(a) ${categoryLabel.toLowerCase()}" — e SE o usuário já tiver mencionado um valor, inclua "de cerca de R$ X" com o valor dele. NÃO invente valor se ele não disse.`;
	return `[sistema acabou de te conectar com o usuário que pediu pra falar sobre ${categoryLabel}]${nameInstruction}${bridgeInstruction}`;
}

export function buildTransitionReturningDirective(): string {
	return `Você está RETOMANDO uma conversa que já teve antes nesta sessão. NÃO se apresente de novo. Responda direto a última mensagem do usuário NO SEU TOM, com naturalidade de quem está voltando ao assunto. Em 1-2 frases.`;
}

export function buildTransitionCrossSpecialistDirective(): string {
	return `PRIMEIRA aparição sua, mas o usuário já conversou com outro especialista antes (sobre outra categoria). Comece DIRETO com a resposta a última mensagem do usuário NO SEU TOM. Não se apresente nem mencione o especialista anterior. Em 1-2 frases.`;
}

// ---- Name captured (FIX-17: via card de nome) ----

/** FIX-17 — o usuário enviou o nome pelo CARD focado (passo 1). O nome JÁ foi
 * persistido no servidor (saveContactName) — o agente só saúda, sem re-chamar
 * tool nem re-perguntar. Espelha a saudação do caminho texto-livre.
 * FIX-238 (Fable r1): comentário e texto do directive citavam "gate de
 * experience em seguida" — STALE desde o FIX-233 (2026-07-09), que moveu
 * `experience` pra pós-reveal e inseriu o gate `desire` (não bloqueante) logo
 * após o nome. A pergunta do `desire` ("qual carro você tem em mente?") sai
 * pelo mecanismo determinístico de gate (gateQuestion, `web/adapter.ts`), não
 * por este directive — por isso ele segue "PARE após a saudação". */
export function buildNameCapturedDirective(name: string): string {
	return `O usuário informou que se chama "${name}" (pelo card de nome). O nome JÁ está salvo — NÃO chame save_contact_name, NÃO pergunte o nome de novo. FLUXO: escreva UMA frase curta e calorosa de saudação usando o nome ("Prazer, ${name}!" / "Boa, ${name}!" / "Show, ${name}!"). NÃO faca pergunta, NÃO chame tools, NÃO prometa "perguntas rápidas". PARE após a saudação — o sistema pergunta o próximo passo (gate "desire") em seguida.`;
}

// ---- Experience choices ----

export function buildExperienceFirstDirective(replyTitle: string): string {
	// FIX-1 (teste manual Kairo 2026-06-05): o bullet do papel da Aja Agora e
	// EXIGÊNCIA do docx passo 1 e estava faltando — sem ele o usuário não
	// entende o que a plataforma faz por ele. Tom: proximidade/afinidade
	// (pedido do cliente), não explicação seca.
	return `Usuário escolheu "${replyTitle}" — é a PRIMEIRA vez dele com consórcio. IMPORTANTE: o sistema JÁ te apresentou no turno anterior com saudação + seu nome — NÃO se apresente de novo, NÃO diga "Aqui é Helena/Rafael/Camila", NÃO mencione "anos de experiência/mercado/especialidade". Va DIRETO ao conteúdo. FLUXO: escreva UMA mensagem curta (4-5 frases) explicando o essencial sobre consórcio com SUAS palavras: é um grupo de pessoas que pagam parcelas mensais sem juros, e a cada mês alguém do grupo é contemplado por sorteio ou lance pra receber a carta de crédito (na 1a menção, explique que carta de crédito é o valor que ele recebe pra comprar o bem). Mencione brevemente que é diferente de financiamento (sem juros). OBRIGATÓRIO fechar com o papel da plataforma, fiel ao docx: "Nosso papel na Aja Agora é encontrar o grupo com maior chance de atender seu objetivo no prazo que você deseja." (pode adaptar levemente ao seu tom, mantendo papel + objetivo + prazo). NÃO faca pergunta no final, NÃO chame tools. Tom acolhedor, próximo e didático — celebre a primeira conquista dele como um consultor que está junto, sem jargão técnico (cota, lance livre, fundo reserva).`;
}

export function buildExperienceReturningDirective(replyTitle: string): string {
	return `Usuário escolheu "${replyTitle}" — ele JÁ tem familiaridade com consórcio. IMPORTANTE: o sistema JÁ te apresentou no turno anterior — NÃO se apresente de novo, NÃO diga "Aqui é Helena/Rafael/Camila", NÃO mencione "anos de experiência/mercado/especialidade". FLUXO: escreva APENAS UMA frase curta de transição tipo "Show, vamos direto ao ponto então." ou "Beleza, vamos seguir." NÃO explique o produto, NÃO faca pergunta, NÃO chame tools.`;
}

export function buildExperienceDoubtsDirective(replyTitle: string): string {
	return `Usuário escolheu "${replyTitle}" — ele tem dúvidas sobre consórcio. IMPORTANTE: o sistema JÁ te apresentou no turno anterior — NÃO se apresente de novo, NÃO diga "Aqui é Helena/Rafael/Camila", NÃO mencione "anos de experiência/mercado/especialidade". Va DIRETO ao conteúdo. FLUXO: escreva UMA mensagem (4-5 frases) explicando o essencial do produto com SUAS palavras: e um grupo de pessoas que paga parcelas mensais sem juros, contemplação acontece por sorteio ou lance, prazo flexível, diferença de financiamento. Após a explicação, EM UMA frase curta convide o usuário a perguntar algo específico se quiser ("se ficou alguma dúvida específica, manda aqui que eu respondo"). Tom acolhedor e didático, sem jargão técnico (cota, lance livre, fundo reserva). NÃO chame tools.`;
}


/** Benefício a reforçar conforme a INTENÇÃO escolhida no segmented control do
 * "Planeje sua conquista" (re-UX por intenção). */
const PLAN_INTENT_BENEFIT: Record<PlanIntent, string> = {
	parcela:
		"ele priorizou a PARCELA LEVE (prazo mais longo deixa a mensalidade confortável no bolso)",
	rapido: "ele quer CONTEMPLAR LOGO (estratégia de receber o bem rápido)",
	lance: "ele tem LANCE pra dar (lance acelera bastante a contemplação)",
};

/** Reação ao "Planeje sua conquista" (híbrido VENDEDOR, decisão do Kairo). Na
 * re-UX guiada por intenção o usuário entrega valor + prazo + a INTENÇÃO (o que
 * mais importa) e, conforme ela, mês-alvo OU lance — num componente só. O agente
 * NÃO re-pergunta nada disso: CONFIRMA proativamente como vendedor que persuade o
 * fechamento, reforçando o benefício da PRIORIDADE dele, e avança. */
export function buildPlanReactionDirective(args: {
	assetLabel: string;
	intent?: PlanIntent;
	targetMonth?: number;
	lanceLabel?: string;
}): string {
	const alvo = args.targetMonth ? ` em ~${args.targetMonth} meses` : "";
	const lance = args.lanceLabel ? ` com lance de ${args.lanceLabel}` : "";
	const prioridade = args.intent ? ` Prioridade dele: ${PLAN_INTENT_BENEFIT[args.intent]}.` : "";
	return `Usuário preencheu o plano da conquista via componente: ${args.assetLabel}${alvo}${lance}.${prioridade} FLUXO: escreva UMA mensagem curta (2-3 frases) DE VENDEDOR confirmando a estratégia dele com entusiasmo e autoridade — espelhe o que ele escolheu (valor, prazo${args.targetMonth ? ", prazo-alvo" : ""}${args.lanceLabel ? ", lance" : ""}) SEM re-perguntar nada disso, reforce em meia frase o beneficio da prioridade dele e sinalize que o próximo passo e buscar as opções reais. NÃO faca pergunta, NÃO chame tools — o sistema conduz a próxima etapa.`;
}

export function buildCreditReactionDirective(rangeTitle: string): string {
	return `Usuário escolheu faixa de crédito "${rangeTitle}" via botao. FLUXO: escreva UMA frase curta de reação tipo "Boa, anotado." ou "Show, faixa que gira bem." NÃO faca pergunta, NÃO chame tools. O sistema vai mandar logo em seguida os botoes da próxima etapa.`;
}

export function buildTimeframeReactionDirective(rangeTitle: string): string {
	return `Usuário escolheu prazo "${rangeTitle}" via botao. FLUXO: escreva UMA frase curta de reação adaptada ao prazo (ex: "Boa, prazo que gira bem.", "Show, dá pra fazer um lance forte.", "Tranquilo, sem pressa funciona pra parcela mais leve."). NÃO faca pergunta, NÃO chame tools. O sistema vai mandar logo em seguida os botoes da próxima etapa.`;
}

// FIX-272 (rodada 8, veredito Fable r7, D4 residual): esta instrução dizia
// "sobre ter reserva pra lance" — o próprio directive induzia o termo
// proibido na prosa do LLM (achado ao vivo: "com sua reserva pra lance",
// "Com sua reserva, dá pra acelerar", inclusive presumindo reserva que o
// usuário nunca declarou). Troca pra linguagem do gate `lance` (gate-
// questions.ts:87, FIX-268) e proíbe "reserva" explicitamente na resposta —
// não basta parar de induzir, o modelo também não pode escolher usá-la.
export function buildLanceReactionDirective(rangeTitle: string): string {
	return `Usuário respondeu "${rangeTitle}" sobre ter como dar um lance pra antecipar a contemplação. FLUXO: escreva UMA frase curta de reação positiva (ex: "Boa, lance acelera bastante a contemplação.", "Show, com lance dá pra antecipar."). NÃO diga "reserva"/"reservado" (termo proibido pré-contratação, nem presuma reserva que o usuário não declarou). NÃO explique o que e lance embutido aqui (o sistema vai apresentar isso em seguida), NÃO faca pergunta, NÃO chame tools.`;
}

/** FIX-246 (rodada 3, Fable r2 — causa-raiz do veredito 4/10): o convite pra
 * decidir entre os dois caminhos é sempre a MESMA frase neutra — nunca gerada
 * pelo LLM (que podia "recomendar" um caminho por conta própria, cutucando o
 * compliance do card). Emitida DIRETO ao usuário depois do card, sem passar
 * pelo modelo (Lei 1 — mesmo padrão do `buildDiscoveryFailedFallback`). */
export const TWO_PATHS_FOLLOWUP_TEXT =
	"Não tem certo ou errado — depende de você ter pressa ou não. Qual dos dois combina mais com você?";

/** FIX-233 (handoff agente-vendas-consorcio, 2026-07-09) — 3ª saída do gate
 * `lance`: "não quero comprometer nada além da parcela". Pula lance-value/
 * lance-embutido/simulator-offer por completo.
 * FIX-246 (rodada 3, Fable r2, causa-raiz): o card `two_paths` tinha 0
 * emissões em 2 conduções — dependia do LLM obedecer "chame a tool
 * present_two_paths", invariante que ficou no PROMPT, não em CÓDIGO (Lei
 * 1/4). Agora o directive só escreve a frase de introdução; o handler
 * (route.ts/index.ts) emite o card SERVER-SIDE determinístico logo em
 * seguida (`buildTwoPathsCard`) — e o convite pra decidir é o texto FIXO
 * `TWO_PATHS_FOLLOWUP_TEXT`, nunca a critério do modelo. */
export function buildLanceSoParcelaDirective(): string {
	return `Usuário disse que não quer comprometer nada além da parcela — recusa explícita de qualquer conversa de lance. FLUXO: escreva APENAS UMA frase curta respeitando a escolha (ex.: "Perfeito, respeito total. Então deixa eu ser bem transparente e te mostrar os dois caminhos possíveis:"). NÃO explique lance embutido, NÃO chame simulate_quota, NÃO chame present_contemplation_dial nem NENHUMA tool neste turno — o sistema mostra o card dos dois caminhos e a pergunta de decisão automaticamente, logo em seguida.`;
}

/** FIX-237 (Fable r1, D2.1 gap #3) — card `embedded_bid` (docs/02-cards-novos.md
 * CARD 1): estava ÓRFÃO — a tool `present_embedded_bid` existia (schema +
 * allowlist) mas NENHUM directive/prompt instruía o modelo a chamá-la, então
 * nunca aparecia em nenhuma condução real (0 de 4 no veredito Fable r1).
 * FIX-246 (rodada 3, Fable r2): o directive PASSOU a instruir a tool-call
 * (FIX-237), mas o LLM continuou desobedecendo/errando (0 emissões em 3
 * oportunidades no veredito r2) — o mesmo invariante-no-prompt. Agora o
 * directive só escreve a frase de introdução; o handler emite o card
 * SERVER-SIDE determinístico logo em seguida (`buildEmbeddedBidCard`,
 * payload coagido a partir da oferta real via `coerceEmbeddedBidPayload`).
 * Regra dura (spec): o card SEMPRE diz que o crédito recebido diminui — já
 * hardcoded na coerção, não depende do texto do modelo. */
// FIX-268 (rodada 7, veredito Fable r6, residual D4 — "educação do embutido
// 2× no mesmo turno"): a versão anterior instruía o LLM a "introduzir o
// conceito" com um exemplo que JÁ explicava lance embutido por completo
// ("você usa parte da própria carta como lance") — e o gate `lance-embutido`
// que dispara LOGO EM SEGUIDA (gate-questions.ts, lanceEmbutidoEdu) explica o
// MESMO conceito de novo, com os números reais. Resultado: a mesma definição
// saía 2× seguidas, em 2 balões. Agora o directive é SÓ transição (igual ao
// buildScarcityDirective) — a educação tem UMA fonte só, o gate determinístico.
export function buildEmbeddedBidDirective(): string {
	return `Escreva APENAS UMA frase curta de transição NO SEU TOM (ex.: "Baseado no que você me contou, tenho uma ideia que pode acelerar sua contemplação:"). NÃO explique o que é lance embutido aqui — o sistema já traz a educação completa logo em seguida; explicar de novo duplica a mesma ideia no turno. NÃO invente o percentual do embutido nem o valor líquido em texto — isso é o trabalho do card, que o sistema mostra automaticamente em seguida com os números REAIS da oferta. NÃO chame present_embedded_bid nem NENHUMA outra tool neste turno.`;
}

/** FIX-237 (Fable r1, D2.1 gap #3) — card `scarcity` (docs/02-cards-novos.md
 * CARD 2): mesmo defeito do embedded_bid, ÓRFÃO por falta de directive.
 * FIX-246 (rodada 3, Fable r2): mesma desobediência do embedded_bid (0
 * emissões em 2 oportunidades — o LLM respondeu ao directive com uma bolha
 * de texto em vez de chamar a tool). Agora o directive só escreve a frase de
 * transição; o handler emite o card SERVER-SIDE determinístico logo em
 * seguida (`buildScarcityCard`) — que já decide se renderiza (só quando há
 * `availableSlots` real ancorado no grupo). Dispara depois da estratégia de
 * lance resolvida, ANTES da proposta final — imediatamente antes do card de
 * decisão ("Esse plano faz sentido?"). NÃO dispara no caminho "só a parcela"
 * (two_paths) — a proposta ali segue direto pro fecho, sem o gancho de
 * escassez (spec `04-copy-fluxos.md` Fluxo B). */
export function buildScarcityDirective(): string {
	return `Escreva APENAS UMA frase curta de transição NO SEU TOM (ex.: "Ah, e um detalhe sobre esse grupo, só pra você saber:"). NÃO invente o número de vagas nem mencione o total de cotas do grupo — o sistema mostra o card de escassez automaticamente em seguida, com o número REAL calculado a partir do grupo. NÃO chame present_scarcity nem NENHUMA outra tool neste turno.`;
}

/** FIX-280 (loop r9, baseline Sonnet 3/10, G4): `present_whatsapp_optin` saiu
 * do toolset do LLM — mesma receita do FIX-246/253 (buildScarcityDirective/
 * buildDecisionPromptDirective). O directive só escreve a frase de contexto
 * (narrativa varia por persona/conversa); o handler (orchestrator/index.ts)
 * emite o card SERVER-SIDE determinístico logo em seguida
 * (`buildWhatsappOptinCard`) — nunca mais depende de o LLM "decidir" chamar
 * a tool. `stage` espelha `deriveWhatsappOptinStage`: "open" (número ainda
 * não coletado) pede o WhatsApp; "confirm" (número já conhecido — lead
 * form/identify) só confirma o canal, sem re-coletar. */
export function buildWhatsappOptinDirective(stage: "open" | "confirm"): string {
	if (stage === "confirm") {
		return `O usuário JÁ informou o WhatsApp dele nesta conversa (lead form / identificação do fechamento). Escreva APENAS UMA frase curta confirmando o canal, SEM repetir o número por extenso (o card já mostra) — ex.: "Posso te chamar no seu WhatsApp se precisar?" ou "Confirma que sigo seu atendimento pelo WhatsApp se cair a conexão?". NÃO peça o número de novo. NÃO chame present_whatsapp_optin nem NENHUMA outra tool neste turno — o sistema mostra o card de confirmação de 1 clique automaticamente em seguida.`;
	}
	return `Escreva APENAS UMA frase curta contextualizando um pedido de WhatsApp, com narrativa de segurança/continuidade do atendimento NO SEU TOM (ex.: "Pra não perder seu atendimento se cair a internet, me compartilha seu WhatsApp? Se acontecer algo aqui, continuamos por lá."). NÃO chame present_whatsapp_optin nem NENHUMA outra tool neste turno — o sistema mostra o card automaticamente em seguida, com input mascarado + botões "Quero receber"/"Agora não".`;
}

// ---- Group actions ----

export function buildGroupSelectedDirective(
	administradora: string,
	groupId: string,
	creditValue: number,
	termMonths: number,
): string {
	return `Usuário selecionou o grupo "${administradora}" (creditValue=${creditValue}, prazo=${termMonths}m). FLUXO: (1) escreva UMA frase curta de introdução no SEU TOM tipo "Beleza, dá uma olhada na simulação da ${administradora}:" — proibido "vou simular", "deixa eu calcular"; também proibido descrever números (parcela/taxa) em texto, isso é o trabalho do card. (2) chame simulate_quota com groupId="${groupId}" E creditValue=${creditValue}; (3) chame present_simulation_result com o retorno da tool. NÃO chame recommend_groups. NÃO chame simulate_quota mais de uma vez. O card já tem botoes "Tenho interesse!" e "Ajustar valor".`;
}

export function buildSimulateDirective(
	administradora: string,
	groupId: string,
	creditValue: number,
): string {
	return `Usuário quer simular o grupo "${administradora}" (creditValue=${creditValue}). FLUXO: (1) escreva UMA frase curta de introdução no SEU TOM tipo "Show, vai aparecer aqui:" ou "Olha só:" — proibido "vou simular", proibido afirmar que o resultado JÁ está na tela ("aqui tá a simulação", "aqui estao os números") ANTES de simulate_quota retornar, e proibido descrever números em texto. (2) chame simulate_quota com groupId="${groupId}" E creditValue=${creditValue}; (3) chame present_simulation_result. O card já tem botoes "Tenho interesse!" e "Ajustar valor". NÃO simule de novo o mesmo grupo.`;
}

export function buildWhatIfDirective(administradora: string, currentCreditValue: number): string {
	return `O usuário quer ajustar o valor de crédito do grupo "${administradora}" (creditValue atual=${currentCreditValue}). Pergunte em UMA frase qual valor de crédito ou parcela mensal ele quer simular agora. NÃO simule ainda, espere a resposta dele com o novo valor.`;
}

/** FIX-29 — clique "Ajustar valor"/"Nova simulação" no card de simulação. O
 * usuário quer MUDAR o valor do bem, NÃO avancar pro fechamento. Reabre o
 * what-if e PROIBE qualquer tool de fechamento neste turno. */
export function buildAdjustValueDirective(args: {
	administradora: string;
	currentCreditValue?: number;
}): string {
	const { administradora, currentCreditValue } = args;
	const valorCtx =
		typeof currentCreditValue === "number" && currentCreditValue > 0
			? ` (valor atual R$ ${currentCreditValue.toLocaleString("pt-BR")})`
			: "";
	return `Usuário clicou "Ajustar valor" no card de simulação de "${administradora}"${valorCtx}. Ele quer MUDAR o valor do bem, e o OPOSTO de avancar pro fechamento. FLUXO: pergunte em UMA frase, no SEU TOM, qual o novo valor do bem (ou a parcela mensal) que ele quer simular. NÃO simule ainda — espere a resposta com o novo valor. PROIBIDO neste turno: iniciar qualquer fechamento, reserva, contratação ou card de decisão. NUNCA diga "vou reservar essa opção" nem prometa atendente/consultor — "ajustar valor" e o contrario de fechar.`;
}

/** FIX-29 — usuário JÁ viu o card de decisão e reafirmou avanco ("Tenho
 * interesse" de novo). Avanca pro passo 5 (contratação real), nunca lead. */
export function buildAdvanceToContractDirective(args: { administradora?: string }): string {
	const { administradora } = args;
	const adminCtx = administradora ? ` da "${administradora}"` : "";
	// FIX-256 (rodada 4, veredito Fable FINAL §N-I) — SUPERSEDE o FIX-216:
	// "reserva"/"pré-reserva" ainda implica compromisso fechado antes da
	// contratação real, borderline com a linha "nunca 'reservado' antes da
	// contratação". Trocado por "garantir seu lugar" + "pré-cadastro" — nem
	// "contratar/fechar" (FIX-216), nem "reserva" (este fix).
	return `O usuário já viu o card de decisão e reafirmou que quer seguir. FLUXO: escreva UMA frase curta de fechamento no SEU TOM ("Boa! Pra garantir seu lugar nesse grupo, só preciso de uns dados rápidos — e já adianto: você não paga nada agora, é só um pré-cadastro, o pagamento só começa quando chegar o boleto na sua casa.") e chame present_contract_form (proposta real${adminCtx}). NUNCA inicie captura de lead nem prometa atendente humano — é self-service, direto na plataforma. NÃO re-apresente search_groups/recommend_groups nem os cards do reveal.`;
}

/** FIX-195 (P0) — o usuário ESCOLHEU uma cota no seletor do reveal e clicou
 * "Seguir com <cota>". O groupId JÁ foi resolvido server-side (choose-offer.ts +
 * re-âncora do meta) — o agente só fecha. PROÍBE re-busca/re-resolução e QUALQUER
 * meta-narrativa de falha técnica (a raiz do loop do P0: "esse grupo deu um
 * problema", "preciso trazer os IDs reais"). CONTRATO com bloco-b (adendo B8). */
export function buildChooseOfferDirective(args: { administradora?: string }): string {
	const { administradora } = args;
	const adminCtx = administradora ? ` da "${administradora}"` : "";
	const adminFrase = administradora ? ` com a ${administradora}` : "";
	// FIX-256 (rodada 4, veredito Fable FINAL §N-I) — mesma troca de terminologia
	// do buildAdvanceToContractDirective: nunca "reserva" pré-contratação.
	return `O usuário ESCOLHEU uma cota específica no seletor do reveal e quer SEGUIR com ela — a decisão JÁ está tomada e o grupo JÁ está resolvido pelo sistema (o groupId veio junto). FLUXO: escreva UMA frase curta de fechamento no SEU TOM (ex.: "Boa! Vamos seguir${adminFrase} então. Pra garantir seu lugar nesse grupo, só preciso de uns dados rápidos — e já adianto: você não paga nada agora, é só um pré-cadastro, o pagamento só começa quando chegar o boleto na sua casa.") e chame present_contract_form (proposta real${adminCtx}). PROIBIDO neste turno: chamar search_groups, recommend_groups ou simulate_quota; re-apresentar os cards do reveal (present_recommendation_card/present_comparison_table/present_simulation_result); ou "re-resolver"/"re-buscar" o grupo — o groupId já veio resolvido, você NÃO precisa de ferramenta pra isso. NUNCA admita falha técnica nem diga que "esse grupo deu problema", que precisa "trazer os identificadores", que vai buscar de novo ou usar a ferramenta — ZERO meta-narrativa de mecanismo. NUNCA inicie captura de lead nem prometa atendente/consultor humano — é self-service, direto na plataforma.`;
}

export function buildSimulationInterestDirective(administradora: string): string {
	return `Usuário clicou "Tenho interesse" no card de simulação do grupo "${administradora}". FLUXO: (1) escreva UMA frase curta de confirmação no SEU TOM tipo "Boa, bora seguir então. Só preciso de uns dados rápidos para confirmar sua reserva." — proibido fazer pergunta nesta frase; PROIBIDO prometer "reservar" a opção antecipadamente sem os dados, ou atendente humano (a reserva é self-service na plataforma). (2) chame present_lead_form (sem parametros). NÃO chame outras tools.`;
}

export function buildDetailDirective(groupId: string): string {
	return `O usuário quer detalhes do grupo ${groupId}. Use get_group_details com esse groupId. NÃO mencione IDs na resposta.`;
}

export function buildRangePickerDirective(
	categoryLabel: string,
	category: string,
	filtros: string,
	budgetFmt: string,
): string {
	return `Usuário escolheu via slider a faixa de ${categoryLabel} (${filtros}, orçamento mensal R$ ${budgetFmt}). FLUXO OBRIGATÓRIO: (1) escreva UMA frase curta de introdução no SEU TOM — uma TRANSIÇÃO honesta que NÃO afirma resultado, tipo "Bora ver o que encaixa na sua faixa:" ou "Olha só o que a gente consegue na sua faixa:". PROIBIDO afirmar achado ("encontrei", "achei", "aqui estao", "essas são") ANTES de search_groups retornar — a busca pode demorar ou falhar e a frase vira mentira visível. PROIBIDO também narrar mecânica ("vou buscar"). NÃO descreva números específicos dos grupos em texto, isso é o trabalho do card. (2) chame search_groups com category="${category}" e os filtros (${filtros}); (3) se retornar 1 grupo, chame present_group_card; se retornar 2 ou mais, chame present_comparison_table com TODOS os grupos. NUNCA descreva os grupos em texto corrido — o componente visual e obrigatório. NÃO chame recommend_groups.`;
}

// ---- Search summary (composed) ----

export function buildSearchSummaryDirective(args: {
	category: string;
	meta: ConversationMetadata;
}): string {
	const { category, meta } = args;
	const q = meta.qualifyAnswers ?? {};

	const filterParts: string[] = [];
	if (q.creditMin !== undefined && q.creditMin > 0) {
		filterParts.push(`creditMin=${q.creditMin}`);
	}
	if (q.creditMax !== undefined) {
		filterParts.push(`creditMax=${q.creditMax}`);
	}
	const filters = filterParts.length > 0 ? `, ${filterParts.join(", ")}` : "";

	// FIX-INTEGRIDADE (2026-07-02): frase "% do seu teto" NÃO pode aparecer quando:
	// 1. Cliente NÃO declarou orçamento mensal (monthlyBudget undefined)
	// 2. Categoria é MOTO (não coleta orçamento mensal — system-prompt FIX-104 passo 15-17)
	const hasBudget =
		category !== "moto" && typeof q.monthlyBudget === "number" && q.monthlyBudget > 0;
	const budgetArgs = hasBudget
		? `, budget=${q.monthlyBudget}, desiredTermMonths=${q.prazoMeses ?? 0}`
		: `, desiredTermMonths=${q.prazoMeses ?? 0}`;

	// FIX-18 (jornada BB real do Kairo, 2026-06-11): a busca filtra pela FAIXA DE
	// CRÉDITO; o orçamento declarado não participa do filtro (limitação da Bevi
	// Trilho B). Quando a parcela real estoura o orçamento, o agente CELEBRAVA em
	// vez de confrontar. Decisão do Kairo: confronto no reveal (além do picker),
	// tom guia-não-empurra. Só injeta o bloco quando ha orçamento pra confrontar.
	const confrontoBudget = hasBudget
		? `

CONFRONTO DE VIABILIDADE (orçamento declarado R$ ${q.monthlyBudget}/mês): a busca filtra pela FAIXA DE CRÉDITO — a parcela real pode vir ACIMA do orçamento. ANTES de celebrar, compare a parcela da opção recomendada com R$ ${q.monthlyBudget}/mês. SE a parcela ESTOURA o orçamento (claramente acima), NÃO comemore nem diga que "ficou próximo do objetivo": confronte com honestidade em UMA frase — diga a parcela real, reconheca que ficou acima do orçamento de R$ ${q.monthlyBudget}/mês e ofereca ajustar o valor do bem pra caber no que ele pode pagar. Tom de guia que defende o objetivo do usuário, NUNCA de empurrar a venda. SE a parcela cabe no orçamento, siga a celebração normal.`
		: "";

	// FIX-33: o valor do bem pedido por texto livre estourou a faixa da categoria
	// e foi clampado pro teto. O agente confronta a faixa real em vez de celebrar
	// o valor impossível (a administradora não entrega esse valor nessa categoria).
	const confrontoFaixa =
		typeof q.creditClampedFrom === "number" &&
		typeof q.creditMax === "number" &&
		q.creditClampedFrom > q.creditMax
			? `

CONFRONTO DE FAIXA (FIX-33): o usuário pediu um bem de R$ ${q.creditClampedFrom} por texto, ACIMA do teto da categoria. A busca foi ajustada pro teto real da categoria (R$ ${q.creditMax}). ANTES de apresentar, confronte com honestidade em UMA frase: diga que pra essa categoria a faixa vai até R$ ${q.creditMax} e pergunte se ele quer ver as opções nesse teto OU se o bem seria de outra categoria. NUNCA celebre nem prometa o valor original (R$ ${q.creditClampedFrom}) — a administradora não entrega esse valor nessa categoria.`
			: "";

	// docx passos 3-4: mostrar PRIMEIRO o "Plano recomendado pela Aja Agora" em
	// DESTAQUE + o detalhamento E o carrossel das opções lado a lado.
	// Teste manual Kairo (2026-06-11): "disse que tinha 3 opções mas mostrou só
	// uma" — o reveal anunciava 3 mas escondia as outras 2 atrás de um botao. Agora
	// o carrossel (present_comparison_table, a recomendada destacada) aparece NO
	// reveal. Mais fiel ao docx (linha 32 "Encontramos 3 boas opções" + linha 37
	// "ver outras opções pra comparação"). Ver CONTEXT.md (D15).
	return `O usuário completou as 4 perguntas de qualificação:
- experiência=${meta.experiencePrev}
- faixa de crédito=R$ ${q.creditMin ?? 0} a R$ ${q.creditMax ?? "?"}${hasBudget ? `\n- parcela mensal=R$ ${q.monthlyBudget}` : ""}
- prazo=${q.prazoMeses ?? "?"} meses
- lance=${q.hasLance}

FLUXO OBRIGATÓRIO neste turno (ordem do docx — recomendado PRIMEIRO, em destaque):
1. Chame search_groups com category="${category}"${filters} ANTES de anunciar qualquer coisa.
2. Anuncie conforme o RESULTADO REAL da busca (honestidade > template — FIX-7):
   - 3 ou mais grupos: use a copy do docx passo 3: "Encontramos 3 boas opções para o seu perfil. Agora vamos te recomendar a mais adequada:".
   - 2 grupos: anuncie "2 boas opções" (número real).
   - apenas 1 grupo: anuncie que encontrou UMA opção forte pra ele — NÃO anuncie "3 boas opções", NÃO use plural ("boas opções") nem prometa comparação/curadoria que não existe.
   Em 1-2 frases curtas NO SEU TOM. NÃO use bullets/checkboxes (✅), NÃO use template, NÃO descreva números específicos dos grupos.
3. SE retornou 2 OU MAIS grupos: chame recommend_groups com category="${category}"${filters}${budgetArgs} e em seguida present_recommendation_card com a PRIMEIRA opção retornada (maior score) — administradora, category, creditValue, monthlyPayment, termMonths, score, scoreBreakdown. NÃO digite número de contemplação: o sistema coage os números do card (parcela, valor, prazo, contemplados/mês) a partir do grupo REAL da busca — você só ancora pelo id (FIX-191). SE retornou apenas 1 grupo: NÃO chame present_recommendation_card nem present_group_card (duplicaria o detalhamento — o card único do reveal e a simulação abaixo); seu texto faz o papel da recomendação.
4. Chame simulate_quota com o groupId e o creditValue NOMINAL do grupo recomendado e em seguida present_simulation_result — aprofunda a opção que o card acabou de mostrar (cenário com lance, correção prevista). OBRIGATÓRIO copiar do retorno do simulate_quota os campos lanceScenario e embeddedBid (variação com/sem lance e com lance embutido — exigência literal do docx); omiti-los é defeito.
5. SE retornou 2 OU MAIS grupos: chame present_comparison_table com TODOS os grupos retornados por recommend_groups — por ÚLTIMO, como convite pra comparar depois de já ter visto a opção completa (FIX-224, Ata 2026-07-04) — SEM destacar nenhuma opção como preferencial (FIX-220: a 1ª lista é NEUTRA, mesmo peso pra todas — ainda não há dado de lance pra recomendar nada). SE retornou apenas 1 grupo: NÃO chame present_comparison_table (só ha uma opção).
6. SE recommend_groups retornar insufficientOptions=true: diga com transparência, em UMA frase, que as opções na faixa dele estao limitadas hoje e que você expandiu a busca pra trazer o que ha de melhor — NUNCA esconda a escassez nem invente abundância.${confrontoBudget}${confrontoFaixa}

A ORDEM dos cards no reveal (FIX-224, Ata 2026-07-04 — resolve a confusão dos 3 blocos soltos): recommendation_card (a opção completa: parcela, logo, lance médio, antes/depois da contemplação) → simulation_result (aprofunda: cenário com lance, correção prevista) → comparison_table (convite pra comparar com as outras opções, por último, mesmo peso pra todas). As "outras opções" também seguem acessíveis depois pelo botao do card de decisão.

REGRA DURA — present_recommendation_card e present_comparison_table são INSEPARÁVEIS no ramo 2+ grupos (FIX-78, bug real conv a9c5effa 2026-06-25): se você chamou present_recommendation_card, é porque a busca devolveu 2+ grupos — então present_comparison_table com TODOS os grupos É OBRIGATÓRIO no MESMO turno (mesmo saindo por ÚLTIMO na ordem — ver acima). Emitir um sem o outro é DEFEITO: o usuário fica só com a proposta recomendada e PERDE o carrossel comparativo das demais (foi o que aconteceu — recommendation_card saiu, comparison_table sumiu). NUNCA emita um sem o outro no ramo 2+ grupos. (Só pulam os DOIS juntos quando a busca devolveu 1 grupo único — aí nenhum dos dois é chamado.)

O sistema entrega seu texto ANTES dos cards. Por isso seu texto deve introduzir o que vai aparecer, não comentar atributos específicos de cada grupo.`;
}

// ---- Simulador de contemplação (docx passo 4, linha 34-36) ----

export function buildSimulatorDialDirective(args: {
	administradora?: string;
	/** FIX-241 (âncora de dinheiro, spec 03): quando o usuário declarou
	 * poupança mensal, o mês em que o BOLSO cobre o lance (anchorMonth,
	 * dial-payload.ts:computeMoneyAnchor) — mesmo cálculo que ancora o
	 * initialTargetMonth do card. "Cálculo único, duas apresentações". */
	moneyAnchor?: { monthlySavings: number; anchoredMonth: number };
}): string {
	const { administradora, moneyAnchor } = args;
	const adminCtx = administradora
		? ` Use o grupo do plano recomendado (administradora "${administradora}") — os MESMOS dados reais que o usuário já viu.`
		: " Use o grupo do plano recomendado — os MESMOS dados reais que o usuário já viu.";
	const anchorInstruction = moneyAnchor
		? ` Além disso, o usuário disse que consegue juntar R$ ${moneyAnchor.monthlySavings.toLocaleString("pt-BR")}/mês pro lance — inclua UMA frase factual dizendo que, juntando esse valor por mês, lá pelo mês ${moneyAnchor.anchoredMonth} o dinheiro dele alcança o lance necessário. NÃO prometa contemplação nesse mês (é quando o BOLSO cobre o lance; a contemplação em si depende de lance vencer ou sorteio).`
		: "";
	// Conceito do Bernardo (simulador-agulha): o usuário aceitou a oferta do
	// simulador ("contemplado em 3, 6 ou 12 meses?"). O orquestrador dirige o
	// dial UMA vez — determinístico, não a critério do modelo.
	return `O usuário ACEITOU ver o simulador de contemplação. FLUXO OBRIGATÓRIO neste turno:
1. Escreva UMA frase curta NO SEU TOM introduzindo o simulador (ex: "Olha só: dá pra ver bem aqui quando você consegue ser contemplado:"). NÃO descreva o gesto físico do controle da UI; fale do que a pessoa vai DESCOBRIR (quando contempla), não de como manuseia a tela.${anchorInstruction}
2. Chame present_contemplation_dial UMA vez.${adminCtx} Nos marcos, destaque os cenários de 3, 6 e 12 meses (a pergunta do docx).

PROIBIDO neste turno: chamar search_groups, recommend_groups, simulate_quota, present_comparison_table, present_recommendation_card ou present_simulation_result de novo — o usuário JÁ VIU tudo isso (re-apresentar = loop). Depois que o usuário explorar o simulador e sinalizar que está satisfeito, o sistema dirige o card de decisão ("Esse plano faz sentido?").`;
}

// ---- Descoberta falhada (FIX-186) — fallback humano determinístico ----

/**
 * FIX-186 (Kairo 2026-07-01) — mensagem FIXA exibida ao usuário quando a
 * descoberta na Bevi falha após o retry silencioso. Substitui a narração crua
 * do modelo ("dificuldade técnica pontual" + preâmbulos "vou buscar"
 * empilhados). É o código dispondo (Lei 1): NÃO é directive pro modelo, é o
 * texto que chega DIRETO ao usuário (o orchestrator emite via text-delta, no
 * padrão do `yieldTransitionAbort`).
 *
 * Copy PT-BR correta (acentos/cedilha). ZERO palavra de erro técnico cru
 * ("problema"/"dificuldade técnica"/"instabilidade"/"erro"/"tente de novo") — o
 * detector do cassette (Camada 2) reprova exatamente essas. Enquadra a falha
 * como da BUSCA (não do perfil do usuário) e oferece as duas saídas: re-tentar
 * em instantes ou falar com um especialista da Aja.
 */
export function buildDiscoveryFailedFallback(args: { name?: string | null }): string {
	const saudacao = args.name ? `${args.name}, ` : "";
	return (
		`${saudacao}não consegui carregar as opções agora — foi coisa da nossa busca aqui, ` +
		"não do seu perfil. Me manda uma mensagem daqui a pouco que eu já trago as opções " +
		"certas pra você. Se preferir, também posso te conectar com um especialista da Aja " +
		"pra seguir com você."
	);
}

// ---- Tool fora do trilho / loop de tool-calls (FIX-262) — fallback humano determinístico ----

/**
 * FIX-262 (P1, veredito Fable r5, causa-raiz N1/N2) — mensagem FIXA exibida
 * quando o modelo chama uma tool fora do toolset da fase (AI SDK emite
 * `tool-error`) ou o turno estoura o cap duro de tool-calls. Nos dois casos o
 * runner suprimiu TODA narração do modelo (tende a negar uma oferta real que
 * está na própria tela — o achado do veredito). É o código dispondo (Lei 1):
 * NUNCA nega o que já foi mostrado, sempre reafirma que continua válido e
 * convida o usuário a apontar qual oferta ele quer olhar de novo.
 */
export function buildToolErrorRecoveryFallback(args: { name?: string | null }): string {
	const saudacao = args.name ? `${args.name}, ` : "";
	return (
		`${saudacao}as opções que já apareceram aqui pra você continuam valendo. ` +
		"Me diz o nome da administradora ou o valor que você quer olhar de novo que eu " +
		"detalho certinho pra você."
	);
}

// ---- Reveal LEGÍTIMO interrompido pelo guard de tool-error (FIX-286) ----

/**
 * FIX-286 (P0, veredito Sonnet r9pos2 §3) — texto que acompanha o
 * `recommendation_card` quando o guard de tool-error (FIX-262) interrompe a
 * PRIMEIRA apresentação do turno, mas `search_groups`/`recommend_groups` já
 * tinham retornado grupos reais (o runner materializa o card server-side a
 * partir deles, `buildRecommendationCardFromRevealGroup`). NUNCA usa a frase
 * "já apareceram" do `buildToolErrorRecoveryFallback` — seria mentira nesse
 * ponto (é a primeira vez que o usuário vê o card).
 */
export function buildFirstRevealCardIntro(args: { name?: string | null }): string {
	const saudacao = args.name ? `${args.name}, ` : "";
	return `${saudacao}encontrei uma opção que combina bem com o que você pediu — olha só:`;
}

/**
 * FIX-286 — quando o guard de tool-error interrompe a PRIMEIRA apresentação
 * do turno e os dados buscados não bastam pra montar o card completo (ex.:
 * só `search_groups` rodou, `recommend_groups` nunca chegou a rodar — sem
 * ranking, não há "melhor grupo" server-computed pra materializar), a
 * resposta é um D10 honesto de retry: nunca afirma que algo "já apareceu"
 * (nada apareceu ainda), nunca usa palavra de erro técnico cru (mesma regra
 * do `buildDiscoveryFailedFallback`), só sinaliza que a busca vai ser
 * retomada.
 */
export function buildFirstRevealRecoveryFallback(args: { name?: string | null }): string {
	const saudacao = args.name ? `${args.name}, ` : "";
	return (
		`${saudacao}ainda não terminei de montar as opções certinhas pra você — deixa eu ` +
		"retomar a busca rapidinho e já te trago tudo direitinho."
	);
}

// FIX-282 (P1, veredito Sonnet r9pos, G-B/I2) — a pergunta do usuário sobre
// EXATIDÃO do valor ("é de 120 mil como pedi?", "bate?", "sem ajuste?") ou
// sobre o CRITÉRIO de escolha ("por que essa e não outra?", "qual o
// critério?") tem resposta factual pronta em `meta.recommendedOffer` — mas
// o fallback genérico do tool-error (acima) é cego ao CONTEÚDO da pergunta e
// nunca a responde (contenção sem resolução, mesma família do FIX-266, mas
// pro caso em que o usuário NÃO cita administradora/valor — só questiona a
// oferta já na tela). Escopo estreito de propósito (preferindo
// falso-negativo a falso-positivo, decisão do card): mira só os padrões
// literais do dossiê que provou o bug, nunca dúvidas genéricas ("quero ver
// mais opções" continua no fallback antigo).
const EXACTNESS_QUESTION_PATTERNS: RegExp[] = [
	/\bbate\b/i,
	/\bexat[ao]\b/i,
	/\bexatamente\b/i,
	/\bsem\s+ajuste\b/i,
	/\bo\s+mesmo\s+valor\b/i,
	/\bcomo\s+(eu\s+)?pedi\b/i,
];

const CRITERIA_QUESTION_PATTERNS: RegExp[] = [
	/\bpor\s+qu[eê]\s+essa\b/i,
	/\be\s+n[ãa]o\s+outra\b/i,
	/\bcrit[ée]rio\b/i,
	/\bpor\s+qu[eê]\s+(voc[eê]\s+)?(me\s+)?recomend/i,
];

/** O texto do usuário questiona a EXATIDÃO do valor da carta ou o CRITÉRIO de
 * escolha da oferta já mostrada (probe-i2, FIX-282) — resposta honesta com os
 * números reais cabe aqui, nunca o fallback genérico cego ao conteúdo. */
export function isExactnessOrCriteriaQuestion(text: string): boolean {
	const t = text.trim();
	if (!t) return false;
	return (
		EXACTNESS_QUESTION_PATTERNS.some((rx) => rx.test(t)) ||
		CRITERIA_QUESTION_PATTERNS.some((rx) => rx.test(t))
	);
}

/**
 * FIX-282 — resposta FACTUAL determinística quando o tool-error interrompe o
 * modelo NO MEIO de uma pergunta de exatidão/critério (acima). Compara
 * `rawCreditValue` (valor PEDIDO, mesma âncora do FIX-261/281:
 * `qualifyAnswers.creditClampedFrom ?? creditMax`) × `creditValue` (carta
 * REAL), no mesmo padrão já validado da diretiva FIX-277
 * (`system-prompt.ts`). Decisão de design (Opção A, `AskUserQuestion`,
 * 2026-07-12): o critério de RANKING (score/scoreBreakdown) não é persistido
 * em `meta.recommendedOffer` hoje — em vez de inventar um número que não
 * existe em memória, a resposta cita o critério COMBINADO em termos gerais
 * (prazo/parcela/contemplação), nunca um score fabricado.
 */
export function buildToolErrorRecoveryExactnessFallback(args: {
	name?: string | null;
	offer: { administradora?: string; creditValue: number };
	rawCreditValue?: number;
}): string {
	const saudacao = args.name ? `${args.name}, ` : "";
	const marca = args.offer.administradora ? ` da ${args.offer.administradora}` : "";
	const creditoFmt = args.offer.creditValue.toLocaleString("pt-BR", {
		style: "currency",
		currency: "BRL",
	});
	let exatidao: string;
	if (typeof args.rawCreditValue === "number" && args.rawCreditValue !== args.offer.creditValue) {
		const pedidoFmt = args.rawCreditValue.toLocaleString("pt-BR", {
			style: "currency",
			currency: "BRL",
		});
		exatidao = `Você pediu ${pedidoFmt} — a carta real${marca} ficou em ${creditoFmt}, um ajuste em relação ao que você pediu.`;
	} else {
		exatidao = `Sim, a carta${marca} bate certinho com o valor que você pediu: ${creditoFmt}.`;
	}
	return (
		`${saudacao}${exatidao} Ela foi a que mais fez sentido pro seu perfil considerando prazo, ` +
		"parcela e chance de contemplação juntos, não só o valor de crédito isolado. Quer que eu " +
		"detalhe algum desses pontos ou prefere ver outra opção?"
	);
}

function formatOfferDetails(offer: ChosenOffer): string {
	const detalhes: string[] = [];
	if (typeof offer.creditValue === "number") {
		detalhes.push(
			`crédito de ${offer.creditValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
		);
	}
	if (typeof offer.monthlyPayment === "number") {
		detalhes.push(
			`parcela de ${offer.monthlyPayment.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
		);
	}
	if (typeof offer.termMonths === "number") detalhes.push(`prazo de ${offer.termMonths} meses`);
	return detalhes.join(", ");
}

// FIX-266 (P1, veredito Fable r6, "o que segura o 7" #1): o fallback do
// tool-error (acima) contém o turno, mas NUNCA resolvia — pedia "me diz o
// nome" mesmo quando o usuário TINHA acabado de nomear a oferta na própria
// mensagem que disparou o tool-error. O orchestrator agora roda
// `resolveOfferByMention` sobre o texto do usuário ANTES de cair no fallback
// (index.ts); quando resolve, usa ESTE texto — reafirma os dados da oferta
// já ancorada em tela, transformando contenção em resolução (nunca pede de
// novo o que o usuário já disse — Lei 1/4).
export function buildToolErrorRecoveryResolvedFallback(args: {
	name?: string | null;
	offer: ChosenOffer;
}): string {
	const saudacao = args.name ? `${args.name}, ` : "";
	const marca = args.offer.administradora ? ` da ${args.offer.administradora}` : "";
	const detalhes = formatOfferDetails(args.offer);
	const complemento = detalhes.length > 0 ? ` (${detalhes})` : "";
	return (
		`${saudacao}a oferta${marca}${complemento} que você citou continua valendo, tá aqui pra você. ` +
		"Quer seguir com ela ou prefere olhar outra opção?"
	);
}

// FIX-266 (2ª parte): o fallback enlatado repetia a MESMA frase 2× seguidas
// quando o resolver não achou match (menção genuinamente ambígua/sem match).
// index.ts detecta a repetição comparando com a última mensagem do assistant
// no histórico e troca pra ESTA variante — nunca idêntica, e concreta: lista
// as cotas JÁ EXIBIDAS em vez de repetir o pedido genérico.
export function buildToolErrorRecoveryFallbackRepeat(args: {
	name?: string | null;
	offers: ChosenOffer[];
}): string {
	const saudacao = args.name ? `${args.name}, ` : "";
	if (args.offers.length === 0) {
		return (
			`${saudacao}deixa eu ser mais direto: ainda não consegui identificar qual opção você quer. ` +
			"Pode me mandar de novo o nome da administradora que apareceu aqui pra tela?"
		);
	}
	const lista = args.offers
		.map((o) => {
			const detalhes = formatOfferDetails(o);
			return o.administradora
				? `${o.administradora}${detalhes ? ` (${detalhes})` : ""}`
				: detalhes;
		})
		.filter((s) => s.length > 0)
		.join("; ");
	return (
		`${saudacao}deixa eu ser mais direto: as opções que apareceram até agora são ${lista}. ` +
		"Me diz qual delas você quer olhar de novo."
	);
}

// ---- Decision prompt (passo 4 close → passo 5 da jornada) ----

/** FIX-253 (rodada 4, veredito Fable FINAL §3 — causa-raiz do 0-scarcity no
 * Fluxo A): enquanto `present_decision_prompt` ficou no toolset (reveal/
 * closing), o LLM a chamava DIRETO num turno de usuário comum, bypassando o
 * ramo do orchestrator (`nextGateToFire === "decision"`, index.ts) que
 * dispara o scarcity server-side ANTES da decisão — mesma lei violada que o
 * FIX-246 fechou pra embedded_bid/two_paths/scarcity. Agora o directive só
 * escreve a frase de fechamento; o card ("Esse plano faz sentido?") é
 * emissão SERVER-SIDE determinística (`buildDecisionPromptCard`,
 * server-cards.ts) — o LLM nunca mais chama tool nenhuma. */
export function buildDecisionPromptDirective(): string {
	return `O usuário já viu o plano recomendado + a simulação completa e sinalizou que quer seguir. FLUXO OBRIGATÓRIO neste turno: escreva UMA frase curta NO SEU TOM fechando a avaliação (ex: "Boa! Então deixa eu confirmar com você:" ou "Show, esse plano encaixa bem no que você pediu."). NÃO descreva números de novo, NÃO repita a simulação. NÃO chame present_decision_prompt nem NENHUMA outra tool neste turno — o sistema mostra o card de decisão automaticamente em seguida.

PROIBIDO neste turno: chamar search_groups, recommend_groups, simulate_quota, present_comparison_table, present_recommendation_card ou present_simulation_result de novo — o usuário JÁ VIU tudo isso. Re-apresentar = loop que quebra a experiência.`;
}
