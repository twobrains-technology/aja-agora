import type { Category, ConversationMetadata, Persona } from "@/lib/agent/personas";
import { pickPersonaForCategory } from "@/lib/agent/personas-repo";
import type { TurnAnalysis } from "@/lib/agent/turn-analyzer";

const CATEGORY_KEYWORDS: Record<Category, RegExp> = {
	imovel:
		/\b(im[oó]vel|im[oó]veis|apartamento|apto|casa|terreno|kitnet|comercial|sala\s+comercial)\b/i,
	auto: /\b(carro|autom[oó]vel|caminhonete|caminh[aã]o|ve[ií]culo)\b/i,
	moto: /\b(moto|motocicleta|motoca|motoneta)\b/i,
};

export function fallbackDetectCategory(text: string): Category | null {
	for (const [cat, re] of Object.entries(CATEGORY_KEYWORDS) as Array<[Category, RegExp]>) {
		if (re.test(text)) return cat;
	}
	return null;
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
	const detectedCategory = analysis.detectedCategory ?? fallbackDetectCategory(text);
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
