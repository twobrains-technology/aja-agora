// As tools que DEVOLVEM ou DESENHAM número de oferta — carta, parcela, prazo,
// taxa, contemplação, lance.
//
// Com o desbloqueio do telefone pendente (D1 do FIX-432), elas SAEM do conjunto
// ligado: a trava é de CONTEXTO e de TOOL, nunca de regex sobre a fala. Sem o
// número na mão e sem a ferramenta que o busca, o modelo não tem como citá-lo.
//
// Vive aqui (e não dentro do nó) porque quem monta o conjunto de tools é o
// driver do turno — e ele não importa o motor antigo.
export const TOOLS_QUE_REVELAM_OFERTA: ReadonlySet<string> = new Set([
	"simulate_quota",
	"compare_with_financing",
	"compute_scenarios",
	"simulate_contemplation",
	"ajustar_por_parcela",
	"get_group_details",
	"get_rates",
	"present_simulation_result",
	"present_group_card",
	"present_comparison_table",
	"present_financing_comparison",
	"present_scenarios",
]);
