// TRÊS GUARDAS DE VAZAMENTO — as únicas regras de TEXTO que sobrevivem ao corte.
//
// Não são conduta (isso é o prompt do vendedor): são vazamento de máquina para
// a pessoa. Se o modelo ecoar o CPF que acabou de receber, ou despejar o JSON
// dos argumentos de uma tool, quem lê é o cliente.
//
//  · `scrubCpf`          — mascara qualquer sequência que valide como CPF real;
//  · `isJsonFragmentLeak` — o segmento é um fragmento de JSON de argumentos;
//  · `isInternalToolLeak` — o segmento cita o nome literal de uma tool.
import { isValidCpf, maskCpf } from "@/lib/conversation/identity";

/** CPF na forma CANÔNICA (3-3-3-2), com os separadores que o cliente usa, e
 * delimitado por não-dígito dos dois lados. É a 1ª passada de `scrubCpf`.
 *
 * A passada antiga era GULOSA (`{9,17}` entre dois dígitos): num texto com CPF e
 * celular na mesma frase ela engolia os dois números, o candidato saía com 18
 * dígitos, o DV não fechava (`isValidCpf` exige 11) e o CPF era devolvido em claro
 * — P288, reauditoria 13. As bordas `(?<!\d)`/`(?!\d)` impedem o candidato de
 * começar ou terminar dentro do número vizinho, e o molde consome exatamente
 * 3+3+3+2 dígitos: não há como engolir o telefone. */
const CPF_CANONICO = /(?<!\d)\d{3}[.\s]?\d{3}[.\s]?\d{3}[-.\s]?\d{2}(?!\d)/g;
const CPF_CANDIDATO = /\d[\d.\-\s]{9,17}\d/g;

/** Mascara CPF em texto livre. Só toca o que VALIDA no dígito verificador —
 * valor, data e telefone passam intactos.
 *
 * DUAS passadas, nesta ordem:
 *  1. a forma canônica, parada na borda do número (`CPF_CANONICO`) — o caso do CPF
 *     seguido de telefone, que a passada gulosa perdia;
 *  2. a passada antiga, sobre o resultado da 1ª, para os separadores que a forma
 *     canônica não alcança (espaço em volta do traço, pontuação misturada).
 * O que `maskCpf` produz não pode voltar a casar na 2ª passada: a máscara começa em
 * `*` e tem só 5 dígitos, menos dos 11 que `isValidCpf` exige — o comprovante já
 * mascarado não é remascado. */
export function scrubCpf(text: string): string {
	if (!text) return text;
	const canônico = text.replace(CPF_CANONICO, (m) => (isValidCpf(m) ? maskCpf(m) : m));
	return canônico.replace(CPF_CANDIDATO, (m) => (isValidCpf(m) ? maskCpf(m) : m));
}

/** Nomes de tool que o cliente nunca deve ler na fala do agente.
 *
 * Tem que espelhar `NOMES_DAS_TOOLS_LIVRES` (tools-livres.ts) — tool nova sem
 * entrada aqui é vazamento silencioso (L19/P274: `status_da_proposta` ficou de
 * fora). O teste ao lado compara as duas listas. */
const NOMES_DE_TOOL = [
	"buscar_cartas",
	"fazer_proposta",
	"mostrar_card",
	"falar_com_humano",
	"status_da_proposta",
	"salvar_nome",
];
const TOOL_LEAK = new RegExp(`\\b(${NOMES_DE_TOOL.join("|")})\\b`, "i");

const JSON_KV_LINE = /^\s*"[a-z][a-z0-9_-]*"\s*:\s*.+?,?\s*$/i;
const JSON_BRACE_LINE = /^\s*[{}[\]]\s*,?\s*$/;
const JSON_INLINE_OBJECT = /^\s*[{[][\s\S]*"[a-z][a-z0-9_-]*"\s*:[\s\S]*[}\]]\s*,?\s*$/i;
const FENCE_LINE = /^\s*```[a-z]*\s*$/i;

/** O segmento inteiro é um fragmento de JSON de tool (não fala). */
export function isJsonFragmentLeak(segment: string): boolean {
	const bruto = segment.trim();
	if (!bruto) return false;
	if (JSON_INLINE_OBJECT.test(bruto)) return true;
	const linhas = bruto
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);
	if (linhas.length === 0) return false;
	const conteudo = linhas.filter((l) => !FENCE_LINE.test(l));
	if (conteudo.length === 0) return false;
	return conteudo.every(
		(l) => JSON_KV_LINE.test(l) || JSON_BRACE_LINE.test(l) || JSON_INLINE_OBJECT.test(l),
	);
}

/** O segmento cita o nome de uma tool interna. */
export function isInternalToolLeak(segment: string): boolean {
	const s = segment.trim();
	if (!s) return false;
	return TOOL_LEAK.test(s);
}

/** Último passe do texto que vai para o cliente: mascara CPF e derruba o que é
 * claramente máquina (JSON de argumento ou nome de tool). */
export function passaFinal(text: string): string {
	if (isJsonFragmentLeak(text) || isInternalToolLeak(text)) return "";
	return scrubCpf(text);
}
