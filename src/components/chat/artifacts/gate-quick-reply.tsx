"use client";

import { motion } from "motion/react";
import { useCallback, useState } from "react";
import { type GateAction, useChatContext } from "@/lib/chat/provider";
import type { GatePartData, GatePartOption } from "@/lib/chat/ui-message";

type ChipsPayload = Extract<GatePartData, { kind: "chips" }>;

export function buildAction(gate: ChipsPayload["gate"], option: GatePartOption): GateAction {
	if (gate === "experience") {
		return {
			kind: "gate",
			gate: "experience",
			value: option.value as "first" | "returning" | "doubts",
			label: option.label,
		};
	}
	if (gate === "consent") {
		return {
			kind: "gate",
			gate: "consent",
			value: option.value as "yes" | "more",
			label: option.label,
		};
	}
	if (gate === "timeframe") {
		return {
			kind: "gate",
			gate: "timeframe",
			value: { prazoMeses: Number.parseInt(option.value, 10) },
			label: option.label,
		};
	}
	// docx passo 2: "Qual valor aproximado?" — o token do chip é o valor do lance
	// em reais (String(pct), ex.: "12000"). DEVE virar { lanceValue: number }, não
	// cair no default de `lance` (que gravaria o valor em hasLance e pularia o gate
	// lance-embutido). Regressão: BUG-LANCE-VALUE-GATE 2026-06-04.
	if (gate === "lance-value") {
		return {
			kind: "gate",
			gate: "lance-value",
			value: { lanceValue: Number.parseInt(option.value, 10) },
			label: option.label,
		};
	}
	if (gate === "lance-embutido") {
		return {
			kind: "gate",
			gate: "lance-embutido",
			value: option.value as "yes" | "no",
			label: option.label,
		};
	}
	if (gate === "simulator-offer") {
		return {
			kind: "gate",
			gate: "simulator-offer",
			value: option.value as "yes" | "no",
			label: option.label,
		};
	}
	return {
		kind: "gate",
		gate: "lance",
		value: option.value as "yes" | "maybe" | "no",
		label: option.label,
	};
}

export function GateQuickReply({
	payload,
	active = true,
}: {
	payload: ChipsPayload;
	active?: boolean;
}) {
	const { sendAction, status } = useChatContext();
	const [submitted, setSubmitted] = useState(false);
	const isStreaming = status === "submitted" || status === "streaming";

	const onSelect = useCallback(
		async (option: GatePartOption) => {
			if (submitted) return;
			setSubmitted(true);
			await sendAction(buildAction(payload.gate, option), option.label);
		},
		[payload.gate, sendAction, submitted],
	);

	if (submitted || !active) return null;

	return (
		<motion.div
			initial={{ opacity: 0, y: 4 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ type: "spring", stiffness: 320, damping: 28 }}
			className="flex flex-wrap gap-2"
		>
			{payload.options.map((opt) => (
				<button
					key={opt.value}
					type="button"
					onClick={() => onSelect(opt)}
					disabled={isStreaming}
					className="inline-flex items-center gap-[7px] h-[34px] px-[14px] border border-primary/[.28] rounded-full bg-primary/[.05] text-xs font-medium text-foreground cursor-pointer transition-colors hover:bg-primary/10 disabled:cursor-default disabled:opacity-50"
				>
					{opt.label}
				</button>
			))}
		</motion.div>
	);
}
