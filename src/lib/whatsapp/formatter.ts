export function formatTextForWhatsApp(text: string): string {
	return (
		text
			// Strip leaked system instructions ("[sistema: ...]" / "[contexto: ...]")
			// that the AI sometimes echoes from conversation history.
			.replace(/^\s*\[(?:sistema|contexto|fluxo|FLUXO[^\]]*?):[^\]]*\]\s*/gim, "")
			.replace(/\n\s*\[(?:sistema|contexto|fluxo|FLUXO[^\]]*?):[^\]]*\]\s*/gim, "\n")
			// Strip hallucinated reproductions of the profile summary template.
			.replace(/\*?Show!\s*Já\s*tenho\s*seu\s*perfil\s*pronto[\s\S]*$/i, "")
			// Markdown headings → WhatsApp bold.
			.replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
			.replace(/\*\*(.+?)\*\*/g, "*$1*")
			// Drop blockquote markers.
			.replace(/^>\s+/gm, "")
			// Add missing space in "frase.Outra" → "frase. Outra".
			.replace(/([.!?])([A-ZÀ-ÝÁÉÍÓÚÂÊÔÇÃÕ])/g, "$1 $2")
			// "frase:Outra" → "frase: Outra" (only when stuck without space).
			.replace(/(:)([A-ZÀ-ÝÁÉÍÓÚÂÊÔÇÃÕ])/g, "$1 $2")
			// Code blocks (preserva).
			.replace(/```[\s\S]*?```/g, (match) => {
				const code = match.replace(/```\w*\n?/g, "").trim();
				return `\`\`\`${code}\`\`\``;
			})
			// Compactar 3+ quebras em 2 (paragrafo).
			.replace(/\n{3,}/g, "\n\n")
			.trim()
	);
}

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

/** Compact form for the profile checklist: 100000 → "R$ 100 mil". */
function formatBRLCompact(value: number): string {
	if (value >= 1_000_000) {
		const millions = (value / 1_000_000)
			.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
			.replace(",0", "");
		return `R$ ${millions}M`;
	}
	if (value >= 1_000) {
		return `R$ ${Math.round(value / 1_000)} mil`;
	}
	return `R$ ${value}`;
}

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
		description:
			`${formatBRL(g.creditValue as number)} • ${formatBRL(g.monthlyPayment as number)}/mês • ${g.termMonths}m`.slice(
				0,
				72,
			),
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

const RANGES: Record<
	string,
	Array<{
		id: string;
		title: string;
		desc: string;
		creditMin: number;
		creditMax: number;
		budget: number;
	}>
> = {
	auto: [
		{
			id: "range_auto_50",
			title: "Até R$ 50 mil",
			desc: "Parcela ~R$ 600/mês • Seminovos",
			creditMin: 0,
			creditMax: 50000,
			budget: 600,
		},
		{
			id: "range_auto_80",
			title: "R$ 50 mil - R$ 80 mil",
			desc: "Parcela ~R$ 900/mês • Populares",
			creditMin: 50000,
			creditMax: 80000,
			budget: 900,
		},
		{
			id: "range_auto_120",
			title: "R$ 80 mil - R$ 120 mil",
			desc: "Parcela ~R$ 1.300/mês • Sedãs",
			creditMin: 80000,
			creditMax: 120000,
			budget: 1300,
		},
		{
			id: "range_auto_180",
			title: "R$ 120 mil - R$ 180 mil",
			desc: "Parcela ~R$ 2.000/mês • SUVs",
			creditMin: 120000,
			creditMax: 180000,
			budget: 2000,
		},
		{
			id: "range_auto_300",
			title: "Acima de R$ 180 mil",
			desc: "Parcela ~R$ 3.500/mês • Premium",
			creditMin: 180000,
			creditMax: 300000,
			budget: 3500,
		},
	],
	imovel: [
		{
			id: "range_imovel_200",
			title: "Até R$ 200 mil",
			desc: "Parcela ~R$ 2.000/mês • Aptos compactos",
			creditMin: 0,
			creditMax: 200000,
			budget: 2000,
		},
		{
			id: "range_imovel_400",
			title: "R$ 200 mil - R$ 400 mil",
			desc: "Parcela ~R$ 3.500/mês • Aptos 2-3 quartos",
			creditMin: 200000,
			creditMax: 400000,
			budget: 3500,
		},
		{
			id: "range_imovel_600",
			title: "R$ 400 mil - R$ 600 mil",
			desc: "Parcela ~R$ 5.000/mês • Casas",
			creditMin: 400000,
			creditMax: 600000,
			budget: 5000,
		},
		{
			id: "range_imovel_1000",
			title: "R$ 600 mil - R$ 1 milhão",
			desc: "Parcela ~R$ 8.000/mês • Alto padrão",
			creditMin: 600000,
			creditMax: 1000000,
			budget: 8000,
		},
		{
			id: "range_imovel_2000",
			title: "Acima de R$ 1 milhão",
			desc: "Parcela ~R$ 15.000/mês • Luxo",
			creditMin: 1000000,
			creditMax: 2000000,
			budget: 15000,
		},
	],
	servicos: [
		{
			id: "range_serv_30",
			title: "Até R$ 30 mil",
			desc: "Parcela ~R$ 400/mês • Reformas simples",
			creditMin: 0,
			creditMax: 30000,
			budget: 400,
		},
		{
			id: "range_serv_60",
			title: "R$ 30 mil - R$ 60 mil",
			desc: "Parcela ~R$ 700/mês • Reformas médias",
			creditMin: 30000,
			creditMax: 60000,
			budget: 700,
		},
		{
			id: "range_serv_100",
			title: "R$ 60 mil - R$ 100 mil",
			desc: "Parcela ~R$ 1.100/mês • Reformas completas",
			creditMin: 60000,
			creditMax: 100000,
			budget: 1100,
		},
		{
			id: "range_serv_200",
			title: "R$ 100 mil - R$ 200 mil",
			desc: "Parcela ~R$ 2.000/mês • Grandes projetos",
			creditMin: 100000,
			creditMax: 200000,
			budget: 2000,
		},
		{
			id: "range_serv_500",
			title: "Acima de R$ 200 mil",
			desc: "Parcela ~R$ 4.000/mês • Investimentos",
			creditMin: 200000,
			creditMax: 500000,
			budget: 4000,
		},
	],
};

export function resolveRange(
	rangeId: string,
): { creditMin: number; creditMax: number; budget: number; category: string } | null {
	for (const [cat, ranges] of Object.entries(RANGES)) {
		const found = ranges.find((r) => r.id === rangeId);
		if (found)
			return {
				creditMin: found.creditMin,
				creditMax: found.creditMax,
				budget: found.budget,
				category: cat,
			};
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
				sections: [
					{
						title: `Faixas — ${categoryLabel[category] ?? "Consórcio"}`,
						rows: ranges.map((r) => ({
							id: r.id,
							title: r.title.slice(0, 24),
							description: r.desc.slice(0, 72),
						})),
					},
				],
			},
		},
	};
}

// Bridge message shown right before the specialist takes over. Hardcoded
// (system voice, not persona's) — purpose é UX: tell the user they're being
// connected so the persona-voice change doesn't feel abrupt. Quente mas curto.
export function transitionBridgeText(specialist: { name: string; categoryLabel: string }): string {
	return `Boa! Te conectando com a ${specialist.name}, nossa especialista em ${specialist.categoryLabel}.\nUm momento ⏳`;
}

type CreditRange = { token: string; title: string; desc?: string; min: number; max: number };

const CREDIT_RANGES: Record<"imovel" | "auto" | "servicos", CreditRange[]> = {
	imovel: [
		{ token: "200", title: "Até R$ 200 mil", desc: "Aptos compactos", min: 0, max: 200000 },
		{
			token: "400",
			title: "R$ 200 a 400 mil",
			desc: "Aptos 2-3 quartos",
			min: 200000,
			max: 400000,
		},
		{
			token: "600",
			title: "R$ 400 a 600 mil",
			desc: "Casas, aptos maiores",
			min: 400000,
			max: 600000,
		},
		{
			token: "1000",
			title: "Acima de R$ 600 mil",
			desc: "Alto padrão, luxo",
			min: 600000,
			max: 2000000,
		},
	],
	auto: [
		{ token: "50", title: "Até R$ 50 mil", desc: "Seminovos, populares", min: 0, max: 50000 },
		{ token: "100", title: "R$ 50 a 100 mil", desc: "Populares, sedãs", min: 50000, max: 100000 },
		{ token: "200", title: "R$ 100 a 200 mil", desc: "SUVs, premium", min: 100000, max: 200000 },
		{ token: "300", title: "Acima de R$ 200 mil", desc: "Top de linha", min: 200000, max: 300000 },
	],
	servicos: [
		{ token: "30", title: "Até R$ 30 mil", desc: "Reformas simples, viagens", min: 0, max: 30000 },
		{
			token: "100",
			title: "R$ 30 a 100 mil",
			desc: "Reformas médias, formaturas",
			min: 30000,
			max: 100000,
		},
		{
			token: "500",
			title: "Acima de R$ 100 mil",
			desc: "Grandes projetos",
			min: 100000,
			max: 500000,
		},
	],
};

const TIMEFRAMES: Array<{ token: string; title: string; desc: string; prazoMeses: number }> = [
	{ token: "ja", title: "Já! (com lance)", desc: "Quero contemplação rápida", prazoMeses: 0 },
	{ token: "24", title: "1 a 2 anos", desc: "Prazo curto", prazoMeses: 24 },
	{ token: "60", title: "3 a 5 anos", desc: "Prazo médio", prazoMeses: 60 },
	{ token: "120", title: "Sem pressa", desc: "Parcela mais leve", prazoMeses: 120 },
];

export function creditRangeQuestionToWhatsApp(
	category: "imovel" | "auto" | "servicos",
	prefix?: string,
): WhatsAppResponse {
	const ranges = CREDIT_RANGES[category];
	const text = prefix
		? `${prefix}\n\nQual faixa de crédito faz mais sentido pra você?`
		: "Qual faixa de crédito faz mais sentido pra você?";
	return {
		type: "interactive",
		interactive: {
			type: "list",
			body: { text },
			action: {
				button: "Escolher faixa",
				sections: [
					{
						title: "Faixas de crédito",
						rows: ranges.map((r) => ({
							id: `credit_${category}_${r.token}`,
							title: r.title.slice(0, 24),
							description: (r.desc ?? "").slice(0, 72),
						})),
					},
				],
			},
		},
	};
}

const TIMEFRAME_QUESTIONS: Record<"imovel" | "auto" | "servicos", string> = {
	imovel: "Em quanto tempo você quer estar com o seu imóvel?",
	auto: "Em quanto tempo você quer estar com o carro novo?",
	servicos: "Em quanto tempo você quer realizar isso?",
};

export function timeframeQuestionToWhatsApp(
	category: "imovel" | "auto" | "servicos",
	prefix?: string,
): WhatsAppResponse {
	const question = TIMEFRAME_QUESTIONS[category];
	const text = prefix ? `${prefix}\n\n${question}` : question;
	return {
		type: "interactive",
		interactive: {
			type: "list",
			body: { text },
			action: {
				button: "Escolher prazo",
				sections: [
					{
						title: "Prazo desejado",
						rows: TIMEFRAMES.map((t) => ({
							id: `timeframe_${t.token}`,
							title: t.title.slice(0, 24),
							description: t.desc.slice(0, 72),
						})),
					},
				],
			},
		},
	};
}

export function resolveCreditReply(replyId: string): {
	category: "imovel" | "auto" | "servicos";
	min: number;
	max: number;
	title: string;
} | null {
	if (!replyId.startsWith("credit_")) return null;
	const parts = replyId.split("_");
	if (parts.length < 3) return null;
	const category = parts[1] as "imovel" | "auto" | "servicos";
	const token = parts[2];
	const ranges = CREDIT_RANGES[category];
	if (!ranges) return null;
	const range = ranges.find((r) => r.token === token);
	if (!range) return null;
	return { category, min: range.min, max: range.max, title: range.title };
}

export function resolveTimeframeReply(replyId: string): {
	prazoMeses: number;
	title: string;
} | null {
	if (!replyId.startsWith("timeframe_")) return null;
	const token = replyId.replace("timeframe_", "");
	const t = TIMEFRAMES.find((x) => x.token === token);
	if (!t) return null;
	return { prazoMeses: t.prazoMeses, title: t.title };
}

export function qualifyConsentToWhatsApp(prefix?: string): WhatsAppResponse {
	const text = prefix
		? `${prefix}\n\nPosso te fazer 3 perguntinhas rápidas pra entender seu perfil?`
		: "Posso te fazer 3 perguntinhas rápidas pra entender seu perfil?";
	return {
		type: "interactive",
		interactive: {
			type: "button",
			body: { text },
			action: {
				buttons: [
					{ type: "reply", reply: { id: "qualify_start_yes", title: "Bora!" } },
					{ type: "reply", reply: { id: "qualify_start_more", title: "Entender mais antes" } },
				],
			},
		},
	};
}

export function handoffConfirmationToWhatsApp(): WhatsAppResponse {
	return {
		type: "interactive",
		interactive: {
			type: "button",
			body: {
				text: "Pra esse caso especificamente, recomendo conversar direto com nosso consultor humano. Quer que eu te conecte?",
			},
			action: {
				buttons: [
					{ type: "reply", reply: { id: "handoff_confirm", title: "Sim, conectar" } },
					{ type: "reply", reply: { id: "handoff_decline", title: "Continuar mesmo" } },
				],
			},
		},
	};
}

const LANCE_OPTIONS = [
	{ token: "yes", title: "Sim, tenho reserva" },
	{ token: "maybe", title: "Talvez, depende" },
	{ token: "no", title: "Por enquanto não" },
] as const;

type LanceValue = (typeof LANCE_OPTIONS)[number]["token"];

export function lanceQuestionToWhatsApp(prefix?: string): WhatsAppResponse {
	const text = prefix
		? `${prefix}\n\nVocê teria uma reserva pra dar um lance e antecipar a contemplação?`
		: "Você teria uma reserva pra dar um lance e antecipar a contemplação?";
	return {
		type: "interactive",
		interactive: {
			type: "button",
			body: { text },
			action: {
				buttons: LANCE_OPTIONS.map((o) => ({
					type: "reply",
					reply: { id: `lance_${o.token}`, title: o.title },
				})),
			},
		},
	};
}

export function resolveLanceReply(replyId: string): { value: LanceValue; title: string } | null {
	if (!replyId.startsWith("lance_")) return null;
	const token = replyId.replace("lance_", "");
	const opt = LANCE_OPTIONS.find((o) => o.token === token);
	if (!opt) return null;
	return { value: opt.token, title: opt.title };
}

function prazoLabel(months: number): string {
	if (months === 0) return "imediato (com lance)";
	if (months <= 24) return "1 a 2 anos";
	if (months <= 60) return "3 a 5 anos";
	return "sem pressa";
}

function lanceLabel(value: LanceValue): string {
	if (value === "yes") return "tem reserva";
	if (value === "maybe") return "depende do valor";
	return "sem reserva por enquanto";
}

export function profileSummaryText(answers: {
	creditMin?: number;
	creditMax?: number;
	prazoMeses?: number;
	hasLance?: LanceValue;
}): string {
	const lines: string[] = ["*Show! Já tenho seu perfil pronto:*", ""];

	if (answers.creditMax !== undefined) {
		const credit =
			answers.creditMin && answers.creditMin > 0
				? `${formatBRLCompact(answers.creditMin)} a ${formatBRLCompact(answers.creditMax)}`
				: `até ${formatBRLCompact(answers.creditMax)}`;
		lines.push(`✅ Crédito: ${credit}`);
	}
	if (answers.prazoMeses !== undefined) {
		lines.push(`✅ Prazo: ${prazoLabel(answers.prazoMeses)}`);
	}
	if (answers.hasLance) {
		lines.push(`✅ Lance: ${lanceLabel(answers.hasLance)}`);
	}

	lines.push("", "Vou puxar as melhores opções pra você.");
	return lines.join("\n");
}

export function experienceQuestionToWhatsApp(prefix?: string): WhatsAppResponse {
	const text = prefix
		? `${prefix}\n\nAntes de qualquer coisa, você já fez consórcio antes?`
		: "Antes de qualquer coisa: você já fez consórcio antes?";
	return {
		type: "interactive",
		interactive: {
			type: "button",
			body: { text },
			action: {
				buttons: [
					{ type: "reply", reply: { id: "experience_first", title: "🌱 É a primeira vez" } },
					{ type: "reply", reply: { id: "experience_returning", title: "✅ Já conheço" } },
					{ type: "reply", reply: { id: "experience_doubts", title: "🤔 Tenho dúvidas" } },
				],
			},
		},
	};
}

export function welcomeButtonsToWhatsApp(): WhatsAppResponse {
	return {
		type: "interactive",
		interactive: {
			type: "button",
			body: {
				text: "Escolhe abaixo ou digita livremente.",
			},
			action: {
				buttons: [
					{ type: "reply", reply: { id: "category_imovel", title: "🏠 Imóvel" } },
					{ type: "reply", reply: { id: "category_auto", title: "🚗 Automóvel" } },
					{ type: "reply", reply: { id: "category_servicos", title: "💼 Outros" } },
				],
			},
		},
	};
}

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
