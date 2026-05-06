"use client";

import {
	BarChart3,
	Calculator,
	ClipboardList,
	FileText,
	type LucideIcon,
	Search,
	Sparkles,
	Table,
	UserCheck,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

const TOOL_LABELS: Record<string, { text: string; icon: LucideIcon }> = {
	search_groups: { text: "Buscando grupos", icon: Search },
	simulate_quota: { text: "Simulando parcelas", icon: Calculator },
	get_rates: { text: "Consultando taxas", icon: BarChart3 },
	get_group_details: { text: "Carregando detalhes", icon: FileText },
	recommend_groups: { text: "Comparando grupos", icon: BarChart3 },
	present_group_card: { text: "Preparando opções", icon: Sparkles },
	present_comparison_table: { text: "Montando comparativo", icon: Table },
	present_simulation_result: { text: "Calculando simulação", icon: Calculator },
	present_recommendation_card: { text: "Selecionando recomendação", icon: Sparkles },
	present_lead_form: { text: "Preparando formulário", icon: ClipboardList },
	present_value_picker: { text: "Preparando opções", icon: Sparkles },
	suggest_handoff: { text: "Avaliando próximo passo", icon: UserCheck },
	capture_lead: { text: "Salvando dados", icon: UserCheck },
};

export function StreamingDots({ tool }: { tool?: string } = {}) {
	const label = tool ? TOOL_LABELS[tool] : undefined;

	return (
		<output className="flex items-center gap-2 py-1" aria-label="Processando...">
			<AnimatePresence mode="wait">
				{label ? (
					<motion.div
						key={`tool:${tool}`}
						initial={{ opacity: 0, y: 4 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -4 }}
						transition={{ duration: 0.2 }}
						className="flex items-center gap-2"
					>
						<label.icon className="size-3.5 text-primary" />
						<span className="text-xs text-muted-foreground">{label.text}</span>
					</motion.div>
				) : null}
			</AnimatePresence>
			<div className="flex gap-0.5">
				{[0, 1, 2].map((i) => (
					<motion.span
						key={i}
						className="size-1.5 rounded-full bg-muted-foreground/60"
						animate={{ opacity: [0.3, 1, 0.3] }}
						transition={{
							duration: 1,
							repeat: Number.POSITIVE_INFINITY,
							delay: i * 0.15,
							ease: "easeInOut",
						}}
					/>
				))}
			</div>
		</output>
	);
}
