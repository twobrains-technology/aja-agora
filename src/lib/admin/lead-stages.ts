/**
 * Lead stage constants — safe for client and server imports.
 * Extracted from lead-transitions.ts to avoid pulling DB deps into the client bundle.
 */
export const STAGE_ORDER = [
  "novo",
  "engajado",
  "qualificado",
  "em_negociacao",
  "proposta_enviada",
  "fechado_ganho",
  "perdido",
] as const;

export type LeadStage = (typeof STAGE_ORDER)[number];
