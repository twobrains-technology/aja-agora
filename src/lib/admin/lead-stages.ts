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
