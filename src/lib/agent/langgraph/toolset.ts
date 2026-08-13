// O toolset REAL que o modelo recebe no nó `converse` do grafo.
//
// Vive num módulo próprio (e não dentro de `nodes/converse.ts`) porque não é só
// o converse que precisa saber o que o modelo pode chamar: quem ESCREVE
// directive precisa saber também. Enquanto esta lista era privada do converse,
// `directives.ts` mandava "Chame search_groups", "chame recommend_groups" e
// "present_recommendation_card" — três tools que NUNCA estiveram aqui — e o
// modelo, obediente, tomava `Error: Tool "search_groups" not found` e traduzia
// isso para o cliente como problema técnico (produção 2026-08-13, sessões
// `a68b1945` e `04fda013`; a primeira terminou em handoff com a venda perdida).
//
// ⚠️ `tool-policy.ts` (`allowedTools`) NÃO descreve este toolset: ela é do
// runtime Vercel anterior e continua valendo para aquele caminho. Quem quiser
// saber o que o modelo tem NO GRAFO pergunta aqui — perguntar para a policy dá
// uma resposta plausível e errada.

/** Toolset WHAT-IF (goal doc — fix ALTA-4): o modelo escolhe livremente
 * chamar OU não. `search_groups`/`recommend_groups` ficam FORA de propósito
 * — são o nó `discovery`, nunca discricionárias (resolve a "tool sumida"
 * estruturalmente, crítico ALTA-2). */
export const WHAT_IF_TOOL_NAMES = [
	"simulate_quota",
	"get_group_details",
	"get_rates",
	"compare_with_financing",
	// Cálculo dos cenários de contemplação. Estavam FORA da lista e o cliente que
	// pedia "quero ver os cenários sim" não recebia nada — o modelo tinha só duas
	// saídas, inventar número (proibido) ou calar. `present_scenarios` (abaixo)
	// exige o output do `compute_scenarios` no schema, então sem estas duas a
	// tool de apresentação era inalcançável na prática.
	"compute_scenarios",
	"simulate_contemplation",
	// "essa parcela não cabe pra mim" → reposiciona a busca pra uma carta que
	// caiba no bolso dele. Sem ela, a objeção de preço não tinha resposta.
	"ajustar_por_parcela",
	// O cliente escolheu uma das cotas mostradas. Quem entende QUAL é o modelo
	// (por nome, por característica ou por referência); o código só confere que
	// ela foi mesmo exibida. Sem isto o servidor tentava adivinhar sozinho e
	// fechava contrato numa cota diferente da que o cliente falou.
	"escolher_cota",
	"check_proposal_status",
	"suggest_handoff",
	"save_contact_name",
	"save_contact_whatsapp",
	// Tools de APRESENTAÇÃO — é o que faz card aparecer na tela. Estavam de fora
	// do toolset do runtime LangGraph, então o modelo dizia "dá uma conferida nos
	// números da simulação aí no card" e NENHUM card existia. `search_groups`/
	// `recommend_groups` seguem fora (a descoberta é o nó `discovery`,
	// determinística) — estas aqui só DESENHAM o que já foi apurado.
	"present_simulation_result",
	"present_group_card",
	"present_comparison_table",
	"present_financing_comparison",
	// Atalhos de resposta pra pergunta que o próprio modelo acabou de fazer. Sem
	// ela, "quer que eu busque esses grupos?" deixava o cliente com um campo de
	// texto vazio, enquanto os gates do funil tinham chips. É a fala DELE sendo
	// respondida, então é ele quem escreve os rótulos; o payload não carrega valor
	// estruturado nenhum, então nenhum atalho daqui ancora cota ou fecha contrato.
	"present_quick_reply",
	// `present_contemplation_dial` NÃO entra: a agulha é o passo do gate
	// `simulator-offer`, que vem DEPOIS do lance embutido na cascata. Como tool
	// discricionária, o modelo a chamava assim que ouvia um valor de lance e
	// atropelava o embutido — na mesma tela caíam recomendação, agulha e card do
	// embutido, os três de uma vez. Ordem de funil é invariante: vive no código.
	"present_scenarios",
] as const;
