/**
 * A meta acordada do primeiro degrau do funil.
 *
 * Combinada com o cliente em 15/09/2026: **ao menos 4% de quem clica no
 * WhatsApp inicia a conversa**. Até aqui nenhuma tela mostrava meta nenhuma —
 * "2,9% entram no chat" é número solto, e número sem régua não pede ação
 * (crítica de UI, item A.0.7).
 *
 * O valor mora aqui, e não dentro do componente, por dois motivos: é acordado
 * com o negócio (muda sem deploy de UI) e é lido por mais de uma tela.
 */

/** 4% — a fração mínima acordada de quem clica no WhatsApp que inicia a conversa. */
export const META_INICIO_DE_CONVERSA = 0.04;

/** Como o número está em relação à meta. */
export type PosicaoDaMeta = "acima" | "abaixo" | "na_meta";

/**
 * O texto que acompanha o marcador — sempre ESCRITO, nunca só a cor.
 *
 * Status nesta casa é ícone + rótulo; cor é reforço. Quem não distingue o verde
 * do vermelho precisa ler a mesma conclusão.
 */
export function posicaoDaMeta(percentual: number): PosicaoDaMeta {
	// Arredonda a 1 casa, como a tela exibe: 3,96% aparece como "4,0%" e não pode
	// ser lido como "abaixo da meta" — o que o olho vê e o que o rótulo diz têm
	// que ser a mesma coisa.
	const arredondado = Math.round(percentual * 10) / 10;
	const meta = Math.round(META_INICIO_DE_CONVERSA * 1000) / 10;
	if (arredondado > meta) return "acima";
	if (arredondado < meta) return "abaixo";
	return "na_meta";
}

/** O rótulo do marcador, conforme a posição. */
export function rotuloDaMeta(percentual: number): string {
	switch (posicaoDaMeta(percentual)) {
		case "acima":
			return "acima da meta";
		case "abaixo":
			return "abaixo da meta";
		default:
			return "na meta";
	}
}

/** A frase inteira, a mesma em qualquer tela que mostre o marcador. */
export const TEXTO_DA_META =
	"Meta acordada em 15/09: ao menos 4% de quem clica no WhatsApp inicia a conversa.";
