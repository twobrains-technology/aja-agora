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

export function decideRouting(
	text: string,
	meta: ConversationMetadata,
	analysis: TurnAnalysis,
): RoutingDecision {
	const detectedCategory = analysis.detectedCategory ?? fallbackDetectCategory(text);
	if (!detectedCategory) return { kind: "stay" };
	if (detectedCategory === meta.currentCategory) return { kind: "stay" };
	if (!meta.currentCategory || analysis.isExplicitSwitch) {
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
