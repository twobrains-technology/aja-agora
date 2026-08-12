import type { Category, ConversationMetadata, Persona } from "@/lib/agent/personas";
import { pickPersonaForCategory } from "@/lib/agent/personas-repo";
import type { TurnAnalysis } from "@/lib/agent/turn-analyzer";

const CATEGORY_KEYWORDS: Record<Category, RegExp> = {
	imovel:
		/\b(im[oó]vel|im[oó]veis|apartamento|apto|casa|terreno|kitnet|comercial|sala\s+comercial)\b/i,
	auto: /\b(carro|autom[oó]vel|caminhonete|caminh[aã]o|ve[ií]culo)\b/i,
	moto: /\b(moto|motocicleta|motoca|motoneta)\b/i,
};

/** Trecho negado: a palavra de negação e o que vem logo depois dela, até a
 * próxima vírgula ou fim de frase. "não imóvel", "nem carro", "moto não". */
const TRECHO_NEGADO = /\b(n[ãa]o|nem)\b[^,.;!?]*/gi;
const NEGACAO_POSPOSTA = /\b([\p{L}]+)\s+n[ãa]o\b/giu;

/**
 * Qual bem o cliente citou? `null` quando nenhum.
 *
 * Golden `golden-troca-de-categoria`, vermelho em 2026-08-12: "Pensando melhor,
 * na verdade eu quero uma moto, não imóvel" resolvia como IMÓVEL e a transição
 * pra moto nunca acontecia. A versão anterior varria as categorias na ordem em
 * que estão escritas no objeto (imovel → auto → moto) e devolvia a primeira que
 * casasse em qualquer lugar do texto: "imóvel" aparecia dentro da NEGAÇÃO e
 * ganhava do "moto", que era o pedido. A ordem do objeto decidindo a categoria
 * da venda era acidente, não critério.
 *
 * Agora: o que vem negado não conta, e entre o que sobra vence o bem mencionado
 * PRIMEIRO na frase — que é como a pessoa fala ("quero uma moto, não imóvel").
 */
export function fallbackDetectCategory(text: string): Category | null {
	const semNegado = text.replace(NEGACAO_POSPOSTA, " ").replace(TRECHO_NEGADO, " ");

	let escolhida: Category | null = null;
	let posicao = Number.POSITIVE_INFINITY;
	for (const [cat, re] of Object.entries(CATEGORY_KEYWORDS) as Array<[Category, RegExp]>) {
		const m = semNegado.match(re);
		if (m?.index !== undefined && m.index < posicao) {
			posicao = m.index;
			escolhida = cat;
		}
	}
	return escolhida;
}

export type RoutingDecision =
	| { kind: "stay" }
	| { kind: "transition"; toCategory: Category; usedFallback: boolean };

/**
 * O funil ainda não construiu NADA sobre a categoria atual?
 *
 * Produção, 2026-08: uma conversa retomada seguiu como `auto` enquanto o cliente
 * falava de moto — a troca dependia de o ANALYZER marcar `isExplicitSwitch`, e
 * quando o modelo não marca, o cliente fala de moto a conversa inteira e a busca
 * roda em carro (Lei 1 invertida: o LLM dirigindo o fluxo).
 *
 * Antes da busca não existe oferta, número nem card ancorado na categoria velha
 * — trocar não destrói nada, e ficar é que quebra a venda. Depois do reveal o
 * cálculo se inverte: "e se fosse uma moto?" costuma ser pergunta hipotética no
 * meio de uma jornada de carro, e jogar a jornada fora é pior que ignorar. Por
 * isso o corte é `searchDispatched`, não `revealCompleted`: a busca é o primeiro
 * momento em que o funil gastou algo real na categoria.
 */
function funilAindaNaoInvestiu(meta: ConversationMetadata): boolean {
	return !meta.searchDispatched && !meta.revealCompleted;
}

export function decideRouting(
	text: string,
	meta: ConversationMetadata,
	analysis: TurnAnalysis,
): RoutingDecision {
	// O DETERMINÍSTICO MANDA QUANDO DISCORDA (Lei 1).
	//
	// Era `analysis.detectedCategory ?? fallback` — o analyzer sempre vencia, e o
	// fallback só entrava quando ele devolvia nada. Em "quero uma moto, não
	// imóvel" o analyzer devolve IMÓVEL (lê a palavra dentro da negação), a
	// comparação com `currentCategory` dá igual, e o routing responde `stay`: o
	// cliente pede moto a conversa inteira e o funil segue em imóvel.
	//
	// O fallback agora limpa negação e escolhe pela posição na frase (ver
	// `fallbackDetectCategory`), então quando ele aponta um bem DIFERENTE do atual
	// isso é evidência de texto, não palpite — e vence o classificador. Se ele não
	// acha nada, o analyzer segue valendo: ele entende formas que a keyword não
	// pega ("um apê", "minha casa própria").
	const porKeyword = fallbackDetectCategory(text);
	const detectedCategory =
		porKeyword && porKeyword !== meta.currentCategory
			? porKeyword
			: (analysis.detectedCategory ?? porKeyword);
	if (!detectedCategory) return { kind: "stay" };
	if (detectedCategory === meta.currentCategory) return { kind: "stay" };
	if (!meta.currentCategory || analysis.isExplicitSwitch || funilAindaNaoInvestiu(meta)) {
		return {
			kind: "transition",
			toCategory: detectedCategory,
			usedFallback: !analysis.detectedCategory,
		};
	}
	return { kind: "stay" };
}

export async function resolveIntraCategorySwitch(
	meta: ConversationMetadata,
	analysis: TurnAnalysis,
): Promise<Category | null> {
	if (!analysis.detectedSubTopic) return null;
	if (!meta.currentCategory) return null;
	if (analysis.detectedCategory && analysis.detectedCategory !== meta.currentCategory) {
		return null;
	}
	try {
		const target = await pickPersonaForCategory(meta.currentCategory, analysis.detectedSubTopic);
		const currentPersona: Persona | undefined = meta.currentPersona;
		if (target.id === currentPersona) return null;
		return meta.currentCategory;
	} catch {
		return null;
	}
}
