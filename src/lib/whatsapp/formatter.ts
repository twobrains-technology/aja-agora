import { gateQuestion, LANCE_EMBUTIDO_ASK } from "@/lib/agent/orchestrator/gate-questions";
import { DECISION_PROMPT_OPTIONS, DECISION_PROMPT_QUESTION } from "@/lib/chat/types";
import { isValidCpf, maskCpf } from "@/lib/conversation/identity";

// FIX-337 (invariante I6, docs/jornada/decisoes-do-cliente.md): dado sensível
// não pode trafegar em texto plano no WhatsApp. O modelo não tem nenhuma
// barreira determinística que impeça ecoar o CPF do cliente na fala livre
// (dossiê auto-whatsapp t10: "Perfeito, anotei seu CPF: 11 dígitos em claro").
// Mesmo candidato de captura de identify-capture.ts (extractCpf): qualquer
// sequência de dígitos, com ou sem pontuação, entre 9 e 17 chars. Só mascara
// o que VALIDA como CPF (dígito verificador) — nunca outros números (valor,
// data, telefone) que por acaso tenham 11 dígitos.
const CPF_CANDIDATE_RE = /\d[\d.\-\s]{9,17}\d/g;

/** Mascara qualquer sequência que valide como CPF real — barreira em CÓDIGO
 * (Lei 1/4), não regra-no-prompt. Aplicada em TODO texto outbound do
 * WhatsApp, independente de onde o dígito veio na fala do modelo. */
export function scrubCpf(text: string): string {
	return text.replace(CPF_CANDIDATE_RE, (match) => (isValidCpf(match) ? maskCpf(match) : match));
}

export function formatTextForWhatsApp(text: string): string {
	return (
		scrubCpf(
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
				// Bug QA 2026-07-03: o LLM quebra valores no separador de milhar/decimal
				// ("R$ 100.\n\n000,00") por causa da regra "1-2 frases por mensagem" — lê o
				// ponto como fim de frase. Um ponto OU vírgula ENTRE DÍGITOS é sempre
				// separador numérico, nunca fim de frase: reúne o número (Lei 4, determinístico).
				// FIX-337 (I6): scrubCpf roda DEPOIS deste reagrupamento, pra pegar CPF
				// partido em duas linhas pelo modelo.
				.replace(/(\d[.,])\s*\n\s*(\d)/g, "$1$2"),
		)
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

// Shape navegável do payload interactive do WhatsApp. Tipa o que os testes/
// consumidores acessam (body.text, action.button/buttons/sections.rows) e mantém
// índice [k]: unknown em cada nível pra os ~20 builders não baterem em
// excess-property (campos extras como header/footer são absorvidos).
export interface WhatsAppInteractive {
	type?: string;
	body?: { text?: string; [k: string]: unknown };
	action?: {
		button?: string;
		buttons?: Array<{
			reply: { id: string; title?: string; [k: string]: unknown };
			[k: string]: unknown;
		}>;
		sections?: Array<{
			rows?: Array<{ id: string; title?: string; description?: string; [k: string]: unknown }>;
			[k: string]: unknown;
		}>;
		[k: string]: unknown;
	};
	[k: string]: unknown;
}

export interface WhatsAppResponse {
	type: "text" | "interactive";
	text?: string;
	interactive?: WhatsAppInteractive;
}

export function groupCardToWhatsApp(payload: Record<string, unknown>): WhatsAppResponse {
	const p = payload;
	const body = [
		`*${p.administradora}* — ${(p.category as string)?.replace("imovel", "Imóvel").replace("auto", "Auto").replace("moto", "Moto").replace("servicos", "Serviços")}`,
		`Valor do bem: ${formatBRL(p.creditValue as number)}`,
		`Parcela: ${formatBRL(p.monthlyPayment as number)}/mês`,
		// Bernardo 2026-06-11: sem taxa admin no card (assusta o leigo) — composição
		// completa na proposta (PDF) pré-assinatura. Ver docs/jornada/CONTEXT.md.
		`Prazo: ${p.termMonths} meses`,
		`Contemplação: ${(p.contemplationRate as number).toFixed(1)}%/assembleia`,
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
	const lines = [
		"*Simulação de Cota*",
		"",
		`*Valor do bem:* ${formatBRL(p.creditValue as number)}`,
		`*Parcela:* ${formatBRL(p.monthlyPayment as number)}/mês`,
		// Bernardo 2026-06-11: card DIRETO — taxa admin / fundo reserva / seguro /
		// custo total / taxa efetiva saem (assustam o leigo). A composição completa
		// (CMN 4.927/2021 + CDC art. 37) é disclosed no PDF da proposta pré-assinatura.
		// Ver docs/jornada/CONTEXT.md.
		`*Prazo:* ${p.termMonths} meses`,
	];
	const eb = p.embeddedBid as
		| { percent: number; receivedCredit: number; necessaryBidToContemplate?: number | null }
		| undefined;
	if (eb) {
		lines.push(
			"",
			`*Com lance embutido (${eb.percent}%):*`,
			`Valor que você recebe: ${formatBRL(eb.receivedCredit)}`,
		);
		// FIX-8: só com dado real (> 0) — "R$ 0,00" é enganoso.
		if ((eb.necessaryBidToContemplate ?? 0) > 0) {
			lines.push(
				`Lance estimado p/ contemplar: ${formatBRL(eb.necessaryBidToContemplate as number)}`,
			);
		}
	}
	const body = lines.join("\n");

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
		`*Recomendação — ${score}% compatível*`,
		"",
		`*${p.administradora}* — ${(p.category as string)?.replace("imovel", "Imóvel").replace("auto", "Auto").replace("moto", "Moto").replace("servicos", "Serviços")}`,
		`${formatBRL(p.creditValue as number)} • ${formatBRL(p.monthlyPayment as number)}/mês`,
		// Bernardo 2026-06-11: sem % admin no card (assusta o leigo).
		`${p.termMonths} meses`,
		`${(p.contemplationRate as number).toFixed(1)}% contemplação`,
	].join("\n");

	return {
		type: "interactive",
		interactive: {
			type: "button",
			body: { text: body },
			action: {
				// FIX-108 (decisão Kairo 2026-06-28): a recomendada vem em DESTAQUE
				// (este card) com os CTAs de ação + "Ver outras opções", que abre a
				// comparação das alternativas (handleShowOthers). Não é mais lista
				// plana. WhatsApp limita a 3 botões — cabe certo.
				buttons: [
					{ type: "reply", reply: { id: `interest_${p.id}`, title: "Tenho interesse!" } },
					{ type: "reply", reply: { id: `simulate_${p.id}`, title: "Simular valores" } },
					{ type: "reply", reply: { id: "show_others", title: "Ver outras opções" } },
				],
			},
		},
	};
}

// Invariante I4 (docs/jornada/decisoes-do-cliente.md): NUNCA prometer reserva
// antes da contratação real. Esta copy dizia "Para reservar essa opção" e o
// `present_lead_form` está liberado na fase PRÉ-reveal (tool-policy.ts) — ou
// seja, o cliente lia uma promessa de reserva ainda na qualificação, sem CPF e
// sem busca feita. O guard de sanitização (PREMATURE_RESERVATION_PATTERNS) não
// pegava: casa o particípio ("reservado/reservada"), não o infinitivo — e texto
// de card do canal nem passa por ele.
export function leadFormToWhatsApp(): WhatsAppResponse {
	return {
		type: "text",
		text: "Ótimo! Pra eu seguir com você, preciso de alguns dados.\n\n*Qual seu nome completo?*",
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

// FIX-109 (decisão Kairo 2026-06-28): o valor do bem agora é CONVERSA — o
// usuário fala quanto custa o que quer ("uns 80 mil"), sem o componente de
// faixas. O agente (bloco-jornada-entrada FIX-104) parou de emitir value_picker;
// este mapper degrada pra um pedido conversacional caso o artifact ainda chegue
// — anti-drop preservado (nunca retorna null), mas NÃO renderiza mais a lista.
// TODO(bloco-jornada-entrada): confirmar a parada de emissão do value_picker.
export function valuePickerToWhatsApp(payload: Record<string, unknown>): WhatsAppResponse {
	const category = payload.category as string | undefined;
	const bemLabel: Record<string, string> = {
		imovel: "imóvel",
		auto: "carro",
		moto: "moto",
		servicos: "serviço",
	};
	const bem = (category && bemLabel[category]) || "bem";

	return {
		type: "text",
		text: `Quanto custa o ${bem} que você tem em mente? Pode me dizer o valor aproximado, tipo "uns 80 mil".`,
	};
}

// Bridge message shown right before the specialist takes over. Hardcoded
// (system voice, not persona's) — purpose é UX: tell the user they're being
// connected so the persona-voice change doesn't feel abrupt. Quente mas curto.
export function transitionBridgeText(specialist: { name: string; categoryLabel: string }): string {
	return `Boa! Te conectando com a ${specialist.name}, nossa especialista em ${specialist.categoryLabel}.\nUm momento.`;
}

import {
	LANCE_EMBUTIDO_OPTIONS,
	lanceValueOptions,
	TIMEFRAME_OPTIONS as TIMEFRAMES,
} from "@/lib/agent/qualify-config";

// FIX-120 (paridade FIX-115): o valor do bem virou CONVERSA no WhatsApp — o
// gate credit deixou de renderizar a lista de faixas. `creditRangeQuestionToWhatsApp`
// / `resolveCreditReply` (e o `credit_` roteado) foram aposentados; o adapter
// pergunta o valor por TEXTO (gateTextPrompt → gateQuestion("credit")) e o
// backstop parseAssetValue captura a resposta livre. CREDIT_BUCKETS segue vivo
// em qualify-config (lanceValueOptions/referência de faixa), só não é mais
// consumido aqui.

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

// FIX-268 (rodada 7, veredito Fable r6, residual D4): "reserva" varrido —
// mesma disciplina do FIX-234/FIX-256 (nunca "reserva"/"reservado" antes da
// contratação real), espelhando o chip equivalente da web (adapter.ts).
const LANCE_OPTIONS = [
	{ token: "yes", title: "Sim, tenho como dar" },
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

// docx passo 2 (linha 21-22): se "sim" pro lance → "Qual valor aproximado?"
// Faixas relativas ao crédito (lista — 4 opções não cabem em buttons).
export function lanceValueQuestionToWhatsApp(creditMax: number, prefix?: string): WhatsAppResponse {
	const question = gateQuestion("lance-value") ?? "";
	const text = prefix ? `${prefix}\n\n${question}` : question;
	return {
		type: "interactive",
		interactive: {
			type: "list",
			body: { text },
			action: {
				button: "Escolher valor",
				sections: [
					{
						title: "Valor do lance",
						rows: lanceValueOptions(creditMax).map((o) => ({
							id: `lancevalue_${o.token}`,
							title: o.title.slice(0, 24),
							description: (o.desc ?? "").slice(0, 72),
						})),
					},
				],
			},
		},
	};
}

export function resolveLanceValueReply(replyId: string): { value: number } | null {
	if (!replyId.startsWith("lancevalue_")) return null;
	const value = Number(replyId.replace("lancevalue_", ""));
	if (!Number.isFinite(value) || value <= 0) return null;
	return { value };
}

export function lanceEmbutidoQuestionToWhatsApp(prefix?: string): WhatsAppResponse {
	// FIX-212 (split 2 tempos): o card carrega SÓ a pergunta curta — a educação
	// (LANCE_EMBUTIDO_EDU) sai como balão de contexto antes, via gateContextBeat.
	const text = prefix ? `${prefix}\n\n${LANCE_EMBUTIDO_ASK}` : LANCE_EMBUTIDO_ASK;
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
						title: o.token === "yes" ? "Sim, considerar" : "Sem lance embutido",
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

// docx passo 4 (linha 34): oferta do simulador na sequência do reveal.
export function simulatorOfferToWhatsApp(prefix?: string): WhatsAppResponse {
	const question = gateQuestion("simulator-offer") ?? "";
	const text = prefix ? `${prefix}\n\n${question}` : question;
	return {
		type: "interactive",
		interactive: {
			type: "button",
			body: { text },
			action: {
				buttons: [
					{ type: "reply", reply: { id: "simoffer_yes", title: "Quero ver!" } },
					{ type: "reply", reply: { id: "simoffer_no", title: "Agora não" } },
				],
			},
		},
	};
}

export function resolveSimulatorOfferReply(replyId: string): { value: "yes" | "no" } | null {
	if (!replyId.startsWith("simoffer_")) return null;
	const token = replyId.replace("simoffer_", "");
	return token === "yes" || token === "no" ? { value: token } : null;
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
		lines.push(`Valor do bem: ${credit}`);
	}
	if (answers.prazoMeses !== undefined) {
		lines.push(`Prazo: ${prazoLabel(answers.prazoMeses)}`);
	}
	if (answers.hasLance) {
		lines.push(`Lance: ${lanceLabel(answers.hasLance)}`);
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
					{ type: "reply", reply: { id: "experience_first", title: "É a primeira vez" } },
					{ type: "reply", reply: { id: "experience_returning", title: "Já conheço" } },
					{ type: "reply", reply: { id: "experience_doubts", title: "Tenho dúvidas" } },
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
					{ type: "reply", reply: { id: "category_imovel", title: "Imóvel" } },
					{ type: "reply", reply: { id: "category_auto", title: "Carro" } },
					{ type: "reply", reply: { id: "category_moto", title: "Moto" } },
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

	const renderBlock = (label: string, s: Record<string, unknown> | undefined): string | null => {
		if (!s) return null;
		const lancePercent = s.lancePercent as number | undefined;
		const months = s.expectedTermMonths as number | undefined;
		const strategy = (s.strategy as string | undefined) ?? "";
		const lanceLabel =
			typeof lancePercent === "number" && lancePercent > 0 ? `${lancePercent}% lance` : "sem lance";
		const monthsLabel = typeof months === "number" ? `${months}m` : "—";
		const head = `*${label}* — ${lanceLabel}, contempla em ~${monthsLabel}`;
		return strategy ? `${head}\nEstratégia: ${strategy}` : head;
	};

	const blocks = [
		renderBlock("Conservador", scenarios.conservador),
		renderBlock("Provável", scenarios.provavel),
		renderBlock("Acelerado", scenarios.acelerado),
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
			`Valor do bem: ${formatBRL(creditValue)}${termMonths ? ` • ${termMonths} meses` : ""}`,
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
		text: "Show — como você já está no WhatsApp, vou seguir conversando por aqui mesmo.",
	};
}

const brlWa = (n: number) =>
	n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Passo 5: form de contratação. WhatsApp não tem form — vira diálogo guiado
 * (FIX-25). A identidade JÁ foi coletada no gate identify (FIX-9), então a 1ª
 * mensagem CONFIRMA os dados (CPF mascarado) com botões em vez de pedir CPF de
 * novo. Sem identidade on file (defensivo), pede o CPF por texto. O aceite do
 * botão/“sim” é o consentimento explícito que dispara a proposta real. */
export function contractFormToWhatsApp(payload: Record<string, unknown>): WhatsAppResponse {
	const admin = payload.administradora as string | undefined;
	const identityOnFile = payload.identityOnFile === true;
	const cpfMasked = payload.prefilledCpfMasked as string | undefined;

	if (!identityOnFile) {
		return {
			type: "text",
			text: `Boa! Pra eu criar sua proposta${admin ? ` na ${admin}` : ""}, me manda seu *CPF* aqui (só números). Seu WhatsApp já vale como contato e seus dados são tratados com segurança (LGPD).`,
		};
	}

	const dados = cpfMasked ? ` (CPF ${cpfMasked})` : "";
	return {
		type: "interactive",
		interactive: {
			type: "button",
			body: {
				text: `Boa! Já tenho seus dados${dados} aqui do nosso atendimento. Posso criar sua proposta real${admin ? ` na ${admin}` : ""}? Seus dados seguem protegidos (LGPD).`,
			},
			action: {
				buttons: [
					{ type: "reply", reply: { id: "contract_confirm", title: "Confirmar" } },
					{ type: "reply", reply: { id: "contract_cancel", title: "Ver outras" } },
				],
			},
		},
	};
}

/** Oferta REAL pra confirmar (botão). */
export function realOfferToWhatsApp(payload: Record<string, unknown>): WhatsAppResponse {
	const admin = (payload.administradora as string) ?? "administradora";
	const credit = Number(payload.creditValue ?? 0);
	const parcela = Number(payload.monthlyPayment ?? 0);
	const grupo = payload.grupo as string | undefined;
	// FIX-39/40: campos novos da API (paridade com o card web). Defensivos —
	// ausentes → linha omitida (D11). Lance médio com rótulo LITERAL, sem promessa.
	const termMonths = Number(payload.termMonths);
	const avgBidValue = Number(payload.avgBidValue);
	const prazoLine = Number.isFinite(termMonths) ? `\n*Prazo:* ${termMonths} meses` : "";
	const lanceLine = Number.isFinite(avgBidValue)
		? `\n*Lance médio do grupo:* ${brlWa(avgBidValue)}`
		: "";
	// FIX-240/FIX-247 (CDC art. 30, rodada 3 — Fable r2 N3): paridade com o
	// aviso de ajuste do card web (real-offer.tsx) — quando a carta fechada
	// diverge do valor pedido, o WhatsApp avisa igual, nunca confirma
	// silenciosamente. Copy corrigida (pedido × carta real, sem inversão).
	const rawCreditValue = Number(payload.rawCreditValue);
	const adjustmentLine =
		Number.isFinite(rawCreditValue) && Math.round(rawCreditValue) !== Math.round(credit)
			? `\n\n_Você pediu uma carta de ~${brlWa(rawCreditValue)} — a carta real ficou em ${brlWa(credit)}._`
			: "";
	// FIX-259 (P1, veredito Fable r4): paridade com o card web — quando o
	// fechamento trocou a administradora confirmada, avisa explicitamente as
	// duas marcas em vez de "Confirmado com a X" liso.
	const previousAdministradora = payload.previousAdministradora as string | undefined;
	const swapLine = previousAdministradora
		? `\n\n_A ${previousAdministradora} não tem grupo disponível nessa faixa agora — a opção equivalente é a ${admin}._`
		: "";
	const introLine = previousAdministradora
		? `Confirmado com a ${admin} (opção equivalente à ${previousAdministradora}):`
		: `Confirmado com a ${admin}:`;
	return {
		type: "interactive",
		interactive: {
			type: "button",
			body: {
				text: `${introLine}\n\n*Carta:* ${brlWa(credit)}\n*Parcela:* ${brlWa(parcela)}${grupo ? `\n*Grupo:* ${grupo}` : ""}${prazoLine}${lanceLine}${adjustmentLine}${swapLine}\n\nConfirma essa carta pra eu seguir?`,
			},
			action: {
				buttons: [
					{ type: "reply", reply: { id: "offer_confirm", title: "Confirmar carta" } },
					{ type: "reply", reply: { id: "offer_reject", title: "Ver outras" } },
				],
			},
		},
	};
}

/** Encaminhamento da proposta pronta (link). PARIDADE DES-1 (FIX-116): o
 * `consortiumProposalLink` é o PDF da PROPOSTA de consórcio, não um portal de
 * assinatura — a assinatura/efetivação é etapa posterior da mesa. Espelha o web
 * (signature-handoff.tsx: "Sua proposta está pronta" / "Ver minha proposta") e
 * compartilha a proibição de /assinatura|assinar/i com o canal web. */
export function signatureHandoffToWhatsApp(payload: Record<string, unknown>): WhatsAppResponse {
	const admin = (payload.administradora as string) ?? "administradora";
	const link = payload.consortiumProposalLink as string;
	return {
		type: "text",
		text: `Sua proposta está pronta! Sua proposta de consórcio da ${admin}, escolhida pela Aja Agora pro seu perfil, já está gerada — e a gente segue com você até a contemplação.\n\nÉ só ver a sua proposta aqui:\n${link}`,
	};
}

/** Envio de documento (WhatsApp aceita foto). */
export function documentUploadToWhatsApp(_payload: Record<string, unknown>): WhatsAppResponse {
	return {
		type: "text",
		text: "Pra completar sua reserva, me manda a foto do seu *RG ou CNH* (frente e verso) aqui mesmo. É opcional — se preferir enviar depois, responde *pular*.",
	};
}

// FIX-122 (D13) — respostas do handler de mídia INBOUND (par do convite acima).
// A promessa "me manda aqui mesmo" agora é cumprida: cada foto recebida sobe pro
// MESMO destino do web (uploadContractDocument) e o cliente recebe confirmação +
// o próximo slot pedido. Nunca silêncio — mesmo nos caminhos de erro.

/** Confirmação de uma foto recebida no WhatsApp. `allDone` = era o último slot
 * (ficha completa); senão pede o verso. */
export function documentReceivedToWhatsApp(allDone: boolean): WhatsAppResponse {
	return {
		type: "text",
		text: allDone
			? "Recebi. Sua reserva está confirmada! Agora é com a administradora, e eu te aviso de cada passo."
			: "Recebi a frente. Agora me manda o *verso* do documento, é só mandar a foto aqui.",
	};
}

/** Cliente mandou foto, mas a conversa ainda não chegou no Passo 6 (sem proposta
 * em 'documentos'). Acolhe sem prometer nada fora de ordem. */
export function documentNotReadyToWhatsApp(): WhatsAppResponse {
	return {
		type: "text",
		text: "Recebi sua foto! Mas ainda não cheguei na etapa de documentos com você. Assim que a gente confirmar sua reserva, eu te peço o RG ou CNH por aqui.",
	};
}

/** O upload automatizado falhou (anti-bot/drift do portal) → devolve o link
 * oficial como fallback, mantendo a jornada viva. */
export function documentUploadFallbackToWhatsApp(link: string): WhatsAppResponse {
	return {
		type: "text",
		text: `Recebi sua foto, mas não consegui anexar por aqui. Finaliza rapidinho neste link: ${link}`,
	};
}

/** Não deu pra baixar a mídia da Graph API (foto corrompida, expirada etc.). */
export function documentDownloadFailedToWhatsApp(): WhatsAppResponse {
	return {
		type: "text",
		text: "Não consegui abrir sua foto por aqui. Pode mandar de novo, por favor?",
	};
}

/** Foto chegou sem conversa em andamento (waId sem registro). Convida a começar. */
export function documentNoConversationToWhatsApp(): WhatsAppResponse {
	return {
		type: "text",
		text: "Recebi sua foto, mas ainda não temos uma conversa em andamento por aqui. Manda um oi que eu começo com você!",
	};
}

// FIX-109: o WhatsApp não tem slider — o simulador-agulha vira um LOOP
// CONVERSACIONAL conduzido pelo agente (bloco-jornada-entrada FIX-106). O
// usuário diz o mês-alvo, o agente recalcula via computeContemplationDial e
// devolve o CENÁRIO. Aqui só FORMATAMOS o cenário — nunca recalculamos.
const SIMULATOR_DISCLAIMER =
	"_Estimativa a partir dos dados da oferta — contemplação não é garantida._";

/** Visão mínima do cenário calculado (ContemplationDialResult) que o agente
 * devolve por iteração. Lido defensivamente do payload (não recalcula). */
interface DialScenarioView {
	targetMonth: number;
	mode?: "lance" | "sorteio";
	requiredLancePct?: number;
	requiredLanceValue?: number;
	receivedCredit?: number;
	paymentAfterContemplation?: number;
}

/** Extrai o cenário JÁ calculado pelo agente. Aceita tanto `payload.scenario`
 * (objeto aninhado) quanto os campos do ContemplationDialResult no topo do
 * payload. Retorna null quando o payload traz só os inputs do plano (abertura
 * do simulador) — aí a apresentação é o convite ao loop.
 * TODO(bloco-jornada-entrada): confirmar o shape final do cenário no payload. */
function readDialScenario(payload: Record<string, unknown>): DialScenarioView | null {
	const raw = (payload.scenario as Record<string, unknown> | undefined) ?? payload;
	const targetMonth = Number(raw.targetMonth);
	// "cenário calculado" exige o RESULTADO (mês-alvo + lance/modo), não só os
	// inputs (initialTargetMonth/creditValue do ContemplationDialPayload).
	const hasResult = raw.requiredLancePct !== undefined || raw.mode !== undefined;
	if (!Number.isFinite(targetMonth) || !hasResult) return null;
	const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
	return {
		targetMonth,
		mode: raw.mode === "sorteio" || raw.mode === "lance" ? raw.mode : undefined,
		requiredLancePct: num(raw.requiredLancePct),
		requiredLanceValue: num(raw.requiredLanceValue),
		receivedCredit: num(raw.receivedCredit),
		paymentAfterContemplation: num(raw.paymentAfterContemplation),
	};
}

/** Formata UMA iteração do simulador conversacional (o cenário recalculado pelo
 * agente). Só apresentação — o cálculo vem de computeContemplationDial. */
function simulatorScenarioToWhatsApp(s: DialScenarioView): WhatsAppResponse {
	const monthLabel = `${s.targetMonth} ${s.targetMonth === 1 ? "mês" : "meses"}`;
	const lines: string[] = [`*Contemplação em ${monthLabel}*`, ""];

	const isSorteio = s.mode === "sorteio" || (s.requiredLancePct ?? 0) <= 0;
	if (isSorteio) {
		lines.push("Nesse prazo dá pra contar mais com o sorteio — lance opcional e parcela menor.");
	} else {
		const lanceStr =
			s.requiredLanceValue !== undefined
				? `*${s.requiredLancePct}%* (${brlWa(s.requiredLanceValue)})`
				: `*${s.requiredLancePct}%*`;
		lines.push(`Pra antecipar pra esse mês, o lance fica em torno de ${lanceStr}.`);
		if (s.receivedCredit !== undefined) {
			lines.push(`Você recebe ${brlWa(s.receivedCredit)} de crédito.`);
		}
		if (s.paymentAfterContemplation !== undefined) {
			lines.push(
				`Depois da contemplação, a parcela fica em ~${brlWa(s.paymentAfterContemplation)}/mês.`,
			);
		}
	}
	lines.push("", SIMULATOR_DISCLAIMER);
	return { type: "text", text: lines.join("\n") };
}

export function contemplationDialToWhatsApp(payload: Record<string, unknown>): WhatsAppResponse {
	// Iteração do loop: o agente já calculou o cenário do mês-alvo → formata.
	const scenario = readDialScenario(payload);
	if (scenario) return simulatorScenarioToWhatsApp(scenario);
	// Abertura do simulador (só inputs do plano): sem slider, convidamos o loop —
	// o usuário diz o mês-alvo e o agente itera (recalcula a cada resposta).
	return {
		type: "text",
		text: "Em quantos meses você quer ser contemplado? Me diz um número que eu te mostro o lance necessário e quanto você recebe.",
	};
}

// FIX-228 (docs/02-cards-novos.md CARD 1 — embedded_bid). Regra dura: SEMPRE
// diz que o crédito recebido diminui — texto hardcoded (não depende do
// `payload.disclaimer`), mesma garantia do card web (embedded-bid.tsx).
export function embeddedBidToWhatsApp(payload: Record<string, unknown>): WhatsAppResponse {
	const embeddedBidValue = Number(payload.embeddedBidValue ?? 0);
	const netCredit = Number(payload.netCredit ?? 0);
	return {
		type: "text",
		text:
			"*Lance embutido — sem tirar do bolso*\n\n" +
			"Você usa parte da própria carta como lance e antecipa a contemplação, sem desembolsar.\n\n" +
			`*Lance embutido:* ${brlWa(embeddedBidValue)}\n*Valor que você recebe:* ${brlWa(netCredit)}\n\n` +
			"O embutido sai da carta, então o crédito recebido diminui um pouco (estimativa, não garantia).",
	};
}

// FIX-229 (docs/02-cards-novos.md CARD 3 — two_paths). Botões interativos —
// mesmas duas opções do card web, mesmo peso (nenhuma marcada como
// recomendada). PROIBIDO qualquer % de chance/probabilidade (docs/05).
export function twoPathsToWhatsApp(payload: Record<string, unknown>): WhatsAppResponse {
	const monthlyPayment = Number(payload.monthlyPayment ?? 0);
	return {
		type: "interactive",
		interactive: {
			type: "button",
			body: {
				text:
					"Dois caminhos possíveis, sem lance:\n\n" +
					`*Esperar o sorteio* — paga só a parcela de ${brlWa(monthlyPayment)} e concorre todo mês.\n\n` +
					"*Lance pequeno lá na frente* — se sobrar um extra, um lance modesto melhora as chances.\n\n" +
					"Não tem certo ou errado — depende de você ter pressa ou não.",
			},
			action: {
				buttons: [
					{ type: "reply", reply: { id: "two_paths_sorteio", title: "Vou de sorteio" } },
					{ type: "reply", reply: { id: "two_paths_lance", title: "Lance pequeno" } },
				],
			},
		},
	};
}

// FIX-230 (docs/02-cards-novos.md CARD 2 — scarcity). Texto simples — número
// placebo já coagido no servidor (coerceScarcityPayload). NUNCA menciona
// total de cotas nem razão N/total (não temos esse dado). Sem
// `availableSlots` válido, não envia nada (mesmo comportamento do card web —
// sem fallback/estimativa, D3 do ADR).
export function scarcityToWhatsApp(payload: Record<string, unknown>): WhatsAppResponse | null {
	const availableSlots = Number(payload.availableSlots);
	if (!Number.isFinite(availableSlots)) return null;
	return {
		type: "text",
		text: `Grupo quase cheio, restam apenas ${availableSlots}. Quando preencher, entra fila para o próximo grupo.`,
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
		case "decision_prompt":
			return decisionPromptToWhatsApp(payload);
		case "contract_form":
			return contractFormToWhatsApp(payload);
		case "real_offer":
			return realOfferToWhatsApp(payload);
		case "signature_handoff":
			return signatureHandoffToWhatsApp(payload);
		case "document_upload":
			return documentUploadToWhatsApp(payload);
		case "contemplation_dial":
			return contemplationDialToWhatsApp(payload);
		case "embedded_bid":
			return embeddedBidToWhatsApp(payload);
		case "two_paths":
			return twoPathsToWhatsApp(payload);
		case "scarcity":
			return scarcityToWhatsApp(payload);
		default:
			return null;
	}
}

/** Card de decisão (jornada do .docx etapa 4). 3 botões, TODOS com handler
 * determinístico em `dispatchInteractiveReply`: "Ver outras opções"
 * (decision_outras → buildOtherOptions, FIX-119/D22), "Seguir agora"
 * (decision_contratar → mesmo caminho do "Tenho interesse") e "Falar c/
 * consultor" (decision_especialista → handoff humano). Até 2026-07-20 só o
 * primeiro tinha handler: os outros dois viravam texto solto pro LLM. */
export function decisionPromptToWhatsApp(payload: Record<string, unknown>): WhatsAppResponse {
	const admin = payload.administradora as string | undefined;
	const text = admin ? `${DECISION_PROMPT_QUESTION} (${admin})` : DECISION_PROMPT_QUESTION;
	return {
		type: "interactive",
		interactive: {
			type: "button",
			body: { text },
			action: {
				buttons: DECISION_PROMPT_OPTIONS.map((o) => ({
					type: "reply",
					reply: { id: `decision_${o.intent}`, title: o.waTitle },
				})),
			},
		},
	};
}
