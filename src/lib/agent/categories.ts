import type { PersonaRow } from "./system-prompt";

export type CategoryMeta = {
	label: string;
	emoji: string | null;
};

export const CATEGORY_META: Record<"imovel" | "auto" | "moto", CategoryMeta> = {
	imovel: { label: "Imóvel", emoji: "🏠" },
	auto: { label: "Automóvel", emoji: "🚗" },
	moto: { label: "Moto", emoji: "🏍" },
};

const CONCIERGE_META: CategoryMeta = { label: "geral", emoji: null };

export function getCategoryMeta(persona: Pick<PersonaRow, "role" | "category">): CategoryMeta {
	if (persona.role === "concierge" || !persona.category) return CONCIERGE_META;
	return CATEGORY_META[persona.category as keyof typeof CATEGORY_META] ?? CONCIERGE_META;
}
