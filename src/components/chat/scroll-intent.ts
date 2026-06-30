/**
 * Mede a posição REAL do scroll de um container pra decidir se está "no fundo".
 * FIX-32 Defeito 2: a detecção anterior (IntersectionObserver do sentinel h-20,
 * threshold 0.5) confundia POSIÇÃO com INTENÇÃO — um artifact alto entrando no
 * stream tirava o sentinel da viewport sem o usuário ter rolado, e o auto-scroll
 * parava de acompanhar. Medir a distância até o fundo é robusto a isso.
 */
export const BOTTOM_THRESHOLD_PX = 80;

type ScrollMetrics = { scrollTop: number; scrollHeight: number; clientHeight: number };

export function isNearBottom(m: ScrollMetrics, threshold: number = BOTTOM_THRESHOLD_PX): boolean {
	return distanceToBottom(m) <= threshold;
}

/** Distância (px) entre a posição atual e o fundo do container. 0 = colado. */
export function distanceToBottom(m: ScrollMetrics): number {
	return m.scrollHeight - m.scrollTop - m.clientHeight;
}

// FIX-111 — HISTERESE. Um único threshold (80px) fazia o stick alternar true/false
// a cada px perto do fim (token novo/reflow durante o stream) e o auto-scroll ligava
// e desligava → "scroll indo e voltando". Com dois limiares e uma banda morta, o
// estado só muda quando cruza a borda OPOSTA: estando GRUDADO, só solta se o usuário
// afastar BEM do fim (> exit); estando SOLTO, só re-gruda se chegar BEM perto (<= enter).
// Entre os dois, o estado é estável — sem oscilação.
export const STICK_ENTER_PX = 40;
export const STICK_EXIT_PX = 160;

export function nextStickState(
	prevStick: boolean,
	m: ScrollMetrics,
	opts: { enterPx?: number; exitPx?: number } = {},
): boolean {
	const enter = opts.enterPx ?? STICK_ENTER_PX;
	const exit = opts.exitPx ?? STICK_EXIT_PX;
	const d = distanceToBottom(m);
	// Grudado: mantém até afastar além do exit. Solto: só re-gruda dentro do enter.
	return prevStick ? d <= exit : d <= enter;
}
