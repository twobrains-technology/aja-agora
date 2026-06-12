/**
 * Mede a posição REAL do scroll de um container pra decidir se está "no fundo".
 * FIX-32 Defeito 2: a detecção anterior (IntersectionObserver do sentinel h-20,
 * threshold 0.5) confundia POSIÇÃO com INTENÇÃO — um artifact alto entrando no
 * stream tirava o sentinel da viewport sem o usuário ter rolado, e o auto-scroll
 * parava de acompanhar. Medir a distância até o fundo é robusto a isso.
 */
export const BOTTOM_THRESHOLD_PX = 80;

export function isNearBottom(
	m: { scrollTop: number; scrollHeight: number; clientHeight: number },
	threshold: number = BOTTOM_THRESHOLD_PX,
): boolean {
	return m.scrollHeight - m.scrollTop - m.clientHeight <= threshold;
}
