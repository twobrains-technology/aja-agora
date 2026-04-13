/**
 * Format AI responses and artifacts for WhatsApp.
 * Converts Markdown to WhatsApp text formatting and maps
 * artifacts to WhatsApp interactive message payloads.
 */

/** Convert basic Markdown to WhatsApp formatting */
export function formatTextForWhatsApp(text: string): string {
	return text
		// Headers → bold
		.replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
		// Bold **text** stays as *text*
		.replace(/\*\*(.+?)\*\*/g, "*$1*")
		// Remove code blocks (triple backtick)
		.replace(/```[\s\S]*?```/g, (match) => {
			const code = match.replace(/```\w*\n?/g, "").trim();
			return `\`\`\`${code}\`\`\``;
		})
		// Remove block quotes
		.replace(/^>\s+/gm, "")
		// Clean up excess newlines
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

/** Split long text into chunks respecting WhatsApp's 4096 char limit */
export function splitMessage(text: string, maxLen = 4096): string[] {
	if (text.length <= maxLen) return [text];

	const chunks: string[] = [];
	let remaining = text;

	while (remaining.length > maxLen) {
		// Try to split at paragraph boundary
		let splitAt = remaining.lastIndexOf("\n\n", maxLen);
		if (splitAt < maxLen / 2) {
			// Try sentence boundary
			splitAt = remaining.lastIndexOf(". ", maxLen);
		}
		if (splitAt < maxLen / 2) {
			// Hard split
			splitAt = maxLen;
		}
		chunks.push(remaining.slice(0, splitAt).trim());
		remaining = remaining.slice(splitAt).trim();
	}

	if (remaining) chunks.push(remaining);
	return chunks;
}

/** Format currency value in BRL */
function formatBRL(value: number): string {
	if (value >= 1_000_000) {
		return `R$ ${(value / 1_000_000).toFixed(1).replace(".", ",")}M`;
	}
	if (value >= 1_000) {
		return `R$ ${(value / 1_000).toFixed(0)}mil`;
	}
	return `R$ ${value.toFixed(0)}`;
}

// ---- Artifact → WhatsApp component mappers ----

export interface WhatsAppResponse {
	type: "text" | "interactive";
	text?: string;
	interactive?: Record<string, unknown>;
}

export function groupCardToWhatsApp(payload: Record<string, unknown>): WhatsAppResponse {
	const p = payload;
	const body = [
		`*${p.administradora}* — ${(p.category as string)?.replace("imovel", "Imóvel").replace("auto", "Auto").replace("servicos", "Serviços")}`,
		`💰 Crédito: ${formatBRL(p.creditValue as number)}`,
		`📅 Parcela: ${formatBRL(p.monthlyPayment as number)}/mês`,
		`📊 Taxa admin: ${(p.adminFeePercent as number).toFixed(1)}%`,
		`⏱ Prazo: ${p.termMonths} meses`,
		`🎯 Contemplação: ${(p.contemplationRate as number).toFixed(1)}%/assembleia`,
	].join("\n");

	return {
		type: "interactive",
		interactive: {
			type: "button",
			body: { text: body },
			action: {
				buttons: [
					{ type: "reply", reply: { id: `detail_${p.id}`, title: "Ver detalhes" } },
					{ type: "reply", reply: { id: `simulate_${p.id}`, title: "Simular" } },
				],
			},
		},
	};
}

export function comparisonTableToWhatsApp(payload: Record<string, unknown>): WhatsAppResponse {
	const groups = payload.groups as Array<Record<string, unknown>>;
	const body = `*Comparativo — ${groups.length} opções encontradas*\nSelecione uma para ver detalhes:`;

	const rows = groups.map((g, i) => ({
		id: `group_${g.id}`,
		title: `${g.administradora}`.slice(0, 24),
		description: `${formatBRL(g.creditValue as number)} • ${formatBRL(g.monthlyPayment as number)}/mês • ${g.termMonths}m`.slice(0, 72),
	}));

	return {
		type: "interactive",
		interactive: {
			type: "list",
			body: { text: body },
			action: {
				button: "Ver opções",
				sections: [{ title: "Grupos disponíveis", rows }],
			},
		},
	};
}

export function simulationResultToWhatsApp(payload: Record<string, unknown>): WhatsAppResponse {
	const p = payload;
	const text = [
		"*📊 Simulação de Cota*",
		"",
		`💰 Crédito: ${formatBRL(p.creditValue as number)}`,
		`📅 Parcela: ${formatBRL(p.monthlyPayment as number)}/mês`,
		`📋 Taxa admin: ${formatBRL(p.adminFee as number)}`,
		`🛡 Fundo reserva: ${formatBRL(p.reserveFund as number)}`,
		`🔒 Seguro: ${formatBRL(p.insurance as number)}`,
		`💵 Custo total: ${formatBRL(p.totalCost as number)}`,
		`⏱ Prazo: ${p.termMonths} meses`,
		`📈 Taxa efetiva: ${(p.effectiveRate as number).toFixed(2)}%`,
	].join("\n");

	return { type: "text", text };
}

export function recommendationToWhatsApp(payload: Record<string, unknown>): WhatsAppResponse {
	const p = payload;
	const score = Math.round((p.score as number) * 100);
	const body = [
		`*⭐ Recomendação — ${score}% compatível*`,
		"",
		`*${p.administradora}* — ${(p.category as string)?.replace("imovel", "Imóvel").replace("auto", "Auto").replace("servicos", "Serviços")}`,
		`💰 ${formatBRL(p.creditValue as number)} • ${formatBRL(p.monthlyPayment as number)}/mês`,
		`📊 ${(p.adminFeePercent as number).toFixed(1)}% admin • ${p.termMonths} meses`,
		`🎯 ${(p.contemplationRate as number).toFixed(1)}% contemplação`,
	].join("\n");

	return {
		type: "interactive",
		interactive: {
			type: "button",
			body: { text: body },
			action: {
				buttons: [
					{ type: "reply", reply: { id: `interest_${p.id}`, title: "Tenho interesse!" } },
					{ type: "reply", reply: { id: `simulate_${p.id}`, title: "Simular valores" } },
				],
			},
		},
	};
}

export function leadFormToWhatsApp(): WhatsAppResponse {
	return {
		type: "text",
		text: "Ótimo! Para reservar essa opção, preciso de alguns dados.\n\n*Qual seu nome completo?*",
	};
}

export function valuePickerToWhatsApp(payload: Record<string, unknown>): WhatsAppResponse {
	const fields = payload.fields as Array<Record<string, unknown>>;
	const category = payload.category as string;

	// Build preset buttons from the first field's range
	const field = fields[0];
	if (!field) {
		return { type: "text", text: "Me diga os valores que você procura:" };
	}

	const min = field.min as number;
	const max = field.max as number;
	const mid = Math.round((min + max) / 2);

	const presets = [
		{ id: `picker_${field.id}_${min}`, title: formatBRL(min) },
		{ id: `picker_${field.id}_${mid}`, title: formatBRL(mid) },
		{ id: `picker_${field.id}_${max}`, title: formatBRL(max) },
	];

	const label = (field.label as string) || "Valor";
	const body = `*${label}*\nEscolha uma faixa ou me diga o valor exato:`;

	return {
		type: "interactive",
		interactive: {
			type: "button",
			body: { text: body },
			action: {
				buttons: presets.map((p) => ({
					type: "reply",
					reply: { id: p.id, title: p.title.slice(0, 20) },
				})),
			},
		},
	};
}

/** Map artifact type to WhatsApp response */
export function artifactToWhatsApp(
	type: string,
	payload: Record<string, unknown>,
): WhatsAppResponse | null {
	switch (type) {
		case "group_card":
			return groupCardToWhatsApp(payload);
		case "comparison_table":
			return comparisonTableToWhatsApp(payload);
		case "simulation_result":
			return simulationResultToWhatsApp(payload);
		case "recommendation_card":
			return recommendationToWhatsApp(payload);
		case "lead_form":
			return leadFormToWhatsApp();
		case "value_picker":
			return valuePickerToWhatsApp(payload);
		default:
			return null;
	}
}
