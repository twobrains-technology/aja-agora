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

	// FIX-3: gate credit virou o componente "Planeje sua conquista".
	if (payload.kind === "plan") {
		return <PlanEstimatePicker payload={payload} active={active} />;
	}

	if (payload.kind === "identity") {
		return <GateIdentityForm prefilledPhone={payload.prefilledPhone} active={active} />;
	}

	// FIX-107: gate "slider" legado → AGULHA SIMPLES de valor do bem (1k em 1k). Sem
	// `onSubmit`, a agulha manda o valor como TEXTO no chat (valor por conversa), sem
	// estimar parcela. TODO(bloco-jornada-entrada): este gate deixa de ser emitido na
	// entrada (o agente coleta o valor por conversa, FIX-104); quando o contrato de
	// `credit` estabilizar sem `monthlyBudget`/prazo, ajustar o submit aqui.
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
