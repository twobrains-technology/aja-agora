"use client";

import { ArrowRight, Check } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { useChatContext } from "@/lib/chat/provider";
import type { ValuePickerField, ValuePickerPayload } from "@/lib/chat/types";
import { identifyLinkRoles, recalcLinkedValues } from "@/lib/consorcio/value-picker-link";

export type { ValuePickerField, ValuePickerPayload };

function formatValue(value: number, format?: "currency" | "months"): string {
	if (format === "currency") {
		if (value >= 1_000_000) {
			const m = value / 1_000_000;
			return m % 1 === 0 ? `R$ ${m.toFixed(0)} mi` : `R$ ${m.toFixed(1)} mi`;
		}
		// FIX-16: abaixo de 10 mil o valor exato importa (parcela derivada) —
		// "R$ 1.600" arredondado pra "R$ 2 mil" vira mentira visual.
		if (value >= 10_000) {
			const k = value / 1_000;
			return k % 1 === 0 ? `R$ ${k.toFixed(0)} mil` : `R$ ${k.toFixed(1).replace(".", ",")} mil`;
		}
		return `R$ ${value.toLocaleString("pt-BR")}`;
	}
	if (format === "months") return `${value} meses`;
	return `R$ ${value.toLocaleString("pt-BR")}`;
}

// FIX-55: input numérico livre pra campos `currency` — o usuário digita o valor
// exato (R$ 347.500) e ele propaga sem snap ao step do slider. Estado de texto
// próprio (digitação livre), commit (parse + clamp à faixa) no blur/Enter.
function CurrencyInput({
	field,
	value,
	disabled,
	onCommit,
}: {
	field: ValuePickerField;
	value: number;
	disabled: boolean;
	onCommit: (v: number) => void;
}) {
	const [text, setText] = useState(() => value.toLocaleString("pt-BR"));
	useEffect(() => {
		setText(value.toLocaleString("pt-BR"));
	}, [value]);

	const commit = () => {
		const digits = text.replace(/\D/g, "");
		const parsed = digits ? Number.parseInt(digits, 10) : field.min;
		const clamped = Math.min(field.max, Math.max(field.min, parsed));
		onCommit(clamped);
		setText(clamped.toLocaleString("pt-BR"));
	};

	return (
		<span className="flex shrink-0 items-center gap-1 text-primary">
			<span className="text-xs font-medium">R$</span>
			<Input
				value={text}
				inputMode="numeric"
				disabled={disabled}
				onChange={(e) => setText(e.target.value)}
				onBlur={commit}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						commit();
					}
				}}
				data-testid={`value-input-${field.id}`}
				aria-label={field.label}
				className="h-7 w-28 px-2 text-right text-sm font-bold text-primary tabular-nums"
			/>
		</span>
	);
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

	// FIX-16: sliders interligados pela relação de consórcio (plan-estimate).
	// Arrastou parcela/prazo → o bem se ajusta; arrastou o bem → a parcela.
	// Papéis não identificáveis no payload → null = comportamento solto.
	const linkRoles = useMemo(() => identifyLinkRoles(payload.fields), [payload.fields]);

	const handleChange = useCallback(
		(field: ValuePickerField, raw: number | readonly number[]) => {
			const v = Array.isArray(raw) ? raw[0] : raw;
			setValues((prev) => {
				const next = { ...prev, [field.id]: v };
				if (!linkRoles) return next;
				return recalcLinkedValues({
					fields: payload.fields,
					roles: linkRoles,
					category: payload.category,
					values: next,
					changedId: field.id,
				});
			});
		},
		[linkRoles, payload.fields, payload.category],
	);

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
			<Card className="w-full max-w-[340px] rounded-[18px] shadow-lg border-[#bcd3ff] overflow-hidden">
				<CardContent className="space-y-4 p-[18px]">
					{/* Compact sliders */}
					{payload.fields.map((field) => (
						<div key={field.id} className="space-y-2">
							<div className="flex items-baseline justify-between gap-2.5">
								<span className="text-xs font-medium text-muted-foreground min-w-0">
									{field.label}
								</span>
								{/* FIX-55: campos de dinheiro ganham input livre (valor exato);
								    os demais (prazo etc.) seguem com o display animado. */}
								{field.format === "currency" ? (
									<CurrencyInput
										field={field}
										value={values[field.id]}
										disabled={submitted}
										onCommit={(v) => handleChange(field, v)}
									/>
								) : (
									<motion.span
										key={values[field.id]}
										initial={{ scale: 1.08 }}
										animate={{ scale: 1 }}
										transition={{ type: "spring", stiffness: 400, damping: 20 }}
										className="aja-num text-sm font-bold text-primary shrink-0"
									>
										{formatValue(values[field.id], field.format)}
									</motion.span>
								)}
							</div>
							<Slider
								value={[values[field.id]]}
								min={field.min}
								max={field.max}
								step={field.step}
								onValueChange={(val) => {
									if (!submitted) handleChange(field, val);
								}}
								disabled={submitted}
							/>
						</div>
					))}

					{/* FIX-16: valores derivados de premissas típicas de mercado — nunca
					    apresentar como dado de administradora (mesma regra do FIX-3) */}
					{linkRoles && (
						<span className="inline-flex items-center gap-1.5 self-center text-[10px] text-muted-foreground bg-[var(--cream-100)] rounded-full px-2.5 py-1 leading-tight">
							Estimativa de mercado — os valores reais vêm das administradoras
						</span>
					)}

					{/* Submit */}
					<Button
						onClick={handleSubmit}
						disabled={submitted || isStreaming}
						size="sm"
						className="w-full gap-1.5 rounded-[13px] min-h-[44px]"
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
