/**
 * Lead stage constants — safe for client and server imports.
 * Extracted from lead-transitions.ts to avoid pulling DB deps into the client bundle.
 */
// FIX-43: ordem canônica do funil (forward-only). O split do fechamento
// (na_administradora → aguardando_pagamento → fechado_ganho) reflete a mesa
// manual + boleto e é alimentado por polling (FIX-44). `perdido` é terminal.
export const STAGE_ORDER = [
	"novo",
	"engajado",
	"qualificado",
	"em_negociacao",
	"proposta_enviada",
	"na_administradora",
	// FIX-126: atendente de mesa assumiu o caso (claim "Vou atender"). Entre
	// na_administradora e aguardando_pagamento pra o claim avançar (forward-only).
	"em_atendimento",
	"aguardando_pagamento",
	"fechado_ganho",
	"perdido",
] as const;

export type LeadStage = (typeof STAGE_ORDER)[number];

/**
 * Nome de cada estágio na tela. Mora aqui — junto da ordem canônica — porque
 * antes vivia copiado dentro de um componente: qualquer estágio novo entrava no
 * enum e aparecia cru (`aguardando_pagamento`) em toda tela que não tinha a
 * cópia. Uma fonte só, client-safe.
 */
export const STAGE_LABELS: Record<LeadStage, string> = {
	novo: "Novo",
	engajado: "Engajado",
	qualificado: "Qualificado",
	em_negociacao: "Em Negociação",
	proposta_enviada: "Proposta Enviada",
	na_administradora: "Na Administradora",
	em_atendimento: "Em Atendimento",
	aguardando_pagamento: "Aguardando Pagamento",
	fechado_ganho: "Fechado Ganho",
	perdido: "Perdido",
};

export function rotuloDoEstagio(stage: string | null | undefined): string {
	if (!stage) return "Sem estágio";
	return STAGE_LABELS[stage as LeadStage] ?? stage;
}
