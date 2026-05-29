import { gateQuestion } from "@/lib/agent/orchestrator/gate-questions";

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
		`*${p.administradora}* — ${(p.category as string)?.replace("imovel", "Imóvel").replace("auto", "Auto").replace("moto", "Moto").replace("servicos", "Serviços")}`,
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
		`*${p.administradora}* — ${(p.category as string)?.replace("imovel", "Imóvel").replace("auto", "Auto").replace("moto", "Moto").replace("servicos", "Serviços")}`,
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
	moto: [
		{
			id: "range_moto_15",
			title: "Até R$ 15 mil",
			desc: "Parcela ~R$ 250/mês • Populares",
			creditMin: 0,
			creditMax: 15000,
			budget: 250,
		},
		{
			id: "range_moto_25",
			title: "R$ 15 mil - R$ 25 mil",
			desc: "Parcela ~R$ 400/mês • Trabalho",
			creditMin: 15000,
			creditMax: 25000,
			budget: 400,
		},
		{
			id: "range_moto_40",
			title: "R$ 25 mil - R$ 40 mil",
			desc: "Parcela ~R$ 650/mês • Médias",
			creditMin: 25000,
			creditMax: 40000,
			budget: 650,
		},
		{
			id: "range_moto_70",
			title: "R$ 40 mil - R$ 70 mil",
			desc: "Parcela ~R$ 1.100/mês • Esportivas",
			creditMin: 40000,
			creditMax: 70000,
			budget: 1100,
		},
		{
			id: "range_moto_120",
			title: "Acima de R$ 70 mil",
			desc: "Parcela ~R$ 1.800/mês • Premium",
			creditMin: 70000,
			creditMax: 120000,
			budget: 1800,
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
		moto: "Moto",
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

import {
	CREDIT_BUCKETS,
	LANCE_EMBUTIDO_OPTIONS,
	TIMEFRAME_OPTIONS as TIMEFRAMES,
} from "@/lib/agent/qualify-config";

const CREDIT_RANGES = CREDIT_BUCKETS;

export function creditRangeQuestionToWhatsApp(
	category: "imovel" | "auto" | "moto" | "servicos",
	prefix?: string,
): WhatsAppResponse {
	const ranges = CREDIT_RANGES[category];
	const question = gateQuestion("credit", category) ?? "";
	const text = prefix ? `${prefix}\n\n${question}` : question;
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

export function timeframeQuestionToWhatsApp(
	category: "imovel" | "auto" | "moto" | "servicos",
	prefix?: string,
): WhatsAppResponse {
	const question = gateQuestion("timeframe", category) ?? "";
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
	category: "imovel" | "auto" | "moto" | "servicos";
	min: number;
	max: number;
	title: string;
} | null {
	if (!replyId.startsWith("credit_")) return null;
	const parts = replyId.split("_");
	if (parts.length < 3) return null;
	const category = parts[1] as "imovel" | "auto" | "moto" | "servicos";
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
	const question = gateQuestion("consent") ?? "";
	const text = prefix ? `${prefix}\n\n${question}` : question;
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
	const question = gateQuestion("lance") ?? "";
	const text = prefix ? `${prefix}\n\n${question}` : question;
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

export function lanceEmbutidoQuestionToWhatsApp(prefix?: string): WhatsAppResponse {
	const question = gateQuestion("lance-embutido") ?? "";
	const text = prefix ? `${prefix}\n\n${question}` : question;
	return {
		type: "interactive",
		interactive: {
			type: "button",
			body: { text },
			action: {
				buttons: LANCE_EMBUTIDO_OPTIONS.map((o) => ({
					type: "reply",
					// Botões do WhatsApp limitam título a 20 chars — usa rótulo curto.
					reply: {
						id: `lanceembutido_${o.token}`,
						title: o.token === "yes" ? "Sim, considerar" : "Lance próprio",
					},
				})),
			},
		},
	};
}

export function resolveLanceEmbutidoReply(
	replyId: string,
): { value: "yes" | "no"; title: string } | null {
	if (!replyId.startsWith("lanceembutido_")) return null;
	const token = replyId.replace("lanceembutido_", "");
	const opt = LANCE_EMBUTIDO_OPTIONS.find((o) => o.token === token);
	if (!opt) return null;
	return { value: opt.token, title: opt.title };
}

function prazoLabel(months: number): string {
	if (months === 0) return "o mais rápido possível";
	if (months <= 6) return "até 6 meses";
	if (months <= 12) return "1 ano";
	if (months <= 24) return "2 anos ou mais";
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
	const question = gateQuestion("experience") ?? "";
	const text = prefix ? `${prefix}\n\n${question}` : question;
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
				// Bv2-01 / Bruna v1 #20: moto SUBSTITUI servicos nos chips
				// (3 chips, mesma decisão da landing). WhatsApp limita
				// interactive button a 3.
				buttons: [
					{ type: "reply", reply: { id: "category_imovel", title: "🏠 Imóvel" } },
					{ type: "reply", reply: { id: "category_auto", title: "🚗 Carro" } },
					{ type: "reply", reply: { id: "category_moto", title: "🏍 Moto" } },
				],
			},
		},
	};
}

/**
 * topic_picker — converte lista de chips clicáveis (2-5 tópicos do
 * schema topicPickerSchema) em interactive WhatsApp:
 *   - ≤3 tópicos → interactive type=button (limite Meta: 3 botões)
 *   - 4-5 tópicos → interactive type=list (sections)
 * IDs gerados por índice (topic_0..topic_4) já que tópicos são strings.
 */
export function topicPickerToWhatsApp(payload: Record<string, unknown>): WhatsAppResponse | null {
	const topics = payload.topics as string[] | undefined;
	if (!Array.isArray(topics) || topics.length === 0) return null;

	const prompt = (payload.prompt as string | undefined) ?? "Escolha uma opção:";
	const includeBackButton = (payload.includeBackButton as boolean | undefined) ?? false;

	// Total de slots: tópicos + (eventual "Voltar") devem caber em button (3) ou
	// list (10). Como schema limita topics a 2-5, sempre cabe em list.
	const wantsBackButton = includeBackButton;
	const totalButtons = topics.length + (wantsBackButton ? 1 : 0);

	if (totalButtons <= 3) {
		const buttons = topics.map((title, i) => ({
			type: "reply" as const,
			reply: { id: `topic_${i}`, title: String(title).slice(0, 20) },
		}));
		if (wantsBackButton) {
			buttons.push({ type: "reply", reply: { id: "topic_back", title: "Voltar" } });
		}
		return {
			type: "interactive",
			interactive: {
				type: "button",
				body: { text: prompt },
				action: { buttons },
			},
		};
	}

	const rows = topics.map((title, i) => ({
		id: `topic_${i}`,
		title: String(title).slice(0, 24),
	}));
	if (wantsBackButton) {
		rows.push({ id: "topic_back", title: "Voltar" });
	}
	return {
		type: "interactive",
		interactive: {
			type: "list",
			body: { text: prompt },
			action: {
				button: "Ver tópicos",
				sections: [{ title: "Tópicos", rows }],
			},
		},
	};
}

/**
 * scenarios — 3 cenários de contemplação (Conservador / Provável / Acelerado)
 * Shape vem de ScenariosPayload (src/lib/chat/types.ts): groupId, administradora,
 * creditValue, termMonths, scenarios.{conservador|provavel|acelerado}.
 * Cada ScenarioPayload tem: lancePercent, expectedTermMonths, strategy, disclaimer.
 * Vira texto formatado com hierarquia visual via emojis.
 */
export function scenariosToWhatsApp(payload: Record<string, unknown>): WhatsAppResponse | null {
	const scenarios = payload.scenarios as
		| {
				conservador?: Record<string, unknown>;
				provavel?: Record<string, unknown>;
				acelerado?: Record<string, unknown>;
		  }
		| undefined;
	if (!scenarios) return null;

	const administradora = (payload.administradora as string | undefined) ?? "";
	const creditValue = payload.creditValue as number | undefined;
	const header =
		administradora && creditValue !== undefined
			? `*3 cenários — ${administradora} • ${formatBRL(creditValue)}*`
			: "*3 cenários de contemplação*";

	const renderBlock = (
		emoji: string,
		label: string,
		s: Record<string, unknown> | undefined,
	): string | null => {
		if (!s) return null;
		const lancePercent = s.lancePercent as number | undefined;
		const months = s.expectedTermMonths as number | undefined;
		const strategy = (s.strategy as string | undefined) ?? "";
		const lanceLabel =
			typeof lancePercent === "number" && lancePercent > 0 ? `${lancePercent}% lance` : "sem lance";
		const monthsLabel = typeof months === "number" ? `${months}m` : "—";
		const head = `${emoji} *${label}* — ${lanceLabel}, contempla em ~${monthsLabel}`;
		return strategy ? `${head}\nEstratégia: ${strategy}` : head;
	};

	const blocks = [
		renderBlock("🟢", "Conservador", scenarios.conservador),
		renderBlock("🟡", "Provável", scenarios.provavel),
		renderBlock("🔴", "Acelerado", scenarios.acelerado),
	].filter((b): b is string => b !== null);

	// Mesmo com cenários parciais/vazios, retorna o header — drop silencioso
	// seria pior que texto mínimo (cliente cobrou exatamente esse bug).
	const disclaimer =
		(scenarios.conservador as Record<string, unknown> | undefined)?.disclaimer ??
		(scenarios.provavel as Record<string, unknown> | undefined)?.disclaimer ??
		(scenarios.acelerado as Record<string, unknown> | undefined)?.disclaimer ??
		"";

	const parts = [header, "", ...blocks];
	if (disclaimer) {
		parts.push("", `_${disclaimer}_`);
	}

	return { type: "text", text: parts.join("\n") };
}

/**
 * financing_comparison — comparativo consórcio × financiamento.
 * Shape vem de FinancingComparisonPayload (src/lib/chat/types.ts):
 *   category, creditValue, termMonths,
 *   consorcio: { monthlyPayment, totalCost },
 *   financing: { monthlyPayment, totalCost, annualRate },
 *   diff: { monthlyDelta, totalDelta },
 *   disclaimer.
 */
export function financingComparisonToWhatsApp(
	payload: Record<string, unknown>,
): WhatsAppResponse | null {
	const consorcio = payload.consorcio as
		| { monthlyPayment?: number; totalCost?: number }
		| undefined;
	const financing = payload.financing as
		| { monthlyPayment?: number; totalCost?: number; annualRate?: number }
		| undefined;
	if (!consorcio || !financing) return null;

	const creditValue = payload.creditValue as number | undefined;
	const termMonths = payload.termMonths as number | undefined;
	const diff = payload.diff as { monthlyDelta?: number; totalDelta?: number } | undefined;
	const disclaimer = (payload.disclaimer as string | undefined) ?? "";

	const lines: string[] = ["*Consórcio vs Financiamento*"];
	if (creditValue !== undefined) {
		lines.push(
			"",
			`Carta de crédito: ${formatBRL(creditValue)}${termMonths ? ` • ${termMonths} meses` : ""}`,
		);
	}

	lines.push("", "*Consórcio*");
	if (consorcio.monthlyPayment !== undefined) {
		lines.push(`• Parcela: ${formatBRL(consorcio.monthlyPayment)}/mês`);
	}
	if (consorcio.totalCost !== undefined) {
		lines.push(`• Total pago: ${formatBRL(consorcio.totalCost)}`);
	}
	lines.push("• Juros: zero");

	lines.push("", "*Financiamento*");
	if (financing.monthlyPayment !== undefined) {
		lines.push(`• Parcela: ${formatBRL(financing.monthlyPayment)}/mês`);
	}
	if (financing.annualRate !== undefined) {
		lines.push(`• Taxa: ${financing.annualRate.toFixed(1)}% a.a.`);
	}
	if (financing.totalCost !== undefined) {
		lines.push(`• Total pago: ${formatBRL(financing.totalCost)}`);
	}

	if (diff?.monthlyDelta !== undefined || diff?.totalDelta !== undefined) {
		lines.push("", "*Economia no consórcio*");
		if (diff.monthlyDelta !== undefined) {
			lines.push(`• Por mês: ${formatBRL(Math.abs(diff.monthlyDelta))}`);
		}
		if (diff.totalDelta !== undefined) {
			lines.push(`• Total: ${formatBRL(Math.abs(diff.totalDelta))}`);
		}
	}

	if (disclaimer) {
		lines.push("", `_${disclaimer}_`);
	}

	return { type: "text", text: lines.join("\n") };
}

/**
 * whatsapp_optin — usuário já está no canal WhatsApp, então pedir opt-in
 * via card seria redundante. Em vez de dropar silencioso (que mascararia
 * bugs), emite um texto curto reconhecendo o estado: o usuário tá no WA,
 * vamos continuar daqui. Esse mapper EXISTE de propósito — semântica do
 * canal: opt-in é implícito.
 */
export function whatsappOptinToWhatsApp(): WhatsAppResponse {
	return {
		type: "text",
		text: "Show — como você já está no WhatsApp, vou seguir conversando por aqui mesmo. 👍",
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
		case "topic_picker":
			return topicPickerToWhatsApp(payload);
		case "scenarios":
			return scenariosToWhatsApp(payload);
		case "financing_comparison":
			return financingComparisonToWhatsApp(payload);
		case "whatsapp_optin":
			return whatsappOptinToWhatsApp();
		default:
			return null;
	}
}
