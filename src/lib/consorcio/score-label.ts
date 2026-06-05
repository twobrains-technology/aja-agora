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
