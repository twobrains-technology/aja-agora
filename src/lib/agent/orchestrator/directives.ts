import type { ConversationMetadata } from "@/lib/agent/personas";

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
		: " IMPORTANTE: voce ainda NAO sabe o nome do usuario. Sua primeira mensagem deve reagir em 1 frase curta ao objetivo dele E em SEGUIDA perguntar como pode chama-lo (ex: 'Show, carro novo abre portas! Antes de eu te ajudar, como posso te chamar?'). NAO pergunte sobre experiencia previa nem mencione outros assuntos — apenas reaja + peca o nome. Quando o usuario responder, chame save_contact_name imediatamente.";
	// docx passo 1 (linha 14): a ponte literal pro passo 2 — dita o texto que o
	// agente usa logo apos saber o nome, antes da pergunta de experiencia.
	const bridgeInstruction = ` PONTE DO PASSO 1 (docx): assim que souber o nome, sua resposta usa a ponte "Perfeito, [nome]! Precisamos fazer mais algumas perguntinhas pra buscar o melhor consórcio pra um(a) ${categoryLabel.toLowerCase()}" — e SE o usuario ja tiver mencionado um valor, inclua "de cerca de R$ X" com o valor dele. NAO invente valor se ele nao disse.`;
	return `[sistema acabou de te conectar com o usuario que pediu pra falar sobre ${categoryLabel}]${nameInstruction}${bridgeInstruction}`;
}

export function buildTransitionReturningDirective(): string {
	return `Voce esta RETOMANDO uma conversa que ja teve antes nesta sessao. NAO se apresente de novo. Responda direto a ultima mensagem do usuario NO SEU TOM, com naturalidade de quem esta voltando ao assunto. Em 1-2 frases.`;
}

export function buildTransitionCrossSpecialistDirective(): string {
	return `PRIMEIRA aparicao sua, mas o usuario ja conversou com outro especialista antes (sobre outra categoria). Comece DIRETO com a resposta a ultima mensagem do usuario NO SEU TOM. Nao se apresente nem mencione o especialista anterior. Em 1-2 frases.`;
}

// ---- Experience choices ----

export function buildExperienceFirstDirective(replyTitle: string): string {
	// FIX-1 (teste manual Kairo 2026-06-05): o bullet do papel da Aja Agora e
	// EXIGENCIA do docx passo 1 e estava faltando — sem ele o usuario nao
	// entende o que a plataforma faz por ele. Tom: proximidade/afinidade
	// (pedido do cliente), nao explicacao seca.
	return `Usuario escolheu "${replyTitle}" — e a PRIMEIRA vez dele com consorcio. IMPORTANTE: o sistema JA te apresentou no turno anterior com saudacao + seu nome — NAO se apresente de novo, NAO diga "Aqui e Helena/Rafael/Camila", NAO mencione "anos de experiencia/mercado/especialidade". Va DIRETO ao conteudo. FLUXO: escreva UMA mensagem curta (4-5 frases) explicando o essencial sobre consorcio com SUAS palavras: e um grupo de pessoas que pagam parcelas mensais sem juros, e a cada mes alguem do grupo e contemplado por sorteio ou lance pra receber a carta de credito (na 1a mencao, explique que carta de credito e o valor que ele recebe pra comprar o bem). Mencione brevemente que e diferente de financiamento (sem juros). OBRIGATORIO fechar com o papel da plataforma, fiel ao docx: "Nosso papel na Aja Agora e encontrar o grupo com maior chance de atender seu objetivo no prazo que voce deseja." (pode adaptar levemente ao seu tom, mantendo papel + objetivo + prazo). NAO faca pergunta no final, NAO chame tools. Tom acolhedor, proximo e didatico — celebre a primeira conquista dele como um consultor que esta junto, sem jargao tecnico (cota, lance livre, fundo reserva).`;
}

export function buildExperienceReturningDirective(replyTitle: string): string {
	return `Usuario escolheu "${replyTitle}" — ele JA tem familiaridade com consorcio. IMPORTANTE: o sistema JA te apresentou no turno anterior — NAO se apresente de novo, NAO diga "Aqui e Helena/Rafael/Camila", NAO mencione "anos de experiencia/mercado/especialidade". FLUXO: escreva APENAS UMA frase curta de transicao tipo "Show, vamos direto ao ponto entao." ou "Beleza, vamos seguir." NAO explique o produto, NAO faca pergunta, NAO chame tools.`;
}

export function buildExperienceDoubtsDirective(replyTitle: string): string {
	return `Usuario escolheu "${replyTitle}" — ele tem duvidas sobre consorcio. IMPORTANTE: o sistema JA te apresentou no turno anterior — NAO se apresente de novo, NAO diga "Aqui e Helena/Rafael/Camila", NAO mencione "anos de experiencia/mercado/especialidade". Va DIRETO ao conteudo. FLUXO: escreva UMA mensagem (4-5 frases) explicando o essencial do produto com SUAS palavras: e um grupo de pessoas que paga parcelas mensais sem juros, contemplacao acontece por sorteio ou lance, prazo flexivel, diferenca de financiamento. Apos a explicacao, EM UMA frase curta convide o usuario a perguntar algo especifico se quiser ("se ficou alguma duvida especifica, manda aqui que eu respondo"). Tom acolhedor e didatico, sem jargao tecnico (cota, lance livre, fundo reserva). NAO chame tools.`;
}

// ---- Qualify reactions ----

export function buildQualifyStartYesDirective(): string {
	return `[usuario aceitou comecar a qualificacao]`;
}

export function buildQualifyStartMoreDirective(): string {
	return `[usuario clicou "Entender mais antes" — pergunte em uma frase curta sobre o que especificamente ele quer entender, sem despejar info ainda]`;
}

/** FIX-3 — reação ao "Planeje sua conquista" (híbrido VENDEDOR, decisão do
 * Kairo 2026-06-05): o usuário acabou de entregar valor do bem + mês-alvo +
 * parcela (+ lance) num componente só. O agente NÃO re-pergunta nada disso —
 * CONFIRMA proativamente como um vendedor que persuade o fechamento e avança. */
export function buildPlanReactionDirective(args: {
	assetLabel: string;
	targetMonth?: number;
	lanceLabel?: string;
}): string {
	const alvo = args.targetMonth ? ` em ~${args.targetMonth} meses` : "";
	const lance = args.lanceLabel ? ` com lance de ${args.lanceLabel}` : "";
	return `Usuario preencheu o plano da conquista via componente: ${args.assetLabel}${alvo}${lance}. FLUXO: escreva UMA mensagem curta (2-3 frases) DE VENDEDOR confirmando a estrategia dele com entusiasmo e autoridade — espelhe o que ele escolheu (valor, prazo-alvo${args.lanceLabel ? ", lance" : ""}) SEM re-perguntar nada disso, reforce em meia frase o beneficio da estrategia (ex: lance acelera a contemplacao / prazo confortavel deixa a parcela leve) e sinalize que o proximo passo e buscar as opcoes reais. NAO faca pergunta, NAO chame tools — o sistema conduz a proxima etapa.`;
}

export function buildCreditReactionDirective(rangeTitle: string): string {
	return `Usuario escolheu faixa de credito "${rangeTitle}" via botao. FLUXO: escreva UMA frase curta de reacao tipo "Boa, anotado." ou "Show, faixa que gira bem." NAO faca pergunta, NAO chame tools. O sistema vai mandar logo em seguida os botoes da proxima etapa.`;
}

export function buildTimeframeReactionDirective(rangeTitle: string): string {
	return `Usuario escolheu prazo "${rangeTitle}" via botao. FLUXO: escreva UMA frase curta de reacao adaptada ao prazo (ex: "Boa, prazo que gira bem.", "Show, da pra fazer um lance forte.", "Tranquilo, sem pressa funciona pra parcela mais leve."). NAO faca pergunta, NAO chame tools. O sistema vai mandar logo em seguida os botoes da proxima etapa.`;
}

export function buildLanceReactionDirective(rangeTitle: string): string {
	return `Usuario respondeu "${rangeTitle}" sobre ter reserva pra lance. FLUXO: escreva UMA frase curta de reacao positiva (ex: "Boa, lance acelera bastante a contemplacao.", "Show, com lance da pra antecipar."). NAO explique o que e lance embutido aqui (o sistema vai apresentar isso em seguida), NAO faca pergunta, NAO chame tools.`;
}

// ---- Group actions ----

export function buildGroupSelectedDirective(
	administradora: string,
	groupId: string,
	creditValue: number,
	termMonths: number,
): string {
	return `Usuario selecionou o grupo "${administradora}" (creditValue=${creditValue}, prazo=${termMonths}m). FLUXO: (1) escreva UMA frase curta de introducao no SEU TOM tipo "Beleza, da uma olhada na simulacao da ${administradora}:" — proibido "vou simular", "deixa eu calcular"; tambem proibido descrever numeros (parcela/taxa) em texto, isso e o trabalho do card. (2) chame simulate_quota com groupId="${groupId}" E creditValue=${creditValue}; (3) chame present_simulation_result com o retorno da tool. NAO chame recommend_groups. NAO chame simulate_quota mais de uma vez. O card ja tem botoes "Tenho interesse!" e "Ajustar valor".`;
}

export function buildSimulateDirective(
	administradora: string,
	groupId: string,
	creditValue: number,
): string {
	return `Usuario quer simular o grupo "${administradora}" (creditValue=${creditValue}). FLUXO: (1) escreva UMA frase curta de introducao no SEU TOM tipo "Show, vai aparecer aqui:" ou "Aqui ta a simulacao:" — proibido "vou simular" e proibido descrever numeros em texto. (2) chame simulate_quota com groupId="${groupId}" E creditValue=${creditValue}; (3) chame present_simulation_result. O card ja tem botoes "Tenho interesse!" e "Ajustar valor". NAO simule de novo o mesmo grupo.`;
}

export function buildWhatIfDirective(administradora: string, currentCreditValue: number): string {
	return `O usuario quer ajustar o valor de credito do grupo "${administradora}" (creditValue atual=${currentCreditValue}). Pergunte em UMA frase qual valor de credito ou parcela mensal ele quer simular agora. NAO simule ainda, espere a resposta dele com o novo valor.`;
}

export function buildSimulationInterestDirective(administradora: string): string {
	return `Usuario clicou "Tenho interesse" no card de simulacao do grupo "${administradora}". FLUXO: (1) escreva UMA frase curta de confirmacao no SEU TOM tipo "Show, vou reservar essa opcao pra voce. So preciso de uns dados rapidos." — proibido fazer pergunta nesta frase. (2) chame present_lead_form (sem parametros). NAO chame outras tools.`;
}

export function buildDetailDirective(groupId: string): string {
	return `O usuario quer detalhes do grupo ${groupId}. Use get_group_details com esse groupId. NAO mencione IDs na resposta.`;
}

export function buildRangePickerDirective(
	categoryLabel: string,
	category: string,
	filtros: string,
	budgetFmt: string,
): string {
	return `Usuario escolheu via slider a faixa de ${categoryLabel} (${filtros}, orcamento mensal R$ ${budgetFmt}). FLUXO OBRIGATORIO: (1) escreva UMA frase curta de introducao no SEU TOM tipo "Encontrei essas opcoes na sua faixa, escolhe uma pra simular:" — NAO descreva numeros especificos dos grupos em texto, isso e o trabalho do card. (2) chame search_groups com category="${category}" e os filtros (${filtros}); (3) se retornar 1 grupo, chame present_group_card; se retornar 2 ou mais, chame present_comparison_table com TODOS os grupos. NUNCA descreva os grupos em texto corrido — o componente visual e obrigatorio. NAO chame recommend_groups.`;
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

	// docx passos 3-4: mostrar PRIMEIRO o "Plano recomendado pela Aja Agora" em
	// DESTAQUE + o detalhamento E o carrossel das opcoes lado a lado.
	// Teste manual Kairo (2026-06-11): "disse que tinha 3 opcoes mas mostrou so
	// uma" — o reveal anunciava 3 mas escondia as outras 2 atras de um botao. Agora
	// o carrossel (present_comparison_table, a recomendada destacada) aparece NO
	// reveal. Mais fiel ao docx (linha 32 "Encontramos 3 boas opcoes" + linha 37
	// "ver outras opcoes pra comparacao"). Ver CONTEXT.md (D15).
	return `O usuario completou as 4 perguntas de qualificacao:
- experiencia=${meta.experiencePrev}
- faixa de credito=R$ ${q.creditMin ?? 0} a R$ ${q.creditMax ?? "?"}${hasBudget ? `\n- parcela mensal=R$ ${q.monthlyBudget}` : ""}
- prazo=${q.prazoMeses ?? "?"} meses
- lance=${q.hasLance}

FLUXO OBRIGATORIO neste turno (ordem do docx — recomendado PRIMEIRO, em destaque):
1. Chame search_groups com category="${category}"${filters} ANTES de anunciar qualquer coisa.
2. Anuncie conforme o RESULTADO REAL da busca (honestidade > template — FIX-7):
   - 3 ou mais grupos: use a copy do docx passo 3: "Encontramos 3 boas opcoes para o seu perfil. Agora vamos te recomendar a mais adequada:".
   - 2 grupos: anuncie "2 boas opcoes" (numero real).
   - apenas 1 grupo: anuncie que encontrou UMA opcao forte pra ele — NAO anuncie "3 boas opcoes", NAO use plural ("boas opcoes") nem prometa comparacao/curadoria que nao existe.
   Em 1-2 frases curtas NO SEU TOM. NAO use bullets/checkboxes (✅), NAO use template, NAO descreva numeros especificos dos grupos.
3. SE retornou 2 OU MAIS grupos: chame recommend_groups com category="${category}"${filters}${budgetArgs} e em seguida present_recommendation_card com a PRIMEIRA opcao retornada (maior score) — administradora, category, creditValue, monthlyPayment, termMonths, score, scoreBreakdown E contempladosMes (copie de availableSlots do grupo — campo do resumo por opcao do docx) exatos. SE retornou apenas 1 grupo: NAO chame present_recommendation_card nem present_group_card (duplicaria o detalhamento — o card unico do reveal e a simulacao abaixo); seu texto faz o papel da recomendacao.
4. SE retornou 2 OU MAIS grupos: chame present_comparison_table com TODOS os grupos retornados por recommend_groups (o carrossel de opcoes que o usuario anunciado pode comparar), com highlightBestIndex=0 pra DESTACAR a recomendada. Isso mostra as opcoes anunciadas ("3 boas opcoes") lado a lado no proprio reveal — NAO esconda as outras atras de um botao. SE retornou apenas 1 grupo: NAO chame present_comparison_table (so ha uma opcao).
5. Chame simulate_quota com o groupId e o creditValue NOMINAL do grupo recomendado e em seguida present_simulation_result — o detalhamento do docx. OBRIGATORIO copiar do retorno do simulate_quota os campos lanceScenario e embeddedBid (variacao com/sem lance e com lance embutido — exigencia literal do docx); omiti-los e defeito.
6. SE recommend_groups retornar insufficientOptions=true: diga com transparencia, em UMA frase, que as opcoes na faixa dele estao limitadas hoje e que voce expandiu a busca pra trazer o que ha de melhor — NUNCA esconda a escassez nem invente abundancia.

A ORDEM dos cards no reveal: recommendation_card (a recomendada em destaque) → comparison_table (o carrossel de TODAS as opcoes, recomendada destacada) → simulation_result (detalhamento da recomendada). As "outras opcoes" tambem seguem acessiveis depois pelo botao do card de decisao, mas no reveal o usuario JA VE as opcoes anunciadas.

O sistema entrega seu texto ANTES dos cards. Por isso seu texto deve introduzir o que vai aparecer, nao comentar atributos especificos de cada grupo.`;
}

// ---- Simulador de contemplação (docx passo 4, linha 34-36) ----

export function buildSimulatorDialDirective(args: { administradora?: string }): string {
	const { administradora } = args;
	const adminCtx = administradora
		? ` Use o grupo do plano recomendado (administradora "${administradora}") — os MESMOS dados reais que o usuario ja viu.`
		: " Use o grupo do plano recomendado — os MESMOS dados reais que o usuario ja viu.";
	// Conceito do Bernardo (simulador-agulha): o usuario aceitou a oferta do
	// simulador ("contemplado em 3, 6 ou 12 meses?"). O orquestrador dirige o
	// dial UMA vez — determinístico, não a critério do modelo.
	return `O usuario ACEITOU ver o simulador de contemplacao. FLUXO OBRIGATORIO neste turno:
1. Escreva UMA frase curta NO SEU TOM introduzindo o simulador (ex: "Olha que legal — arrasta a agulha pro mes que voce quer e ve como fica:").
2. Chame present_contemplation_dial UMA vez.${adminCtx} Nos marcos, destaque os cenarios de 3, 6 e 12 meses (a pergunta do docx).

PROIBIDO neste turno: chamar search_groups, recommend_groups, simulate_quota, present_comparison_table, present_recommendation_card ou present_simulation_result de novo — o usuario JA VIU tudo isso (re-apresentar = loop). Depois que o usuario explorar o simulador e sinalizar que esta satisfeito, o sistema dirige o card de decisao ("Esse plano faz sentido?").`;
}

// ---- Decision prompt (passo 4 close → passo 5 da jornada) ----

export function buildDecisionPromptDirective(args: { administradora?: string }): string {
	const { administradora } = args;
	const adminCtx = administradora
		? ` A administradora do plano recomendado e "${administradora}" — passe ela como contexto pro card.`
		: "";
	// Mirror do search reveal: o orquestrador dirige present_decision_prompt UMA
	// vez, pos-reveal, quando o usuario sinaliza avanco. Fecha o passo 4 da
	// jornada.docx ("Esse plano faz sentido?") e abre o passo 5 (contratar).
	return `O usuario ja viu o plano recomendado + a simulacao completa e sinalizou que quer seguir. FLUXO OBRIGATORIO neste turno:
1. Escreva UMA frase curta NO SEU TOM fechando a avaliacao (ex: "Boa! Entao deixa eu confirmar com voce:" ou "Show, esse plano encaixa bem no que voce pediu."). NAO descreva numeros de novo, NAO repita a simulacao.
2. Chame present_decision_prompt UMA vez.${adminCtx}

PROIBIDO neste turno: chamar search_groups, recommend_groups, simulate_quota, present_comparison_table, present_recommendation_card ou present_simulation_result de novo — o usuario JA VIU tudo isso. Re-apresentar = loop que quebra a experiencia. As 3 opcoes do card sao fixas ("Sim, quero contratar agora" / "Quero ver outras opcoes" / "Quero falar com um especialista"); voce so passa a administradora pra contexto. Quando o usuario clicar "contratar agora", o sistema segue pro passo 5 (present_contract_form).`;
}
