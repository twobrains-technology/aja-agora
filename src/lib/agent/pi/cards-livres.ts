// QUEM PODE PEDIR CADA UM DOS 22 CARDS — e onde o payload de cada um nasce.
//
// O turno livre continua sem funil: quem conduz a conversa é o modelo. Mas card
// não é fala — o payload tem shape, e shape errado na tela é card quebrado ou
// card mentindo. Este módulo é o único lugar onde o destino é decidido:
//
//  · ESCOLHA (`quick_reply`, `value_picker`, `topic_picker`) — o payload é a
//    PERGUNTA e as opções, escritas pelo modelo e validadas aqui. Número neste
//    caminho é faixa de intenção ("até 80 mil"), nunca oferta.
//  · FATO (os outros 14 emitíveis) — o payload sai de dado real (carta,
//    proposta, estado da conversa), montado AQUI (`MONTADORES_DE_CARD`). Do
//    modelo vem só a ESCOLHA de qual carta (`groupId`) e, quando é cenário, o
//    mês-alvo/percentual — nunca um número de oferta.
//  · FORA DO MOTOR (5) — nascem do handler de confirmação ou de um experimento
//    A/B; emitir no turno duplicaria o beat ou quebraria a medição.

import type { GroupSummary, QuotaSimulation } from "@/lib/adapters/types";
import {
	coerceDialPayload,
	offerSnapshotFromArtifact,
} from "@/lib/agent/orchestrator/dial-payload";
import {
	buildComparisonTableFromRevealGroups,
	buildRecommendationCardFromRevealGroup,
	coerceRevealCota,
	type RevealGroupIndex,
} from "@/lib/agent/orchestrator/recommendation-payload";
import type { ArtifactType } from "@/lib/chat/types";
import { compareWithFinancing } from "@/lib/finance/pmt";

export type DestinoDoCard =
	| { classe: "emitivel"; origem: "escolha" | "fato" }
	| { classe: "fora-do-motor"; motivo: string };

/** Os 22 tipos de `ArtifactByType`. O `satisfies Record<ArtifactType, …>` é o
 * contrato: um tipo novo em `src/lib/chat/types.ts` **quebra o typecheck** aqui
 * até ganhar destino — é assim que card novo não some do motor em silêncio. E
 * `as const` mantém a classe de cada entrada LITERAL, que é o que permite
 * derivar `TipoEmitivel`/`TipoDeFato` do próprio mapa (uma fonte só). */
export const DESTINO_DOS_CARDS = {
	comparison_table: { classe: "emitivel", origem: "fato" },
	real_offer: { classe: "emitivel", origem: "fato" },
	group_card: { classe: "emitivel", origem: "fato" },
	recommendation_card: { classe: "emitivel", origem: "fato" },
	simulation_result: { classe: "emitivel", origem: "fato" },
	financing_comparison: { classe: "emitivel", origem: "fato" },
	contemplation_dial: { classe: "emitivel", origem: "fato" },
	embedded_bid: { classe: "emitivel", origem: "fato" },
	two_paths: { classe: "emitivel", origem: "fato" },
	scarcity: { classe: "emitivel", origem: "fato" },
	lead_form: { classe: "emitivel", origem: "fato" },
	contract_form: { classe: "emitivel", origem: "fato" },
	whatsapp_optin: { classe: "emitivel", origem: "fato" },
	decision_prompt: { classe: "emitivel", origem: "fato" },
	quick_reply: { classe: "emitivel", origem: "escolha" },
	value_picker: { classe: "emitivel", origem: "escolha" },
	topic_picker: { classe: "emitivel", origem: "escolha" },
	signature_handoff: {
		classe: "fora-do-motor",
		motivo:
			"Nasce no handler de confirmação, depois de confirmOffer — antes dela não existe proposalUrl, que o card exige.",
	},
	atendimento_handoff: {
		classe: "fora-do-motor",
		motivo: "O fecho é do handler de confirmação; emitir no turno duplicaria o beat.",
	},
	telefone_do_desbloqueio: {
		classe: "fora-do-motor",
		motivo:
			"Quem decide é o experimento A/B do telefone (desbloqueio-do-telefone.ts); escolha do modelo quebraria a medição.",
	},
	document_upload: {
		classe: "fora-do-motor",
		motivo:
			"Retirado do fecho por decisão de 21/07/2026: quem pede documento é o atendente da adesão.",
	},
	scenarios: {
		classe: "fora-do-motor",
		motivo:
			"Os 3 cenários exigem projeção de prazo sem fonte real; fabricar o número violaria a regra de que número só sai de tool.",
	},
} as const satisfies Record<ArtifactType, DestinoDoCard>;

export const TIPOS_DE_ESCOLHA = ["quick_reply", "value_picker", "topic_picker"] as const;

export type TipoDeEscolha = (typeof TIPOS_DE_ESCOLHA)[number];

/** Card é decisão, não menu. Mesmo teto de `MAX_OPCOES_NA_COMPARACAO`: mais
 * opções que isso, o modelo oferece na conversa. Número num lugar só. */
export const MAX_OPCOES_NO_CARD = 4;

/** Teto de sanidade do `value_picker`: ali os números são a PERGUNTA (faixa de
 * intenção), e carta de consórcio não passa disso. */
const MAX_VALOR_DO_PICKER = 1_000_000;

const CATEGORIAS_DO_PICKER = ["imovel", "auto", "moto"] as const;

const TETO_DE_TEXTO = 200;

type ResultadoDaValidacao =
	| { ok: true; payload: Record<string, unknown> }
	| { ok: false; erro: string };

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
	return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function textoUtil(valor: unknown): string | null {
	if (typeof valor !== "string") return null;
	const limpo = valor.trim();
	return limpo.length === 0 ? null : limpo.slice(0, TETO_DE_TEXTO);
}

function ehNumero(valor: unknown): valor is number {
	return typeof valor === "number" && Number.isFinite(valor);
}

function recusa(erro: string): ResultadoDaValidacao {
	return { ok: false, erro };
}

/** Destino de um tipo de card, por string (o modelo manda string). */
export function destinoDoCard(tipo: string): DestinoDoCard | undefined {
	return (DESTINO_DOS_CARDS as Record<string, DestinoDoCard | undefined>)[tipo];
}

function recusaDeTipo(tipo: string): ResultadoDaValidacao {
	const destino = destinoDoCard(tipo);
	if (destino?.classe === "fora-do-motor") {
		return recusa(
			`Card NÃO mostrado: "${tipo}" não sai do turno. ${destino.motivo} Diga o que precisa em texto e siga a conversa.`,
		);
	}
	if (destino?.classe === "emitivel") {
		return recusa(
			`Card NÃO mostrado: "${tipo}" não é card de escolha. Card com número sai de dado de tool — use buscar_cartas ou fazer_proposta e ele aparece sozinho. Os tipos aceitos em mostrar_card são ${TIPOS_DE_ESCOLHA.join(", ")}.`,
		);
	}
	return recusa(
		`Card NÃO mostrado: "${tipo}" não é um card conhecido. Os tipos de escolha são ${TIPOS_DE_ESCOLHA.join(", ")}; os de oferta saem de buscar_cartas/fazer_proposta.`,
	);
}

function validarQuickReply(payload: unknown): ResultadoDaValidacao {
	if (!ehObjeto(payload)) {
		return recusa("Card NÃO mostrado: quick_reply precisa de payload { options: [...] }.");
	}
	const bruto = payload.options;
	if (!Array.isArray(bruto) || bruto.length === 0) {
		return recusa(
			'Card NÃO mostrado: `options` vazio. Escreva de 1 a 4 opções, cada uma com `label` (o texto do botão, ex.: "Até 80 mil").',
		);
	}
	if (bruto.length > MAX_OPCOES_NO_CARD) {
		return recusa(
			`Card NÃO mostrado: quick_reply aceita no máximo ${MAX_OPCOES_NO_CARD} opções — card é decisão, não menu. Ofereça as demais na conversa.`,
		);
	}
	const options: Array<Record<string, unknown>> = [];
	for (const [indice, opcao] of bruto.entries()) {
		if (!ehObjeto(opcao)) {
			return recusa(`Card NÃO mostrado: a opção ${indice + 1} de quick_reply não é um objeto.`);
		}
		const label = textoUtil(opcao.label);
		if (!label) {
			return recusa(
				`Card NÃO mostrado: a opção ${indice + 1} de quick_reply está sem \`label\` — é ele que vira o botão.`,
			);
		}
		const normalizada: Record<string, unknown> = { label };
		const value = textoUtil(opcao.value);
		if (value) normalizada.value = value;
		const emoji = textoUtil(opcao.emoji);
		if (emoji) normalizada.emoji = emoji;
		options.push(normalizada);
	}
	return { ok: true, payload: { options } };
}

function validarValuePicker(payload: unknown): ResultadoDaValidacao {
	if (!ehObjeto(payload)) {
		return recusa(
			"Card NÃO mostrado: value_picker precisa de payload { category, fields: [...] }.",
		);
	}
	const categoria = payload.category;
	if (!CATEGORIAS_DO_PICKER.includes(categoria as (typeof CATEGORIAS_DO_PICKER)[number])) {
		return recusa(
			`Card NÃO mostrado: \`category\` de value_picker tem que ser ${CATEGORIAS_DO_PICKER.join(", ")} — não existe faixa de valor para "${String(categoria)}".`,
		);
	}
	const bruto = payload.fields;
	if (!Array.isArray(bruto) || bruto.length === 0) {
		return recusa(
			"Card NÃO mostrado: `fields` vazio. Escreva de 1 a 4 faixas, cada uma com `id`, `label`, `min`, `max` e `default`.",
		);
	}
	if (bruto.length > MAX_OPCOES_NO_CARD) {
		return recusa(
			`Card NÃO mostrado: value_picker aceita no máximo ${MAX_OPCOES_NO_CARD} campos — card é decisão, não menu.`,
		);
	}
	const fields: Array<Record<string, unknown>> = [];
	for (const [indice, campo] of bruto.entries()) {
		const onde = `o campo ${indice + 1} de value_picker`;
		if (!ehObjeto(campo)) return recusa(`Card NÃO mostrado: ${onde} não é um objeto.`);
		const id = textoUtil(campo.id);
		if (!id) return recusa(`Card NÃO mostrado: ${onde} está sem \`id\`.`);
		const label = textoUtil(campo.label);
		if (!label) return recusa(`Card NÃO mostrado: ${onde} está sem \`label\`.`);
		if (!ehNumero(campo.min) || campo.min <= 0) {
			return recusa(`Card NÃO mostrado: \`min\` de ${onde} tem que ser um número maior que zero.`);
		}
		if (!ehNumero(campo.max) || campo.max <= campo.min) {
			return recusa(`Card NÃO mostrado: \`max\` de ${onde} tem que ser maior que \`min\`.`);
		}
		if (campo.max > MAX_VALOR_DO_PICKER) {
			return recusa(
				`Card NÃO mostrado: \`max\` de ${onde} passa de ${MAX_VALOR_DO_PICKER} — essa faixa não é pergunta de consórcio.`,
			);
		}
		if (!ehNumero(campo.default) || campo.default < campo.min || campo.default > campo.max) {
			return recusa(
				`Card NÃO mostrado: \`default\` de ${onde} tem que estar entre ${campo.min} e ${campo.max}.`,
			);
		}
		// `step` ausente vira 0: o componente cai no passo padrão (VALUE_STEP).
		const step = ehNumero(campo.step) && campo.step > 0 ? campo.step : 0;
		const normalizado: Record<string, unknown> = {
			id,
			label,
			min: campo.min,
			max: campo.max,
			step,
			default: campo.default,
		};
		const sufixo = textoUtil(campo.suffix);
		if (sufixo) normalizado.suffix = sufixo;
		if (campo.format === "currency" || campo.format === "months") normalizado.format = campo.format;
		fields.push(normalizado);
	}
	return { ok: true, payload: { category: categoria, fields } };
}

function validarTopicPicker(payload: unknown): ResultadoDaValidacao {
	if (!ehObjeto(payload)) {
		return recusa(
			"Card NÃO mostrado: topic_picker precisa de payload { topics: [...], includeBackButton: true|false }.",
		);
	}
	const bruto = payload.topics;
	if (!Array.isArray(bruto) || bruto.length === 0) {
		return recusa("Card NÃO mostrado: `topics` vazio. Escreva de 1 a 4 tópicos.");
	}
	if (bruto.length > MAX_OPCOES_NO_CARD) {
		return recusa(
			`Card NÃO mostrado: topic_picker aceita no máximo ${MAX_OPCOES_NO_CARD} tópicos — card é decisão, não menu.`,
		);
	}
	const topics: string[] = [];
	for (const [indice, topico] of bruto.entries()) {
		const texto = textoUtil(topico);
		if (!texto) return recusa(`Card NÃO mostrado: o tópico ${indice + 1} está vazio.`);
		topics.push(texto);
	}
	if (typeof payload.includeBackButton !== "boolean") {
		return recusa(
			"Card NÃO mostrado: topic_picker exige `includeBackButton` (true quando o cliente pode voltar à pergunta anterior e false quando não).",
		);
	}
	const validado: Record<string, unknown> = {
		topics,
		includeBackButton: payload.includeBackButton,
	};
	const prompt = textoUtil(payload.prompt);
	if (prompt) validado.prompt = prompt;
	return { ok: true, payload: validado };
}

/** Valida o payload de UM card de escolha e devolve o payload já normalizado
 * (só as chaves que o componente lê — `groupId`/`replyId` são do servidor). */
export function validarCardDeEscolha(tipo: string, payload: unknown): ResultadoDaValidacao {
	switch (tipo) {
		case "quick_reply":
			return validarQuickReply(payload);
		case "value_picker":
			return validarValuePicker(payload);
		case "topic_picker":
			return validarTopicPicker(payload);
		default:
			return recusaDeTipo(tipo);
	}
}

/** Porta única do `mostrar_card`: aprova o card de escolha ou devolve a recusa
 * em texto, que é o que ensina o modelo a pedir o certo. */
export function cardDeEscolha(
	tipo: string,
	payload: unknown,
):
	| { ok: true; card: { type: ArtifactType; payload: Record<string, unknown> } }
	| { ok: false; erro: string } {
	const validado = validarCardDeEscolha(tipo, payload);
	if (!validado.ok) return validado;
	return { ok: true, card: { type: tipo as ArtifactType, payload: validado.payload } };
}

// ─────────────────────────────────────────────────────────────────────────────
// OS CARDS DE FATO — payload montado do dado real, nunca do que o modelo disse.
// ─────────────────────────────────────────────────────────────────────────────

/** Os emitíveis (17). Derivado da classe declarada em `DESTINO_DOS_CARDS`: card
 * novo nasce aqui sem ninguém redigitar lista. */
export type TipoEmitivel = {
	[K in keyof typeof DESTINO_DOS_CARDS]: (typeof DESTINO_DOS_CARDS)[K] extends {
		classe: "emitivel";
	}
		? K
		: never;
}[keyof typeof DESTINO_DOS_CARDS];

/** Os 14 de FATO: têm montador. Os 3 de ESCOLHA não têm — o payload deles é a
 * pergunta escrita pelo modelo, validada em `cardDeEscolha`. */
export type TipoDeFato = Exclude<TipoEmitivel, TipoDeEscolha>;

/** O que o modelo pode pedir ALÉM do tipo. `groupId` é cópia literal do id que
 * `buscar_cartas` devolveu; `lancePercent`/`initialTargetMonth` são parâmetros
 * de CENÁRIO (a mesma classe de pergunta do dial: "e se eu der 30%?"), não
 * número de oferta. Nada mais é lido do payload do modelo. */
export type RefDeCard = {
	groupId?: string;
	lancePercent?: number;
	initialTargetMonth?: number;
};

/** O que o cliente DECLAROU na qualificação — prazo desejado e lance que ele tem.
 * É o perfil que o `contemplation_dial` usa como default (FIX-C5): sem ele o
 * mês-alvo cai no fallback de 6 e o lance declarado some do card. */
export type PerfilDeclarado = { prazoMeses?: number; lanceValue?: number };

/** Tudo que um card de fato pode consultar. Quem monta é o servidor; o modelo
 * nunca escreve aqui. */
export type ContextoDeFato = {
	conversationId: string;
	channel: "web" | "whatsapp";
	nomeDoCliente: string | null;
	/** Cartas REAIS que o turno revelou (o que `buscar_cartas` pôs na tela). */
	grupos: Map<string, GroupSummary>;
	/** Telefone MASCARADO quando houver — NUNCA em claro. */
	telefoneMascarado?: string | null;
	/** CPF já mascarado (`529.•••.•••-25`) — o número em claro não chega aqui. */
	cpfMascarado?: string | null;
	/** Valor de crédito que o cliente PEDIU (teto da busca) — alimenta o aviso
	 * "você pediu X, a carta é Y" do `recommendation_card`. */
	valorPedido?: number;
	/** O que o cliente precisa RECEBER (preço do bem) — é a conta do
	 * `embedded_bid`: a carta tem que ser MAIOR que o bem. */
	valorDoBem?: number;
	/** Perfil declarado na qualificação (prazo e lance do cliente). */
	perfilDeclarado?: PerfilDeclarado;
	/** Logos das administradoras (fallback gracioso quando ausente). */
	logos?: ReadonlyMap<string, string>;
	/** Simulação da carta em foco. Preenchida por `montarCardDeFato` antes de
	 * despachar (o adapter é assíncrono; os montadores são síncronos). */
	simulacao?: QuotaSimulation | null;
};

export type ResultadoDoMontador =
	| { ok: true; card: { type: ArtifactType; payload: Record<string, unknown> } }
	| { ok: false; motivo: string };

type MontadorDeCard = (ctx: ContextoDeFato, ref: RefDeCard) => ResultadoDoMontador;

const SCARCITY_DISCLAIMER = "Número estimado, apenas indicativo.";

const TWO_PATHS_DISCLAIMER =
	"Nenhuma das opções é garantia de contemplação — a decisão é sua, não tem certo ou errado.";

// O disclaimer do embutido não é enfeite: o card SEMPRE diz que o crédito
// recebido diminui — é o que separa consultoria de venda enganosa.
const EMBEDDED_BID_DISCLAIMER =
	"O embutido sai da carta, então o crédito recebido diminui — mas ele antecipa a contemplação, " +
	"e o lance (embutido + eventual dinheiro) amortiza o saldo depois dela: a parcela segue normal " +
	"até contemplar e cai na sequência. Por isso, mesmo recebendo menos crédito agora, ainda pode " +
	"valer a pena. Estimativa a partir dos dados da oferta.";

/** Teto de embutido quando a oferta em foco não traz o dela (a Bevi aceita
 * 30% e 50%; 30 é o que o adapter assume). */
const DEFAULT_MAX_EMBUTIDO_PCT = 30;

/** Teto de SANIDADE do embutido: o produto negocia 30% e 50%, e acima de 70% a
 * conta perde sentido (`cartaNecessaria` vira quase 100× o bem porque o embutido
 * já comeu quase toda a carta). Acima disto, vale o default. */
const MAX_EMBUTIDO_PCT = 70;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Vagas restantes do card de escassez: PLACEBO comercial 1-6 (ADR
 * 2026-07-09, D3), DETERMINÍSTICO pelo id do grupo — nunca `Math.random()`,
 * senão "restam 3" vira "restam 5" no refresh e a credibilidade morre. */
export function stableSlotFromId(id: string): number {
	let hash = 5381;
	for (let i = 0; i < id.length; i++) {
		hash = (hash * 33) ^ id.charCodeAt(i);
	}
	return 1 + (Math.abs(hash) % 6);
}

function indiceDosGrupos(grupos: Map<string, GroupSummary>): RevealGroupIndex {
	const index: RevealGroupIndex = new Map();
	for (const [id, grupo] of grupos) index.set(id, grupo);
	return index;
}

type GrupoResolvido =
	| { ok: true; grupo: GroupSummary; index: RevealGroupIndex }
	| { ok: false; motivo: string };

const SEM_CARTA =
	"para esse card eu preciso de uma carta já buscada nesta conversa — chame buscar_cartas e use o id que ela devolver.";

/** Qual carta este card usa. Sem busca no turno não há card de fato: nenhuma
 * das duas fontes possíveis (carta, proposta) existe ainda. */
function resolverGrupo(ctx: ContextoDeFato, ref: RefDeCard): GrupoResolvido {
	if (ctx.grupos.size === 0) return { ok: false, motivo: SEM_CARTA };
	const index = indiceDosGrupos(ctx.grupos);
	const id = ref.groupId;
	if (!id) {
		if (ctx.grupos.size === 1) {
			const unico = [...ctx.grupos.values()][0];
			if (unico) return { ok: true, grupo: unico, index };
		}
		const ids = [...ctx.grupos.keys()].join(", ");
		return {
			ok: false,
			motivo: `tem mais de uma carta na tela e esse card é de UMA só — me diga qual pelo groupId (${ids}).`,
		};
	}
	const grupo = ctx.grupos.get(id);
	if (!grupo) {
		const ids = [...ctx.grupos.keys()].join(", ");
		return {
			ok: false,
			motivo: `o id "${id}" não está entre as cartas que o cliente está vendo nesta conversa (${ids}). Copie o id literal de buscar_cartas.`,
		};
	}
	return { ok: true, grupo, index };
}

function pctDoEmbutido(bruto: number | undefined): number {
	if (typeof bruto !== "number" || !Number.isFinite(bruto)) return DEFAULT_MAX_EMBUTIDO_PCT;
	if (bruto <= 0 || bruto > MAX_EMBUTIDO_PCT) return DEFAULT_MAX_EMBUTIDO_PCT;
	return round2(bruto);
}

/**
 * OS 14 MONTADORES. Cada um: resolve a carta real, monta o payload por
 * ALLOWLIST (nada de spread do que o modelo mandou) e devolve `ok: false` com
 * motivo em pt-BR quando falta fonte. Nunca lança — o modelo lê o motivo e
 * reage, que é o ponto.
 */
export const MONTADORES_DE_CARD: Record<TipoDeFato, MontadorDeCard> = {
	group_card: (ctx, ref) => {
		const r = resolverGrupo(ctx, ref);
		if (!r.ok) return r;
		return {
			ok: true,
			card: {
				type: "group_card",
				// A categoria vai junto no input porque `coerceRevealCota` só a copia
				// de lá, e `GroupCardPayload.category` é obrigatório: sem ela o card
				// de imóvel renderizava o selo "Automóvel" (CATEGORY_STYLES[undefined]).
				payload: coerceRevealCota(
					{ id: r.grupo.id, category: r.grupo.category },
					r.grupo,
					ctx.logos,
				),
			},
		};
	},

	recommendation_card: (ctx, ref) => {
		const r = resolverGrupo(ctx, ref);
		if (!r.ok) return r;
		// O score do hero é recalcular sobre a carta REAL. `budget` = a própria
		// parcela (o cliente está olhando esta oferta, não um orçamento inventado)
		// e `creditMax` = o valor que ele pediu, quando o turno sabe.
		const scoringInput = {
			budget: r.grupo.monthlyPayment,
			desiredTermMonths: 0,
			...(ctx.valorPedido && ctx.valorPedido > 0 ? { creditMax: ctx.valorPedido } : {}),
		};
		return {
			ok: true,
			card: {
				type: "recommendation_card",
				payload: buildRecommendationCardFromRevealGroup(
					r.grupo,
					ctx.logos,
					ctx.valorPedido,
					scoringInput,
				),
			},
		};
	},

	comparison_table: (ctx) => {
		if (ctx.grupos.size === 0) return { ok: false, motivo: SEM_CARTA };
		const payload = buildComparisonTableFromRevealGroups(
			indiceDosGrupos(ctx.grupos),
			ctx.logos,
		) as { groups?: unknown[] };
		if (!Array.isArray(payload.groups) || payload.groups.length === 0) {
			return {
				ok: false,
				motivo:
					"a tabela comparativa precisa de pelo menos uma carta com número completo na tela — busque de novo.",
			};
		}
		return { ok: true, card: { type: "comparison_table", payload } };
	},

	simulation_result: (ctx, ref) => {
		const r = resolverGrupo(ctx, ref);
		if (!r.ok) return r;
		const sim = ctx.simulacao;
		if (!sim) {
			return {
				ok: false,
				motivo:
					"a simulação dessa carta não voltou da administradora agora — ofereça tentar de novo em vez de estimar.",
			};
		}
		return {
			ok: true,
			card: {
				type: "simulation_result",
				payload: {
					groupId: r.grupo.id,
					administradora: r.grupo.administradora,
					category: sim.category,
					creditValue: sim.creditValue,
					monthlyPayment: sim.monthlyPayment,
					adminFee: sim.adminFee,
					reserveFund: sim.reserveFund,
					insurance: sim.insurance,
					totalCost: sim.totalCost,
					termMonths: sim.termMonths,
					effectiveRate: sim.effectiveRate,
					lanceScenario: {
						lancePercent: sim.lanceScenario.lancePercent,
						expectedTermMonths: sim.lanceScenario.expectedTermMonths,
					},
					embeddedBid: {
						percent: sim.embeddedBid.percent,
						embeddedBidValue: sim.embeddedBid.embeddedBidValue,
						receivedCredit: sim.embeddedBid.receivedCredit,
						necessaryBidToContemplate: sim.embeddedBid.necessaryBidToContemplate,
					},
					expectedAdjustment: {
						index: sim.expectedAdjustment.index,
						annualPercent: sim.expectedAdjustment.annualPercent,
					},
				},
			},
		};
	},

	financing_comparison: (ctx, ref) => {
		const r = resolverGrupo(ctx, ref);
		if (!r.ok) return r;
		const categoria = r.grupo.category;
		const comparacao = compareWithFinancing({
			creditValue: r.grupo.creditValue,
			termMonths: r.grupo.termMonths,
			category: categoria,
			consorcioMonthlyPayment: r.grupo.monthlyPayment,
			// Mesma convenção do documento da proposta: o custo total do consórcio
			// é a parcela que ele paga × o prazo real da carta.
			consorcioTotalCost: round2(r.grupo.monthlyPayment * r.grupo.termMonths),
		});
		return {
			ok: true,
			card: {
				type: "financing_comparison",
				payload: {
					category: categoria,
					creditValue: r.grupo.creditValue,
					termMonths: r.grupo.termMonths,
					...comparacao,
				},
			},
		};
	},

	contemplation_dial: (ctx, ref) => {
		const r = resolverGrupo(ctx, ref);
		if (!r.ok) return r;
		const snapshot = offerSnapshotFromArtifact({
			administradora: r.grupo.administradora,
			category: r.grupo.category,
			creditValue: r.grupo.creditValue,
			monthlyPayment: r.grupo.monthlyPayment,
			termMonths: r.grupo.termMonths,
			availableSlots: r.grupo.availableSlots,
			groupId: r.grupo.id,
			...(typeof r.grupo.avgBidValue === "number" ? { avgBidValue: r.grupo.avgBidValue } : {}),
		});
		if (!snapshot) {
			return {
				ok: false,
				motivo:
					"essa carta veio sem os três números da oferta (carta, parcela, prazo) — sem eles o simulador mentiria.",
			};
		}
		const entrada: Record<string, unknown> = {};
		if (typeof ref.initialTargetMonth === "number") {
			entrada.initialTargetMonth = ref.initialTargetMonth;
		}
		return {
			ok: true,
			card: {
				type: "contemplation_dial",
				// 3º argumento é o perfil DECLARADO (FIX-C5): sem ele o dial ignora o
				// prazo e o lance que o cliente já contou na qualificação.
				payload: coerceDialPayload(entrada, snapshot, ctx.perfilDeclarado),
			},
		};
	},

	embedded_bid: (ctx, ref) => {
		const r = resolverGrupo(ctx, ref);
		if (!r.ok) return r;
		const pct = pctDoEmbutido(ref.lancePercent);
		const creditValue = r.grupo.creditValue;
		const embeddedBidValue = round2((pct / 100) * creditValue);
		const valorDoBem = ctx.valorDoBem;
		return {
			ok: true,
			card: {
				type: "embedded_bid",
				payload: {
					maxEmbutidoPct: pct,
					creditValue,
					embeddedBidValue,
					netCredit: round2(creditValue - embeddedBidValue),
					// O embutido sai DA PRÓPRIA carta: quem quer receber R$ X não deve
					// mirar uma carta de R$ X, e sim X / (1 - pct) — senão contempla e
					// falta dinheiro para comprar o bem.
					...(valorDoBem && valorDoBem > 0
						? { valorDoBem, cartaNecessaria: Math.round(valorDoBem / (1 - pct / 100)) }
						: {}),
					disclaimer: EMBEDDED_BID_DISCLAIMER,
				},
			},
		};
	},

	two_paths: (ctx, ref) => {
		const r = resolverGrupo(ctx, ref);
		if (!r.ok) return r;
		return {
			ok: true,
			card: {
				type: "two_paths",
				payload: {
					monthlyPayment: r.grupo.monthlyPayment,
					administradora: r.grupo.administradora,
					disclaimer: TWO_PATHS_DISCLAIMER,
				},
			},
		};
	},

	scarcity: (ctx, ref) => {
		const r = resolverGrupo(ctx, ref);
		if (!r.ok) return r;
		return {
			ok: true,
			card: {
				type: "scarcity",
				payload: {
					groupCode: r.grupo.grupo ?? r.grupo.id,
					administradora: r.grupo.administradora,
					availableSlots: stableSlotFromId(r.grupo.id),
					disclaimer: SCARCITY_DISCLAIMER,
				},
			},
		};
	},

	lead_form: (ctx) => ({
		ok: true,
		card: {
			type: "lead_form",
			payload: {
				conversationId: ctx.conversationId,
				...(ctx.nomeDoCliente ? { prefilledName: ctx.nomeDoCliente } : {}),
			},
		},
	}),

	contract_form: (ctx, ref) => {
		// O CPF aqui é SÓ máscara; o formulário coleta o resto e o submit resolve a
		// identidade cifrada no servidor (`loadIdentity`).
		const r = resolverGrupo(ctx, ref);
		return {
			ok: true,
			card: {
				type: "contract_form",
				payload: {
					conversationId: ctx.conversationId,
					...(r.ok ? { administradora: r.grupo.administradora } : {}),
					identityOnFile: Boolean(ctx.cpfMascarado),
					...(ctx.cpfMascarado ? { prefilledCpfMasked: ctx.cpfMascarado } : {}),
				},
			},
		};
	},

	whatsapp_optin: (ctx) => ({
		ok: true,
		card: {
			type: "whatsapp_optin",
			payload: {
				conversationId: ctx.conversationId,
				...(ctx.telefoneMascarado ? { knownPhone: ctx.telefoneMascarado } : {}),
			},
		},
	}),

	decision_prompt: (ctx, ref) => {
		const r = resolverGrupo(ctx, ref);
		if (!r.ok) return r;
		return {
			ok: true,
			card: {
				type: "decision_prompt",
				payload: { administradora: r.grupo.administradora },
			},
		};
	},

	// `real_offer` carrega `proposalId` e a URL da proposta: só existe depois de
	// `fazer_proposta` ter chamado a administradora. Aqui não há o que montar.
	real_offer: () => ({
		ok: false,
		motivo:
			"a proposta real nasce de fazer_proposta (é ela que tem o id e a URL da proposta) e aparece sozinha quando a tool roda.",
	}),
};

export type DepsDoCardDeFato = {
	/** Fronteira da simulação: adapter real em produção, injetada no teste. */
	simularCota?: (params: { groupId: string; creditValue: number }) => Promise<QuotaSimulation>;
	/** Logos das administradoras (opcional — ausente, o card cai no fallback). */
	logos?: ReadonlyMap<string, string>;
};

/**
 * A porta ÚNICA do card de FATO: valida o tipo, busca o que é assíncrono
 * (a simulação) e despacha para o montador. Sem fonte real → `ok: false` com
 * motivo em pt-BR. Nunca lança: exceção aqui viraria turno mudo.
 */
export async function montarCardDeFato(
	tipo: string,
	ctxDeFato: ContextoDeFato,
	ref: RefDeCard = {},
	deps: DepsDoCardDeFato = {},
): Promise<
	| { ok: true; card: { type: ArtifactType; payload: Record<string, unknown> } }
	| { ok: false; erro: string }
> {
	const destino = destinoDoCard(tipo);
	if (destino?.classe !== "emitivel" || destino.origem !== "fato") {
		const porque =
			destino?.classe === "fora-do-motor"
				? ` ${destino.motivo}`
				: destino?.classe === "emitivel"
					? " Ele é card de ESCOLHA: o payload é seu, escrito e validado na hora."
					: ` Os cards de escolha são ${TIPOS_DE_ESCOLHA.join(", ")}.`;
		return { ok: false, erro: `Card NÃO mostrado: "${tipo}" não é card de FATO.${porque}` };
	}

	const ctx: ContextoDeFato = { ...ctxDeFato, logos: deps.logos ?? ctxDeFato.logos };

	if (tipo === "simulation_result") {
		const r = resolverGrupo(ctx, ref);
		if (!r.ok) return { ok: false, erro: `Card NÃO mostrado: ${r.motivo}` };
		if (!deps.simularCota) {
			return {
				ok: false,
				erro: "Card NÃO mostrado: a simulação da carta não está disponível agora — ofereça tentar de novo em instantes.",
			};
		}
		try {
			ctx.simulacao = await deps.simularCota({
				groupId: r.grupo.id,
				creditValue: r.grupo.creditValue,
			});
		} catch (erro) {
			console.error("[montarCardDeFato] simulação falhou:", erro);
			return {
				ok: false,
				erro: "Card NÃO mostrado: a administradora não devolveu a simulação agora. Diga que a simulação não voltou e proponha tentar de novo — não estime números.",
			};
		}
	}

	const resultado = MONTADORES_DE_CARD[tipo as TipoDeFato](ctx, ref);
	if (!resultado.ok) return { ok: false, erro: `Card NÃO mostrado: ${resultado.motivo}` };
	return resultado;
}
