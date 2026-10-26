// TRÊS GUARDAS DE VAZAMENTO — as únicas regras de TEXTO que sobrevivem ao corte.
//
// Não são conduta (isso é o prompt do vendedor): são vazamento de máquina para
// a pessoa. Se o modelo ecoar o CPF que acabou de receber, ou despejar o JSON
// dos argumentos de uma tool, quem lê é o cliente.
//
//  · `scrubCpf`           — mascara o que valida como CPF, por janela de 11 dígitos;
//  · `comprovanteDeAceite` — o registro do aceite: a fala sem dígito nenhum;
//  · `isJsonFragmentLeak` — o segmento é um fragmento de JSON de argumentos;
//  · `isInternalToolLeak` — o segmento cita o nome literal de uma tool.
import { isValidCpf, maskCpf } from "@/lib/conversation/identity";

/** Um TRECHO NUMÉRICO: a sequência MÁXIMA de dígitos e separadores, começando e terminando em
 * dígito. É a unidade que o guarda lê, em vez de um molde de formato (3-3-3-2): as bordas de
 * dígito impedem o trecho de começar ou terminar dentro do número vizinho.
 *
 * P288 (reauditorias 13, 14 e 15) — o remendo por formato parou, e os separadores têm que ser os
 * do capturador. A passada gulosa juntava o CPF ao celular ditado na sequência (`529.982.247 - 25
 * 11` = 13 dígitos) e devolvia o trecho em claro; e a delimitação antiga (ponto, hífen, espaço,
 * barra) dividia `529.982(247)-25` em trechos que nunca fechavam os 11 dígitos, enquanto
 * `telefone-ou-cpf.ts` (`NUMERO_DITADO`) lê parênteses entre os dígitos e captura esse número.
 * Um número que o capturador valida como CPF não pode sobreviver legível no comprovante. O que faz
 * um número de 11 dígitos ser CPF não é a pontuação: é fechar no dígito verificador. Então o
 * guarda decide por JANELA, com o MESMO conjunto de separadores do capturador (mais a barra, que o
 * guarda já lia: ele pode ler mais, nunca menos). */
const SEPARADOR_ENTRE_DIGITOS = "[.\\-\\s()/]";
const TRECHO_NUMERICO = new RegExp(`(?<!\\d)\\d(?:${SEPARADOR_ENTRE_DIGITOS}*\\d)*(?!\\d)`, "g");
const GRUPO_DE_DIGITOS = /\d+/g;

interface GrupoDeDigitos {
	do: number;
	ate: number;
	digitos: string;
}

/** Os dígitos dos grupos de `de` até `ate`, sem os separadores: é o que `isValidCpf` lê, e o que
 * decide se um trecho é grande demais pra entrar no comprovante. */
function digitosDosGrupos(grupos: GrupoDeDigitos[], de: number, ate: number): string {
	const fatia = grupos.slice(de, ate + 1);
	return fatia.map((g) => g.digitos).join("");
}

/** Os grupos de dígitos de um trecho, separados por qualquer separador: `529.982.247 - 25` →
 * `529|982|247|25`. Um grupo único de 11 dígitos (`52998224725`) é a janela de um grupo. */
function gruposDoTrecho(trecho: string): GrupoDeDigitos[] {
	return [...trecho.matchAll(GRUPO_DE_DIGITOS)].map((m) => ({
		do: m.index,
		ate: m.index + m[0].length,
		digitos: m[0],
	}));
}

/** O último grupo da janela que começa em `i` e soma EXATAMENTE 11 dígitos, se a janela fecha no
 * DV. Se a conta passa de 11, a janela daquele grupo não é CPF e a conta recomeça no grupo
 * seguinte — é o que impede um número longo de sair mascarado por uma janela deslocada. */
function fimDaJanelaDeCpf(grupos: GrupoDeDigitos[], i: number): number | null {
	let soma = 0;
	for (let j = i; j < grupos.length; j++) {
		soma += grupos[j].digitos.length;
		if (soma > 11) break;
		if (soma === 11 && isValidCpf(digitosDosGrupos(grupos, i, j))) return j;
	}
	return null;
}

/** Mascara CPF em texto livre, trecho por trecho. Só toca o que VALIDA no dígito verificador —
 * telefone, valor e data passam intactos, e o texto fora das janelas não muda: o comprovante é o
 * que o atendente lê depois. */
export function scrubCpf(text: string): string {
	if (!text) return text;
	return text.replace(TRECHO_NUMERICO, (trecho) => {
		const grupos = gruposDoTrecho(trecho);
		let resultado = "";
		let pos = 0;
		let i = 0;
		while (i < grupos.length) {
			const fim = fimDaJanelaDeCpf(grupos, i);
			if (fim === null) {
				resultado += trecho.slice(pos, grupos[i].ate);
				pos = grupos[i].ate;
				i++;
				continue;
			}
			resultado += trecho.slice(pos, grupos[i].do) + maskCpf(digitosDosGrupos(grupos, i, fim));
			pos = grupos[fim].ate;
			i = fim + 1;
		}
		return resultado;
	});
}

/** O COMPROVANTE do aceite — o que entra em `lgpdAceite.fala` (`whatsapp/contract-capture.ts` e
 * `pi/tools-livres.ts`). É a fala SEM DÍGITO NENHUM: o número do cliente — CPF, telefone, valor,
 * prazo — não é o consentimento e não pode ficar persistido fora da identidade cifrada. Nenhum
 * dígito significa que nenhum CPF é recuperável, qualquer que seja o separador ou o tamanho do
 * trecho; contar só o trecho de 8+ dígitos deixava `sim, (529)(982)(247)(25)` passar em três
 * trechos de 3. O corte de 200 chars vem DEPOIS: `maskCpf` é curto, então o truncamento nunca
 * perde o comprovante. */
export function comprovanteDeAceite(texto: string): string {
	return scrubCpf(texto).replace(/\d/g, "#").slice(0, 200);
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
