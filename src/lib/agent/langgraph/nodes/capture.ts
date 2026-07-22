// Nó `capture` — captura DETERMINÍSTICA que o analyzer livre não pega de forma
// confiável: o NOME no gate `name`. Roda ANTES do `analyze`, no começo do turno.
// O gate que o usuário está respondendo é `state.gate` (preservado pelo `human`
// do turno anterior; `route`/`routeFinal` sobrescrevem depois). Nunca decide o
// que o modelo fala — só extrai o dado e atualiza o estado (não engessa).
import type { AgentGraphStateType } from "../state";

const NAME_PREFIX =
	/^(pode\s+me\s+chamar\s+de\s+|me\s+chama\s+de\s+|meu\s+nome\s+(é|e)\s+|pode\s+(me\s+)?chamar\s+|sou\s+(o|a)\s+|aqui\s+(é|e)\s+(o|a)\s+|é\s+(o|a)\s+)/i;
// palavras que NÃO são nome (evita "Não"/"Sim"/"Oi" virarem nome)
const NOT_A_NAME = /^(n[ãa]o|sim|oi|ol[áa]|opa|eai|prefiro|quero|talvez|depois)$/i;

function extractName(text: string): string | null {
	const t = text.trim().replace(NAME_PREFIX, "").trim();
	const m = t.match(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]{1,}/);
	if (!m) return null;
	const raw = m[0];
	if (NOT_A_NAME.test(raw)) return null;
	return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

export function captureAnswerNode(state: AgentGraphStateType): Partial<AgentGraphStateType> {
	if (!state.isUserTurn) return {};
	const text = (state.userText ?? "").trim();
	if (!text) return {};

	const gateRespondido = state.gate ?? state.answeredGate;
	if (gateRespondido === "name" && !state.contactName) {
		const name = extractName(text);
		if (name) return { contactName: name };
	}
	return {};
}
