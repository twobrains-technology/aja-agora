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

const CPF_CANDIDATO = /\d[\d.\-\s]{9,17}\d/g;

/** Mascara CPF em texto livre. Só toca o que VALIDA no dígito verificador —
 * valor, data e telefone passam intactos. */
export function scrubCpf(text: string): string {
	if (!text) return text;
	return text.replace(CPF_CANDIDATO, (m) => (isValidCpf(m) ? maskCpf(m) : m));
}

/** Nomes de tool que o cliente nunca deve ler na fala do agente. */
const NOMES_DE_TOOL = ["buscar_cartas", "fazer_proposta", "falar_com_humano", "salvar_nome"];
const TOOL_LEAK = new RegExp(`\\b(present_[a-z_]+|${NOMES_DE_TOOL.join("|")})\\b`, "i");

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
