"use client";

import { ArrowRight, Check } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { useChatContext } from "@/lib/chat/provider";
import type { ValuePickerField, ValuePickerPayload } from "@/lib/chat/types";

export type { ValuePickerField, ValuePickerPayload };

// FIX-107 (revisão da jornada de entrada, 2026-06-28): a web trocou o value_picker
// COMPLEXO (3 sliders interligados valor/parcela/prazo — FIX-16, com recálculo via
// engine value-picker-link) por uma AGULHA SIMPLES só do VALOR DO BEM, de R$ 1.000
// em R$ 1.000. Decisão do Kairo: o valor é coletado por conversa; a parcela vem das
// ofertas REAIS da Bevi (não é mais estimada/derivada na entrada) e o prazo saiu da
// entrada. Este slider é só o apoio visual pro "quanto custa o que você quer".
//
// TODO(bloco-jornada-entrada): o agente para de emitir present_value_picker na
// entrada (valor por conversa, FIX-104). Quando o shape final do que o backend
// emitir estabilizar, alinhar o id/label do campo de valor lido aqui.

/** Passo da agulha: R$ 1.000 (regra de produto — "1k em 1k", FIX-107). */
export const VALUE_STEP = 1000;

/** Escolhe o campo do VALOR DO BEM: o primeiro campo em reais (a entrada não tem
 * mais parcela/prazo). Fallback no primeiro campo do payload. */
function pickAssetField(fields: ValuePickerField[]): ValuePickerField {
	return fields.find((field) => field.format === "currency") ?? fields[0];
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
	const field = pickAssetField(payload.fields);

	const [value, setValue] = useState(field.default);
	const [submitted, setSubmitted] = useState(false);

	const clamp = (v: number) => Math.min(field.max, Math.max(field.min, v));

	// FIX-55: input numérico livre ao lado da agulha — o usuário digita o valor
	// exato (R$ 347.500) sem snap ao step de R$ 1.000. Estado de texto próprio
	// (digitação livre), commit (parse + clamp à faixa) no blur/Enter.
	const [text, setText] = useState(() => field.default.toLocaleString("pt-BR"));
	useEffect(() => {
		setText(value.toLocaleString("pt-BR"));
	}, [value]);

	const commitText = () => {
		const digits = text.replace(/\D/g, "");
		const parsed = digits ? Number.parseInt(digits, 10) : field.min;
		setValue(clamp(parsed));
	};

	const handleSubmit = () => {
		setSubmitted(true);
		if (onSubmit) {
			onSubmit({ [field.id]: value });
			return;
		}
		void sendUserMessage(`${field.label}: R$ ${value.toLocaleString("pt-BR")}`);
	};

	if (submitted || !active) return null;

	return (
		<motion.div
			initial={{ opacity: 0, y: 6 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ type: "spring", stiffness: 300, damping: 25 }}
		>
			<Card className="w-full max-w-[340px] rounded-[18px] shadow-lg border-[#bcd3ff] overflow-hidden">
				<CardContent className="space-y-4 p-[18px]">
					<div className="space-y-2">
						<div className="flex items-baseline justify-between gap-2.5">
							<span className="text-xs font-medium text-muted-foreground min-w-0">
								{field.label}
							</span>
							<span className="flex shrink-0 items-center gap-1 text-primary">
								<span className="text-xs font-medium">R$</span>
								<Input
									value={text}
									inputMode="numeric"
									disabled={submitted}
									onChange={(e) => setText(e.target.value)}
									onBlur={commitText}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											commitText();
										}
									}}
									data-testid={`value-input-${field.id}`}
									aria-label={field.label}
									className="h-7 w-28 px-2 text-right text-sm font-bold text-primary tabular-nums"
								/>
							</span>
						</div>
						<Slider
							value={[value]}
							min={field.min}
							max={field.max}
							step={VALUE_STEP}
							onValueChange={(val) => {
								if (!submitted) setValue(clamp(Array.isArray(val) ? val[0] : val));
							}}
							disabled={submitted}
						/>
					</div>

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
