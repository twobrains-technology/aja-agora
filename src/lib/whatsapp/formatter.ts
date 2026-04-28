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

/** Format currency value in BRL — precise Brazilian formatting with M abbreviation only for >=1M */
function formatBRL(value: number): string {
	if (value >= 1_000_000) {
		const millions = (value / 1_000_000).toLocaleString("pt-BR", {
			minimumFractionDigits: 1,
			maximumFractionDigits: 1,
		});
		return `R$ ${millions}M`;
	}
	return `R$ ${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
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
					{ type: "reply", reply: { id: `interest_${p.id}`, title: "Tenho interesse!" } },
					{ type: "reply", reply: { id: `simulate_${p.id}`, title: "Simular" } },
					{ type: "reply", reply: { id: `detail_${p.id}`, title: "Ver detalhes" } },
				],
			},
		},
	};
}

export function comparisonTableToWhatsApp(payload: Record<string, unknown>): WhatsAppResponse {
	const allGroups = payload.groups as Array<Record<string, unknown>>;
	// WhatsApp interactive list limit: 10 rows per section.
	const groups = allGroups.slice(0, 10);
	const totalLabel =
		allGroups.length > groups.length
			? `${groups.length} de ${allGroups.length} opções`
			: `${groups.length} opções encontradas`;
	const body = `*Comparativo — ${totalLabel}*\nSelecione uma para ver detalhes:`;

	const rows = groups.map((g) => ({
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
	const groupId = p.groupId as string;
	const body = [
		"*📋 Simulação de Cota*",
		"",
		`💰 *Crédito:* ${formatBRL(p.creditValue as number)}`,
		`📅 *Parcela:* ${formatBRL(p.monthlyPayment as number)}/mês`,
		`📊 *Taxa admin:* ${formatBRL(p.adminFee as number)}`,
		`🛡 *Fundo reserva:* ${formatBRL(p.reserveFund as number)}`,
		`🔒 *Seguro:* ${formatBRL(p.insurance as number)}`,
		`💵 *Custo total:* ${formatBRL(p.totalCost as number)}`,
		`⏱ *Prazo:* ${p.termMonths} meses`,
		`📈 *Taxa efetiva:* ${(p.effectiveRate as number).toFixed(2)}%`,
	].join("\n");

	return {
		type: "interactive",
		interactive: {
			type: "button",
			body: { text: body },
			action: {
				buttons: [
					{ type: "reply", reply: { id: `interest_${groupId}`, title: "Tenho interesse!" } },
					{ type: "reply", reply: { id: `whatif_${groupId}`, title: "Ajustar valor" } },
				],
			},
		},
	};
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

/** Pre-defined ranges by category — realistic market values */
const RANGES: Record<string, Array<{ id: string; title: string; desc: string; creditMin: number; creditMax: number; budget: number }>> = {
	auto: [
		{ id: "range_auto_50", title: "Até R$ 50 mil", desc: "Parcela ~R$ 600/mês • Seminovos", creditMin: 0, creditMax: 50000, budget: 600 },
		{ id: "range_auto_80", title: "R$ 50 mil - R$ 80 mil", desc: "Parcela ~R$ 900/mês • Populares", creditMin: 50000, creditMax: 80000, budget: 900 },
		{ id: "range_auto_120", title: "R$ 80 mil - R$ 120 mil", desc: "Parcela ~R$ 1.300/mês • Sedãs", creditMin: 80000, creditMax: 120000, budget: 1300 },
		{ id: "range_auto_180", title: "R$ 120 mil - R$ 180 mil", desc: "Parcela ~R$ 2.000/mês • SUVs", creditMin: 120000, creditMax: 180000, budget: 2000 },
		{ id: "range_auto_300", title: "Acima de R$ 180 mil", desc: "Parcela ~R$ 3.500/mês • Premium", creditMin: 180000, creditMax: 300000, budget: 3500 },
	],
	imovel: [
		{ id: "range_imovel_200", title: "Até R$ 200 mil", desc: "Parcela ~R$ 2.000/mês • Aptos compactos", creditMin: 0, creditMax: 200000, budget: 2000 },
		{ id: "range_imovel_400", title: "R$ 200 mil - R$ 400 mil", desc: "Parcela ~R$ 3.500/mês • Aptos 2-3 quartos", creditMin: 200000, creditMax: 400000, budget: 3500 },
		{ id: "range_imovel_600", title: "R$ 400 mil - R$ 600 mil", desc: "Parcela ~R$ 5.000/mês • Casas", creditMin: 400000, creditMax: 600000, budget: 5000 },
		{ id: "range_imovel_1000", title: "R$ 600 mil - R$ 1 milhão", desc: "Parcela ~R$ 8.000/mês • Alto padrão", creditMin: 600000, creditMax: 1000000, budget: 8000 },
		{ id: "range_imovel_2000", title: "Acima de R$ 1 milhão", desc: "Parcela ~R$ 15.000/mês • Luxo", creditMin: 1000000, creditMax: 2000000, budget: 15000 },
	],
	servicos: [
		{ id: "range_serv_30", title: "Até R$ 30 mil", desc: "Parcela ~R$ 400/mês • Reformas simples", creditMin: 0, creditMax: 30000, budget: 400 },
		{ id: "range_serv_60", title: "R$ 30 mil - R$ 60 mil", desc: "Parcela ~R$ 700/mês • Reformas médias", creditMin: 30000, creditMax: 60000, budget: 700 },
		{ id: "range_serv_100", title: "R$ 60 mil - R$ 100 mil", desc: "Parcela ~R$ 1.100/mês • Reformas completas", creditMin: 60000, creditMax: 100000, budget: 1100 },
		{ id: "range_serv_200", title: "R$ 100 mil - R$ 200 mil", desc: "Parcela ~R$ 2.000/mês • Grandes projetos", creditMin: 100000, creditMax: 200000, budget: 2000 },
		{ id: "range_serv_500", title: "Acima de R$ 200 mil", desc: "Parcela ~R$ 4.000/mês • Investimentos", creditMin: 200000, creditMax: 500000, budget: 4000 },
	],
};

/** Exported so processor can resolve range IDs to search params */
export function resolveRange(rangeId: string): { creditMin: number; creditMax: number; budget: number; category: string } | null {
	for (const [cat, ranges] of Object.entries(RANGES)) {
		const found = ranges.find((r) => r.id === rangeId);
		if (found) return { creditMin: found.creditMin, creditMax: found.creditMax, budget: found.budget, category: cat };
	}
	return null;
}

export function valuePickerToWhatsApp(payload: Record<string, unknown>): WhatsAppResponse {
	const category = payload.category as string;
	const ranges = RANGES[category] ?? RANGES.auto;

	const categoryLabel: Record<string, string> = {
		imovel: "Imóvel",
		auto: "Carro",
		servicos: "Serviço",
	};

	const body = `Escolha a faixa de valor do seu *${categoryLabel[category] ?? "bem"}*:`;

	return {
		type: "interactive",
		interactive: {
			type: "list",
			body: { text: body },
			action: {
				button: "Ver faixas de valor",
				sections: [{
					title: `Faixas — ${categoryLabel[category] ?? "Consórcio"}`,
					rows: ranges.map((r) => ({
						id: r.id,
						title: r.title.slice(0, 24),
						description: r.desc.slice(0, 72),
					})),
				}],
			},
		},
	};
}

/**
 * Transition message text shown right BEFORE a specialist takes over.
 * Two flavors:
 *  - From the concierge layer (system voice): "Já te conectando com o(a) Helena..."
 *  - Between specialists: "Tranquilo! Vou te passar pra Helena..."
 *
 * Receives only the human-readable name + emoji + categoryLabel from
 * PERSONA_CONFIG, so this stays decoupled from the personas module.
 */
export function transitionMessageText(
	specialist: { name: string; emoji: string; categoryLabel: string },
	fromConcierge: boolean,
): string {
	const { name, categoryLabel } = specialist;
	if (fromConcierge) {
		return `Boa! Já estamos te conectando com o(a) *${name}*, consultor(a) de ${categoryLabel}. \nUm instante ⏳`;
	}
	return `Tranquilo! Vou te passar pro(a) *${name}*, que cuida de ${categoryLabel}. \nUm momento ⏳`;
}

/**
 * Welcome buttons — anexados pelo sistema (camada de concierge) após a
 * mensagem de boas-vindas ou após responder uma dúvida geral.
 * WhatsApp limita a 3 botões; "carro" e "moto" caem juntos em Automóvel
 * (o especialista Rafael diferencia depois pela conversa).
 */
export function welcomeButtonsToWhatsApp(): WhatsAppResponse {
	return {
		type: "interactive",
		interactive: {
			type: "button",
			body: { text: "Atalho rápido por categoria:" },
			action: {
				buttons: [
					{ type: "reply", reply: { id: "category_imovel", title: "🏠 Imóvel" } },
					{ type: "reply", reply: { id: "category_auto", title: "🚗 Automóvel" } },
					{ type: "reply", reply: { id: "category_servicos", title: "💼 Serviços" } },
				],
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
