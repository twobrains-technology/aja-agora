import type { UserIntent } from "@/lib/agent/qualify-state";

// Sim/não em texto livre — módulo NEUTRO de propósito: é usado pelos dois
// runtimes (orchestrator/index.ts e langgraph/nodes/advance.ts) e não pode
// arrastar nenhuma dependência pesada. Quando morava no `index.ts`, importá-lo
// do grafo criava ciclo (index → runner → builder → …) e o Turbopack quebrava
// com "CJS module can't be async".
//
// Ter duas cópias era pior: a do grafo ficou para trás e manteve o bug em que
// o "não" ganhava por ser testado primeiro.
const YES_TEXT_MARKERS =
	/\b(sim|quero|considero|considerar|pode|pode ser|mostra|mostrar|topo|bora|vamos|manda ver|isso mesmo|show|beleza|claro|positivo|certo|ok)\b/i;
const NO_TEXT_MARKERS = /\bn[ãa]o\b/i;

export function detectYesNoText(text: string, intent: UserIntent): boolean | null {
	if (
		intent === "asking_question" ||
		intent === "expressing_doubt" ||
		intent === "confused" ||
		intent === "off_topic" ||
		intent === "wants_more_options"
	) {
		return null;
	}
	const t = text.trim();
	if (!t) return null;
	// "não sei" é HESITAÇÃO, não recusa — quem diz "não sei, pode mostrar sim"
	// está aceitando.
	const semHesitacao = t.replace(/\bn[ãa]o\s+sei\b/gi, " ");
	const nao = semHesitacao.match(NO_TEXT_MARKERS);
	const sim = semHesitacao.match(YES_TEXT_MARKERS);
	if (!nao) return sim ? true : null;
	if (!sim) return false;
	// Os dois na mesma frase: quem aparece PRIMEIRO governa. "não quero" é
	// recusa; "não sei, pode mostrar sim" é aceite. Empatar em null congelaria o
	// funil justamente nas recusas mais comuns ("não quero", "não, pode deixar"),
	// porque "quero"/"pode" estão na lista de SIM.
	return (sim.index ?? Number.MAX_SAFE_INTEGER) < (nao.index ?? Number.MAX_SAFE_INTEGER);
}
