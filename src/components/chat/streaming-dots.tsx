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

	// Três pontos pulsantes (keyframe tyB: translateY -5px, opacity 1 → opaco, delay escalonado)
	const Dots = (
		<div className="flex gap-[5px] items-center">
			{[0, 1, 2].map((i) => (
				<motion.span
					key={i}
					className="size-[7px] rounded-full bg-[#c2cdda] block"
					animate={{ y: [0, -5, 0], opacity: [0.5, 1, 0.5] }}
					transition={{
						duration: 1,
						repeat: Number.POSITIVE_INFINITY,
						delay: i * 0.15,
						ease: "easeInOut",
					}}
				/>
			))}
		</div>
	);

	if (label) {
		// Tool status: pill branca com borda + ícone azul + texto + dots
		return (
			<output
				className="inline-flex items-center gap-[9px] rounded-full border border-border bg-white px-[14px] py-[9px] text-xs font-medium text-muted-foreground shadow-[0_1px_2px_rgba(5,36,64,0.05),0_8px_20px_-14px_rgba(5,36,64,0.2)]"
				aria-label={`${label.text}…`}
			>
				<AnimatePresence mode="wait">
					<motion.span
						key={`tool:${tool}`}
						initial={{ opacity: 0, y: 3 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -3 }}
						transition={{ duration: 0.18 }}
						className="flex items-center gap-[9px]"
					>
						<label.icon className="size-[15px] shrink-0 text-primary" aria-hidden="true" />
						<span>{label.text}</span>
					</motion.span>
				</AnimatePresence>
				{Dots}
			</output>
		);
	}

	// Balão puro de "typing" — três pontos dentro do estilo do balão do assistente
	return (
		<output className="flex items-center gap-[5px] py-[2px]" aria-label="Processando...">
			{Dots}
		</output>
	);
}
