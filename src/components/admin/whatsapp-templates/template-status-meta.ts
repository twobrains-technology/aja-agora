// Mapa status do template (enum whatsapp_template_status) → rótulo PT-BR + variante
// de Badge. Lógica pura (dados) — testável em test:unit sem render, no padrão do
// repo (ex.: landing/process PROCESS_STEPS).
// Ciclo: DRAFT → PENDING → APPROVED/REJECTED; APPROVED pode virar DISABLED/PAUSED.

export type TemplateStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "DISABLED" | "PAUSED";

export type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

export const TEMPLATE_STATUS_META: Record<
	TemplateStatus,
	{ label: string; variant: BadgeVariant }
> = {
	DRAFT: { label: "Rascunho", variant: "outline" },
	PENDING: { label: "Em análise", variant: "secondary" },
	APPROVED: { label: "Aprovado", variant: "default" },
	REJECTED: { label: "Rejeitado", variant: "destructive" },
	DISABLED: { label: "Desabilitado", variant: "outline" },
	PAUSED: { label: "Pausado", variant: "secondary" },
};

export function templateStatusMeta(status: string): { label: string; variant: BadgeVariant } {
	return TEMPLATE_STATUS_META[status as TemplateStatus] ?? { label: status, variant: "outline" };
}
