import type { ConversationMetadata } from "@/lib/agent/personas";

// ---- Transition ----

export function buildTransitionFirstContactDirective(
	categoryLabel: string,
	nameHint: string,
): string {
	return `[sistema acabou de te conectar com o usuario que pediu pra falar sobre ${categoryLabel}]${nameHint ? ` ${nameHint}` : ""}`;
}

export function buildTransitionReturningDirective(): string {
	return `Voce esta RETOMANDO uma conversa que ja teve antes nesta sessao. NAO se apresente de novo. Responda direto a ultima mensagem do usuario NO SEU TOM, com naturalidade de quem esta voltando ao assunto. Em 1-2 frases.`;
}

export function buildTransitionCrossSpecialistDirective(): string {
	return `PRIMEIRA aparicao sua, mas o usuario ja conversou com outro especialista antes (sobre outra categoria). Comece DIRETO com a resposta a ultima mensagem do usuario NO SEU TOM. Nao se apresente nem mencione o especialista anterior. Em 1-2 frases.`;
}

// ---- Experience choices ----

export function buildExperienceFirstDirective(replyTitle: string): string {
	return `Usuario escolheu "${replyTitle}" — e a PRIMEIRA vez dele com consorcio. IMPORTANTE: o sistema JA te apresentou no turno anterior com saudacao + seu nome — NAO se apresente de novo, NAO diga "Aqui e Helena/Rafael/Camila", NAO mencione "anos de experiencia/mercado/especialidade". Va DIRETO ao conteudo. FLUXO: escreva UMA mensagem curta (3-4 frases) explicando o essencial sobre consorcio com SUAS palavras: e um grupo de pessoas que pagam parcelas mensais sem juros, e a cada mes alguem do grupo e contemplado por sorteio ou lance pra receber a carta de credito. Mencione brevemente que e diferente de financiamento (sem juros). NAO faca pergunta no final, NAO chame tools. Tom acolhedor e didatico, sem jargao tecnico (cota, lance livre, fundo reserva).`;
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

export function buildCreditReactionDirective(rangeTitle: string): string {
	return `Usuario escolheu faixa de credito "${rangeTitle}" via botao. FLUXO: escreva UMA frase curta de reacao tipo "Boa, anotado." ou "Show, faixa que gira bem." NAO faca pergunta, NAO chame tools. O sistema vai mandar logo em seguida os botoes da proxima etapa.`;
}

export function buildTimeframeReactionDirective(rangeTitle: string): string {
	return `Usuario escolheu prazo "${rangeTitle}" via botao. FLUXO: escreva UMA frase curta de reacao adaptada ao prazo (ex: "Boa, prazo que gira bem.", "Show, da pra fazer um lance forte.", "Tranquilo, sem pressa funciona pra parcela mais leve."). NAO faca pergunta, NAO chame tools. O sistema vai mandar logo em seguida os botoes da proxima etapa.`;
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

	const recommendStep = hasBudget
		? `4. SOMENTE SE search_groups retornou 2 OU MAIS grupos: chame recommend_groups com category="${category}"${filters}, budget=${q.monthlyBudget}, desiredTermMonths=${q.prazoMeses ?? 0}, e em seguida chame present_recommendation_card com a PRIMEIRA opcao retornada (a de maior score), incluindo administradora, category, creditValue, monthlyPayment, termMonths, score e scoreBreakdown exatos.

Se search_groups retornou apenas 1 grupo, NAO chame recommend_groups nem present_recommendation_card — o card unico ja eh suficiente, recomendar o mesmo grupo de novo seria redundante.`
		: "";

	return `O usuario completou as 4 perguntas de qualificacao:
- experiencia=${meta.experiencePrev}
- faixa de credito=R$ ${q.creditMin ?? 0} a R$ ${q.creditMax ?? "?"}${hasBudget ? `\n- parcela mensal=R$ ${q.monthlyBudget}` : ""}
- prazo=${q.prazoMeses ?? "?"} meses
- lance=${q.hasLance}

FLUXO OBRIGATORIO neste turno:
1. Em 1-2 frases curtas NO SEU TOM, espelhe esse perfil de volta pro usuario E ja convide a olhar as opcoes que vao aparecer em seguida (ex: "Beleza, ${q.creditMax ?? 0} mil em [prazo], com lance — separei essas opcoes pra voce:"). NAO use bullets/checkboxes (✅), NAO use template, NAO descreva numeros especificos dos grupos.
2. Chame search_groups com category="${category}"${filters}.
3. Chame present_comparison_table com os grupos retornados (ou present_group_card se vier so 1).
${recommendStep}

O sistema entrega seu texto ANTES dos cards. Por isso seu texto deve introduzir o que vai aparecer, nao comentar atributos especificos de cada grupo.`;
}
