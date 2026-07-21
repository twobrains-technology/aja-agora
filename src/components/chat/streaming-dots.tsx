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
import { useEffect, useState } from "react";

type ToolLabelStage = { afterMs: number; text: string; icon: LucideIcon };

// FIX-288: as 4 tools de descoberta real (search_groups/recommend_groups/
// simulate_quota/get_rates) tocam a Bevi e podem levar 15-64s (latências reais
// do dossiê, veredito-r9pos2-sonnet.md §1/§3) — ganham estágios progressivos
// de copy pra sinalizar que o processo AVANÇA internamente, evitando a
// sensação de tela travada. As demais tools (present_*, capture_lead etc.) são
// server-side determinísticas e rápidas (Lei 1/4) — 1 único texto basta, nunca
// chegam ao 2º estágio na prática (decisão registrada em
// docs/decisoes/blocos/2026-07-12-bloco-r9-3-latencia-percebida.md).
const TOOL_LABEL_STAGES: Record<string, ToolLabelStage[]> = {
	search_groups: [
		{ afterMs: 0, text: "Buscando grupos", icon: Search },
		{ afterMs: 8_000, text: "Consultando administradoras em tempo real", icon: Search },
		{ afterMs: 18_000, text: "Quase lá, finalizando a busca", icon: Search },
	],
	recommend_groups: [
		{ afterMs: 0, text: "Comparando grupos", icon: BarChart3 },
		{ afterMs: 8_000, text: "Rankeando as melhores opções", icon: BarChart3 },
		{ afterMs: 18_000, text: "Quase lá, finalizando a comparação", icon: BarChart3 },
	],
	simulate_quota: [
		{ afterMs: 0, text: "Simulando parcelas", icon: Calculator },
		{ afterMs: 8_000, text: "Calculando cenários de parcela", icon: Calculator },
		{ afterMs: 18_000, text: "Quase lá, finalizando a simulação", icon: Calculator },
	],
	get_rates: [
		{ afterMs: 0, text: "Consultando taxas", icon: BarChart3 },
		{ afterMs: 8_000, text: "Buscando taxas atualizadas", icon: BarChart3 },
		{ afterMs: 18_000, text: "Quase lá, finalizando a consulta", icon: BarChart3 },
	],
	get_group_details: [{ afterMs: 0, text: "Carregando detalhes", icon: FileText }],
	present_group_card: [{ afterMs: 0, text: "Preparando opções", icon: Sparkles }],
	present_comparison_table: [{ afterMs: 0, text: "Montando comparativo", icon: Table }],
	present_simulation_result: [{ afterMs: 0, text: "Calculando simulação", icon: Calculator }],
	present_recommendation_card: [{ afterMs: 0, text: "Selecionando recomendação", icon: Sparkles }],
	present_lead_form: [{ afterMs: 0, text: "Preparando formulário", icon: ClipboardList }],
	present_value_picker: [{ afterMs: 0, text: "Preparando opções", icon: Sparkles }],
	suggest_handoff: [{ afterMs: 0, text: "Avaliando próximo passo", icon: UserCheck }],
	capture_lead: [{ afterMs: 0, text: "Salvando dados", icon: UserCheck }],
};

/** Turno sem tool: os primeiros segundos ficam só nos pontinhos (é o "digitando"
 * normal); passando disso, a espera precisa de palavra — senão lê como travado. */
const ESPERA_SEM_TOOL: ToolLabelStage[] = [
	{ afterMs: 0, text: "", icon: Sparkles },
	{ afterMs: 6_000, text: "Montando sua resposta", icon: Sparkles },
	{ afterMs: 15_000, text: "Ainda estou aqui, organizando os números", icon: Sparkles },
	{ afterMs: 30_000, text: "Quase lá, finalizando", icon: Sparkles },
];

/** Estágio atual pro tempo decorrido: o último cujo `afterMs` já foi atingido. */
function currentStage(stages: ToolLabelStage[], elapsedMs: number): ToolLabelStage {
	let stage = stages[0];
	for (const s of stages) {
		if (s.afterMs <= elapsedMs) stage = s;
	}
	return stage;
}

export function StreamingDots({ tool }: { tool?: string } = {}) {
	// FIX-288: timer reseta sempre que `tool` muda (novo tool-call chegou) —
	// nunca continua contando do tool anterior. Tick a cada 1s só enquanto
	// houver mais de 1 estágio pra essa tool (tools de 1 estágio só não agendam
	// re-render à toa).
	const [elapsedMs, setElapsedMs] = useState(0);
	useEffect(() => {
		setElapsedMs(0);
		// O timer roda mesmo SEM tool: turno longo sem tool nenhuma (o reveal faz
		// dois beats de modelo e chega perto de um minuto) deixava só três pontos
		// mudos na tela, e a pessoa acha que travou.
		if (tool && (TOOL_LABEL_STAGES[tool]?.length ?? 0) <= 1) return;
		const interval = setInterval(() => {
			setElapsedMs((prev) => prev + 1_000);
		}, 1_000);
		return () => clearInterval(interval);
	}, [tool]);

	const stages = tool ? TOOL_LABEL_STAGES[tool] : ESPERA_SEM_TOOL;
	// Nos primeiros segundos o silêncio é natural (o agente está "digitando"); o
	// rótulo só entra quando a espera começa a parecer travamento.
	const label = stages ? currentStage(stages, elapsedMs) : undefined;

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

	// Rótulo vazio = ainda é o "digitando" normal: cai no balão de pontinhos.
	if (label?.text) {
		// Tool status: pill branca com borda + ícone azul + texto + dots
		return (
			<output
				className="inline-flex items-center gap-[9px] rounded-full border border-border bg-card px-[14px] py-[9px] text-xs font-medium text-muted-foreground shadow-[0_1px_2px_rgba(5,36,64,0.05),0_8px_20px_-14px_rgba(5,36,64,0.2)]"
				aria-label={`${label.text}…`}
			>
				<AnimatePresence mode="wait">
					<motion.span
						key={`tool:${tool}:${label.text}`}
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
