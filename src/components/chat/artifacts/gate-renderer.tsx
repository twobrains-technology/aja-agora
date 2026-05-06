"use client";

import { useCallback } from "react";
import { type GateAction, useChatContext } from "@/lib/chat/provider";
import type { GatePartData, SliderField } from "@/lib/chat/ui-message";
import { GateQuickReply } from "./gate-quick-reply";
import { ValuePicker, type ValuePickerField } from "./value-picker";

function formatCurrency(value: number): string {
	if (value >= 1_000_000) {
		const m = value / 1_000_000;
		return m % 1 === 0 ? `R$ ${m.toFixed(0)} mi` : `R$ ${m.toFixed(1)} mi`;
	}
	if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)} mil`;
	return `R$ ${value.toLocaleString("pt-BR")}`;
}

function fieldToValuePickerField(field: SliderField): ValuePickerField {
	return {
		id: field.id,
		label: field.label,
		min: field.min,
		max: field.max,
		step: field.step,
		default: field.default,
		format: field.format,
	};
}

export function GateRenderer({
	payload,
	active = true,
}: {
	payload: GatePartData;
	active?: boolean;
}) {
	const { sendAction } = useChatContext();

	const handleSliderSubmit = useCallback(
		(values: Record<string, number>) => {
			if (payload.kind !== "slider") return;
			const credit = values.credit;
			const monthlyBudget = values.monthlyBudget;
			if (typeof credit !== "number" || typeof monthlyBudget !== "number") return;
			const label = `${formatCurrency(credit)} · ${formatCurrency(monthlyBudget)}/mês`;
			const action: GateAction = {
				kind: "gate",
				gate: "credit",
				value: { credit, monthlyBudget },
				label,
			};
			void sendAction(action, label);
		},
		[payload, sendAction],
	);

	if (payload.kind === "chips") {
		return <GateQuickReply payload={payload} active={active} />;
	}

	return (
		<ValuePicker
			payload={{
				category: payload.category ?? "auto",
				fields: payload.fields.map(fieldToValuePickerField),
			}}
			onSubmit={handleSliderSubmit}
			active={active}
		/>
	);
}
