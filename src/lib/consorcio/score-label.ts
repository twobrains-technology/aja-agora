// FIX-7 (teste manual Kairo 2026-06-05): o card de recomendação exibia
// "43% compatível" na ÚNICA opção oferecida — % numérico baixo mina a
// confiança. Rótulo QUALITATIVO no card; % numérico fica pro contexto
// comparativo (comparison-table) e o breakdown segue no expansível
// "Por que esta recomendação?".

export function scoreLabel(score: number): string {
	if (score >= 0.75) return "Ótima compatibilidade";
	if (score >= 0.5) return "Boa compatibilidade";
	return "Compatível com seu perfil";
}

// FIX-18 (jornada BB real do Kairo, 2026-06-11): a melhor oferta na FAIXA DE
// CRÉDITO tinha parcela 9,8× o orçamento declarado (monthlyFit=0), mas o card
// rotulava "Compatível com seu perfil" — desonesto, o breakdown confessava
// "Orçamento 0%". Quando o orçamento não fecha, o rótulo vira honesto: é a
// melhor opção na FAIXA DE CRÉDITO, não no orçamento. (Sob orçamento — raro pro
// grupo recomendado, que maximiza o score com monthlyFit a 40% do peso — o
// rótulo segue honesto: nunca afirma compatibilidade que não existe.)
const MIN_BUDGET_FIT = 0.2;

export function recommendationFitLabel(score: number, monthlyFit: number): string {
	if (monthlyFit < MIN_BUDGET_FIT) return "Melhor opção na faixa de crédito";
	return scoreLabel(score);
}
