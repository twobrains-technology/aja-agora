import type { ConversationMetadata } from "@/lib/agent/personas";
import type { PlanIntent } from "@/lib/agent/qualify-config";

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
 * tool nem re-perguntar. Espelha a saudação do caminho texto-livre; o
 * orchestrator dispara o gate de experience em seguida. */
export function buildNameCapturedDirective(name: string): string {
	return `O usuário informou que se chama "${name}" (pelo card de nome). O nome JÁ está salvo — NÃO chame save_contact_name, NÃO pergunte o nome de novo. FLUXO: escreva UMA frase curta e calorosa de saudação usando o nome ("Prazer, ${name}!" / "Boa, ${name}!" / "Show, ${name}!"). NÃO faca pergunta, NÃO chame tools, NÃO prometa "perguntas rápidas". PARE após a saudação — o sistema dispara o próximo passo (gate de experience) em seguida.`;
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

// ---- Qualify reactions ----

export function buildQualifyStartYesDirective(): string {
	// FIX-194 (qa-dono-produto, defeito E): o próximo passo é a IDENTIDADE (CPF +
	// celular + LGPD) — o sistema mostra esse card em seguida. O valor do bem tem o
	// PRÓPRIO passo, DEPOIS da identidade (FIX-53). Sem esta trava, o agente puxava
	// "Quanto custa o carro?" no MESMO balão do gate de CPF (uma pergunta que o
	// usuário nem pode responder ali). Uma coisa por vez: reage curto e PARA.
	return `Usuário aceitou começar a qualificação. FLUXO: escreva UMA frase curta e calorosa de transição no SEU TOM (ex.: "Perfeito, bora lá!" / "Show, vamos nessa."). NÃO pergunte o valor nem o preço do bem, NÃO peça nenhum dado, NÃO chame tools — o sistema conduz o próximo passo (a identidade) logo em seguida. O valor do bem vem DEPOIS, no passo dele.`;
}

export function buildQualifyStartMoreDirective(): string {
	return `[usuário clicou "Entender mais antes" — pergunte em uma frase curta sobre o que especificamente ele quer entender, sem despejar info ainda]`;
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

export function buildLanceReactionDirective(rangeTitle: string): string {
	return `Usuário respondeu "${rangeTitle}" sobre ter reserva pra lance. FLUXO: escreva UMA frase curta de reação positiva (ex: "Boa, lance acelera bastante a contemplação.", "Show, com lance dá pra antecipar."). NÃO explique o que e lance embutido aqui (o sistema vai apresentar isso em seguida), NÃO faca pergunta, NÃO chame tools.`;
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
	return `O usuário já viu o card de decisão e reafirmou que quer seguir. FLUXO: escreva UMA frase curta de fechamento no SEU TOM ("Boa! Pra fechar, só preciso de uns dados rápidos:") e chame present_contract_form (proposta real${adminCtx}). NUNCA inicie captura de lead nem prometa atendente humano — a contratação e self-service na plataforma. NÃO re-apresente search_groups/recommend_groups nem os cards do reveal.`;
}

export function buildSimulationInterestDirective(administradora: string): string {
	return `Usuário clicou "Tenho interesse" no card de simulação do grupo "${administradora}". FLUXO: (1) escreva UMA frase curta de confirmação no SEU TOM tipo "Boa, bora seguir então. Só preciso de uns dados rápidos." — proibido fazer pergunta nesta frase; PROIBIDO prometer "reservar" a opção ou atendente humano (a contratação é self-service na plataforma). (2) chame present_lead_form (sem parametros). NÃO chame outras tools.`;
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

	const hasBudget = typeof q.monthlyBudget === "number" && q.monthlyBudget > 0;
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
4. SE retornou 2 OU MAIS grupos: chame present_comparison_table com TODOS os grupos retornados por recommend_groups (o carrossel de opções que o usuário anunciado pode comparar), com highlightBestIndex=0 pra DESTACAR a recomendada. Isso mostra as opções anunciadas ("3 boas opções") lado a lado no próprio reveal — NÃO esconda as outras atrás de um botao. SE retornou apenas 1 grupo: NÃO chame present_comparison_table (só ha uma opção).
5. Chame simulate_quota com o groupId e o creditValue NOMINAL do grupo recomendado e em seguida present_simulation_result — o detalhamento do docx. OBRIGATÓRIO copiar do retorno do simulate_quota os campos lanceScenario e embeddedBid (variação com/sem lance e com lance embutido — exigência literal do docx); omiti-los é defeito.
6. SE recommend_groups retornar insufficientOptions=true: diga com transparência, em UMA frase, que as opções na faixa dele estao limitadas hoje e que você expandiu a busca pra trazer o que ha de melhor — NUNCA esconda a escassez nem invente abundância.${confrontoBudget}${confrontoFaixa}

A ORDEM dos cards no reveal: recommendation_card (a recomendada em destaque) → comparison_table (o carrossel de TODAS as opções, recomendada destacada) → simulation_result (detalhamento da recomendada). As "outras opções" também seguem acessíveis depois pelo botao do card de decisão, mas no reveal o usuário JÁ VE as opções anunciadas.

REGRA DURA — present_recommendation_card e present_comparison_table são INSEPARÁVEIS no ramo 2+ grupos (FIX-78, bug real conv a9c5effa 2026-06-25): se você chamou present_recommendation_card, é porque a busca devolveu 2+ grupos — então present_comparison_table com TODOS os grupos (highlightBestIndex=0) É OBRIGATÓRIO no MESMO turno. Emitir um sem o outro é DEFEITO: o usuário fica só com a proposta recomendada e PERDE o carrossel comparativo das demais (foi o que aconteceu — recommendation_card saiu, comparison_table sumiu). NUNCA emita um sem o outro no ramo 2+ grupos. (Só pulam os DOIS juntos quando a busca devolveu 1 grupo único — aí nenhum dos dois é chamado.)

O sistema entrega seu texto ANTES dos cards. Por isso seu texto deve introduzir o que vai aparecer, não comentar atributos específicos de cada grupo.`;
}

// ---- Simulador de contemplação (docx passo 4, linha 34-36) ----

export function buildSimulatorDialDirective(args: { administradora?: string }): string {
	const { administradora } = args;
	const adminCtx = administradora
		? ` Use o grupo do plano recomendado (administradora "${administradora}") — os MESMOS dados reais que o usuário já viu.`
		: " Use o grupo do plano recomendado — os MESMOS dados reais que o usuário já viu.";
	// Conceito do Bernardo (simulador-agulha): o usuário aceitou a oferta do
	// simulador ("contemplado em 3, 6 ou 12 meses?"). O orquestrador dirige o
	// dial UMA vez — determinístico, não a critério do modelo.
	return `O usuário ACEITOU ver o simulador de contemplação. FLUXO OBRIGATÓRIO neste turno:
1. Escreva UMA frase curta NO SEU TOM introduzindo o simulador (ex: "Olha só: dá pra ver bem aqui quando você consegue ser contemplado:"). NÃO descreva o gesto físico do controle da UI; fale do que a pessoa vai DESCOBRIR (quando contempla), não de como manuseia a tela.
2. Chame present_contemplation_dial UMA vez.${adminCtx} Nos marcos, destaque os cenários de 3, 6 e 12 meses (a pergunta do docx).

PROIBIDO neste turno: chamar search_groups, recommend_groups, simulate_quota, present_comparison_table, present_recommendation_card ou present_simulation_result de novo — o usuário JÁ VIU tudo isso (re-apresentar = loop). Depois que o usuário explorar o simulador e sinalizar que está satisfeito, o sistema dirige o card de decisão ("Esse plano faz sentido?").`;
}

// ---- Decision prompt (passo 4 close → passo 5 da jornada) ----

export function buildDecisionPromptDirective(args: { administradora?: string }): string {
	const { administradora } = args;
	const adminCtx = administradora
		? ` A administradora do plano recomendado e "${administradora}" — passe ela como contexto pro card.`
		: "";
	// Mirror do search reveal: o orquestrador dirige present_decision_prompt UMA
	// vez, pós-reveal, quando o usuário sinaliza avanco. Fecha o passo 4 da
	// jornada.docx ("Esse plano faz sentido?") e abre o passo 5 (contratar).
	return `O usuário já viu o plano recomendado + a simulação completa e sinalizou que quer seguir. FLUXO OBRIGATÓRIO neste turno:
1. Escreva UMA frase curta NO SEU TOM fechando a avaliação (ex: "Boa! Então deixa eu confirmar com você:" ou "Show, esse plano encaixa bem no que você pediu."). NÃO descreva números de novo, NÃO repita a simulação.
2. Chame present_decision_prompt UMA vez.${adminCtx}

PROIBIDO neste turno: chamar search_groups, recommend_groups, simulate_quota, present_comparison_table, present_recommendation_card ou present_simulation_result de novo — o usuário JÁ VIU tudo isso. Re-apresentar = loop que quebra a experiência. As 3 opções do card são fixas ("Sim, quero contratar agora" / "Quero ver outras opções" / "Quero falar com um especialista"); você só passa a administradora pra contexto. Quando o usuário clicar "contratar agora", o sistema segue pro passo 5 (present_contract_form).`;
}
