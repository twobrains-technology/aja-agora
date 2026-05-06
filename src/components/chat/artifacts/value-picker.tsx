"use client";

import { ArrowRight, Check } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { useChatContext } from "@/lib/chat/provider";
import type { ValuePickerField, ValuePickerPayload } from "@/lib/chat/types";

export type { ValuePickerField, ValuePickerPayload };

function formatValue(value: number, format?: "currency" | "months"): string {
	if (format === "currency") {
		if (value >= 1_000_000) {
			const m = value / 1_000_000;
			return m % 1 === 0 ? `R$ ${m.toFixed(0)} mi` : `R$ ${m.toFixed(1)} mi`;
		}
		if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)} mil`;
		return `R$ ${value.toLocaleString("pt-BR")}`;
	}
	if (format === "months") return `${value} meses`;
	return `R$ ${value.toLocaleString("pt-BR")}`;
}

export function ValuePicker({
	payload,
	onSubmit,
	active = true,
}: {
	payload: ValuePickerPayload;
	onSubmit?: (values: Record<string, number>) => void;
	active?: boolean;
}) {
	const { sendUserMessage, status } = useChatContext();
	const isStreaming = status === "submitted" || status === "streaming";
	const [values, setValues] = useState<Record<string, number>>(() => {
		const initial: Record<string, number> = {};
		for (const field of payload.fields) initial[field.id] = field.default;
		return initial;
	});
	const [submitted, setSubmitted] = useState(false);

	const handleSubmit = useCallback(() => {
		setSubmitted(true);
		if (onSubmit) {
			onSubmit(values);
			return;
		}
		const parts: string[] = [];
		for (const field of payload.fields) {
			const val = values[field.id];
			if (field.format === "currency")
				parts.push(`${field.label}: R$ ${val.toLocaleString("pt-BR")}`);
			else if (field.format === "months") parts.push(`${field.label}: ${val} meses`);
			else parts.push(`${field.label}: R$ ${val.toLocaleString("pt-BR")}/mês`);
		}
		void sendUserMessage(parts.join(", "));
	}, [values, payload.fields, sendUserMessage, onSubmit]);

	if (submitted || !active) return null;

	return (
		<motion.div
			initial={{ opacity: 0, y: 6 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ type: "spring", stiffness: 300, damping: 25 }}
		>
			<Card className="overflow-hidden border-primary/20">
				<CardContent className="space-y-3 p-3.5">
					{/* Compact sliders */}
					{payload.fields.map((field) => (
						<div key={field.id} className="space-y-1.5">
							<div className="flex items-baseline justify-between">
								<span className="text-xs font-medium text-muted-foreground">{field.label}</span>
								<motion.span
									key={values[field.id]}
									initial={{ scale: 1.05 }}
									animate={{ scale: 1 }}
									className="font-mono text-sm font-bold"
								>
									{formatValue(values[field.id], field.format)}
								</motion.span>
							</div>
							<Slider
								value={[values[field.id]]}
								min={field.min}
								max={field.max}
								step={field.step}
								onValueChange={(val) => {
									if (!submitted) {
										const v = Array.isArray(val) ? val[0] : val;
										setValues((prev) => ({ ...prev, [field.id]: v }));
									}
								}}
								disabled={submitted}
							/>
						</div>
					))}

					{/* Submit */}
					<Button
						onClick={handleSubmit}
						disabled={submitted || isStreaming}
						size="sm"
						className="w-full gap-1.5 text-xs"
					>
						{submitted ? (
							<>
								<Check className="size-3.5" />
								Enviado
							</>
						) : (
							<>
								Buscar opções
								<ArrowRight className="size-3.5" />
							</>
						)}
					</Button>
				</CardContent>
			</Card>
		</motion.div>
	);
}
