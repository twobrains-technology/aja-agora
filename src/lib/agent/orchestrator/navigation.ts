import type { Category, ExperiencePrev, ExpertiseLevel, QualifyAnswers } from "../personas";

export interface NavState {
	persona: string;
	category: Category | null;
	expertiseLevel?: ExpertiseLevel;
	experiencePrev?: ExperiencePrev | null;
	qualifyAnswers?: QualifyAnswers;
}

export const NAV_STACK_CAP = 20;

// Regex ancorada — exige que "voltar/volta" seja a primeira palavra significativa
// da mensagem. Evita falso-positivo em frases como "vou voltar amanhã" ou "queria
// voltar pra ver outras opções". Aceita variantes "voltar pro/para o menu",
// pontuação à direita, espaços extras.
export const BACK_INTENT_REGEX = /^\s*(volt(a|ar))(\s+(pro|para o)\s+menu)?\s*[.!?]*\s*$/i;

export function detectBackIntent(text: string): boolean {
	if (!text) return false;
	return BACK_INTENT_REGEX.test(text);
}

export function pushNavState(stack: NavState[], state: NavState): NavState[] {
	const next = [...stack, state];
	if (next.length > NAV_STACK_CAP) {
		return next.slice(next.length - NAV_STACK_CAP);
	}
	return next;
}

export function popNavState(stack: NavState[]): { stack: NavState[]; popped: NavState | null } {
	if (stack.length === 0) return { stack, popped: null };
	const popped = stack[stack.length - 1];
	return { stack: stack.slice(0, -1), popped };
}
