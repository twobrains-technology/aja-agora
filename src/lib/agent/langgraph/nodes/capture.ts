// Nó `capture` — captura DETERMINÍSTICA que o analyzer livre não pega de forma
// confiável: o NOME no gate `name`. Roda ANTES do `analyze`, no começo do turno.
// O gate que o usuário está respondendo é `state.gate` (preservado pelo `human`
// do turno anterior; `route`/`routeFinal` sobrescrevem depois). Nunca decide o
// que o modelo fala — só extrai o dado e atualiza o estado (não engessa).
import { ehNomeProprioPlausivel } from "@/lib/leads/contact-capture";
import type { AgentGraphStateType } from "../state";

const NAME_PREFIX =
	/^(pode\s+me\s+chamar\s+de\s+|me\s+chama\s+de\s+|meu\s+nome\s+(é|e)\s+|pode\s+(me\s+)?chamar\s+|sou\s+(o|a)\s+|aqui\s+(é|e)\s+(o|a)\s+|é\s+(o|a)\s+)/i;

// A lista de "isto não é nome" vive em UM lugar só (`ehNomeProprioPlausivel`,
// contact-capture.ts). Aqui havia uma lista paralela e menor — não/sim/oi/olá/
// opa/eai/prefiro/quero/talvez/depois — e foi por essa fresta que passou o
// defeito de produção: no gate `name`, este nó pega a PRIMEIRA palavra do turno
// e a batiza como nome. "Ainda não sei bem" virava `contactName = "Ainda"`;
// "Voltei" virava "Voltei", que é o nome com que dois leads reais nasceram.
//
// São dois caminhos de escrita do nome (este, determinístico, e o
// `save_contact_name` que o modelo chama) e eles precisam concordar sobre o que
// é nome — duas listas divergentes é como o defeito sobreviveu ao primeiro
// conserto.
/** Uma apresentação é CURTA. Acima disto é frase, não nome. */
const MAX_PALAVRAS_NUM_NOME = 3;

function extractName(text: string): string | null {
	const t = text.trim().replace(NAME_PREFIX, "").trim();

	// Produção 2026-08: o cliente clicou no botão "Quitar o financiamento atual"
	// e o lead nasceu com `contact_name = "Quitar"`; "Tenho um financiamento de
	// apartamento pra trocar" virava "Tenho". Bastava a primeira palavra do turno
	// casar com o formato de palavra — qualquer frase que chegasse com o gate
	// `name` ativo era batizada. Uma frase não é uma apresentação.
	const palavras = t.split(/\s+/).filter(Boolean);
	if (palavras.length === 0 || palavras.length > MAX_PALAVRAS_NUM_NOME) return null;

	// Ancorado no INÍCIO: sem a âncora, a busca varria o texto atrás de qualquer
	// palavra aceitável e achava uma no meio da frase.
	const m = t.match(/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]{1,}/);
	if (!m) return null;
	const raw = m[0];
	if (!ehNomeProprioPlausivel(raw)) return null;
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
