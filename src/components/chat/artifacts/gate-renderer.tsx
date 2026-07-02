"use client";

import type { GatePartData, SliderField } from "@/lib/chat/ui-message";
import { GateIdentityForm } from "./gate-identity-form";
import { GateQuickReply } from "./gate-quick-reply";
import { NamePrompt } from "./name-prompt";
import { PlanEstimatePicker } from "./plan-estimate-picker";
import { ValuePicker, type ValuePickerField } from "./value-picker";

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
	// FIX-17: gate do nome em card focado (passo 1).
	if (payload.kind === "name") {
		return <NamePrompt active={active} />;
	}

	if (payload.kind === "chips") {
		return <GateQuickReply payload={payload} active={active} />;
	}

	// FIX-3: componente "Planeje sua conquista" (por intenção). Aposentado pela
	// jornada canônica (FIX-104) e não é mais emitido no gate credit (FIX-115) — o
	// branch fica pra compat de mensagens antigas hidratadas com kind "plan".
	if (payload.kind === "plan") {
		return <PlanEstimatePicker payload={payload} active={active} />;
	}

	if (payload.kind === "identity") {
		return <GateIdentityForm prefilledPhone={payload.prefilledPhone} active={active} />;
	}

	// FIX-115: gate credit = AGULHA SIMPLES do valor do bem (kind "slider", 1k em 1k).
	// Sem `onSubmit`, a agulha manda o valor como TEXTO no chat (valor por conversa,
	// FIX-104); o backstop `parseAssetValue` garante o avanço do funil. Prazo/parcela
	// saíram da entrada (FIX-103/104), então a agulha carrega só o campo de valor.
	return (
		<ValuePicker
			payload={{
				category: payload.category ?? "auto",
				fields: payload.fields.map(fieldToValuePickerField),
			}}
			active={active}
		/>
	);
}
