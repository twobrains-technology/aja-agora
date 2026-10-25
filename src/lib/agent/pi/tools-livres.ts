// AS TOOLS DO VENDEDOR LIVRE — quatro ações e uma porta de card.
//
// O desenho continua o oposto do funil: não existe tool que monta card de
// OFERTA. O modelo decide QUANDO buscar, QUANDO perguntar e QUANDO fechar; o
// card de número aparece porque a tool rodou, montado pelo resultado dela.
//
// A única exceção é `mostrar_card`, e ela tem duas portas: card de ESCOLHA
// (pergunta + opções que o modelo escreveu, validadas em `cards-livres.ts`) e
// card de FATO, cujo payload é montado no SERVIDOR a partir das cartas reais que
// `buscar_cartas` trouxe (`montarCardDeFato`). Número de oferta pedido pelo
// modelo continua impossível: do payload dele só se lê `groupId`, `lancePercent`
// e `initialTargetMonth`.
//
//  · `buscar_cartas` usa SÓ a identidade da casa (vitrine). Buscar no nome do
//    cliente abriria proposta real na loja compartilhada antes de ele decidir.
//  · `fazer_proposta` usa SÓ a identidade do cliente, cifrada no servidor. O
//    CPF nunca chega ao modelo: ele vê `[CPF recebido e guardado]`.
//  · `falar_com_humano` emite o evento `handoff` (o funil só ligava uma flag, e
//    o botão "Sim, conectar" do WhatsApp nunca aparecia).
//  · `mostrar_card` apresenta a pergunta com opções clicáveis e os cards de FATO
//    (escassez, dial, comparativo…) montados das cartas reais do turno.

import { tool } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { BeviSelfContractAdapter } from "@/lib/adapters/bevi/bevi-self-contract-adapter";
import { BeviSelfContractClient } from "@/lib/adapters/bevi/self-contract-client";
import type { GroupSummary, QuotaSimulation } from "@/lib/adapters/types";
import { createLeadFromConversation } from "@/lib/admin/lead-stage-tracker";
import { listShownOffersForConversation } from "@/lib/agent/orchestrator/choose-offer";
import {
	buildComparisonTableFromRevealGroups,
	indexRevealGroups,
	type RevealGroupIndex,
} from "@/lib/agent/orchestrator/recommendation-payload";
import type { Category, ConversationMetadata } from "@/lib/agent/personas";
import {
	cardDeEscolha,
	destinoDoCard,
	montarCardDeFato,
	type PerfilDeclarado,
	type RefDeCard,
} from "@/lib/agent/pi/cards-livres";
import { abrirCasoNaMesa, nomeNaFala } from "@/lib/agent/pi/handoff";
import { resolverAceiteLgpd } from "@/lib/agent/pi/lgpd";
import { pisoPadraoPara } from "@/lib/agent/qualify-answers";
import { type ClosingItem, realOfferPresentation } from "@/lib/bevi/closing-presentation";
import {
	administradoraConflictsWithRegisteredProposal,
	ancorarOfertaReal,
	buildStartContractInput,
} from "@/lib/bevi/contract-input";
import { prefsFromMeta } from "@/lib/bevi/discovery-session";
import { fechoJaConcluido, type StartContractInput, startContract } from "@/lib/bevi/fulfillment";
import { identidadeDeVitrine, vitrineDisponivel } from "@/lib/bevi/identidade-vitrine";
import { getLatestBeviProposal } from "@/lib/bevi/proposal-repo";
import type { ArtifactType } from "@/lib/chat/types";
import { loadAdministradoraLogoMap } from "@/lib/consorcio/administradora-logo-repo";
import { attachContact } from "@/lib/contacts";
import { loadIdentity } from "@/lib/conversation/identity";
import { loadConversationHistory } from "@/lib/conversation/messages";
import { persistMeta, reloadMeta } from "@/lib/conversation/meta";
import { saveContactName } from "@/lib/leads/contact-capture";
import { celularDeFechamento } from "@/lib/whatsapp/identify-capture";

/** Os parâmetros da busca na Bevi. Regra herdada da main (`alvoDeBusca`, FIX-382):
 * havendo VALOR do bem, a busca é por valor; parcela só entra quando o cliente
 * falou só em parcela. Com os dois, a parcela NÃO vence — ela vai para o resumo
 * para o modelo comparar com a carta. Embutido: a carta tem que ser MAIOR que o
 * bem, senão o cliente contempla com 70% do valor e falta dinheiro. */
export function paramsDaBusca(args: {
	categoria: Category;
	valorDoBem?: number;
	parcelaMensal?: number;
	usaraLanceEmbutido?: boolean;
}): {
	params: { category: Category; parcelaAlvo?: number; creditMin?: number; creditMax?: number };
	creditMax?: number;
	creditMin?: number;
} {
	const bem = args.valorDoBem;
	if (!bem && args.parcelaMensal) {
		return { params: { category: args.categoria, parcelaAlvo: args.parcelaMensal } };
	}
	const alvoComEmbutido =
		args.usaraLanceEmbutido && bem
			? Math.round(bem / (1 - EMBUTIDO_DEFAULT_PERCENT / 100))
			: undefined;
	const creditMax = alvoComEmbutido ?? bem;
	const creditMin = alvoComEmbutido
		? Math.round(alvoComEmbutido * PISO_DO_EMBUTIDO)
		: creditMax
			? pisoPadraoPara(creditMax)
			: undefined;
	return { params: { category: args.categoria, creditMin, creditMax }, creditMax, creditMin };
}

export type CartaLivre = {
	groupId: string;
	administradora: string;
	carta: number;
	parcela: number;
	prazoMeses: number;
	contempladosMes?: number;
};

export type CardLivre = {
	type: ArtifactType;
	payload: Record<string, unknown>;
};

export type ContextoDasTools = {
	conversationId: string;
	channel: "web" | "whatsapp";
	/** waId da conversa — no simulador é `SIM-<uuid>`, e isso muda o celular do fechamento. */
	waId?: string | null;
	/** Fala do cliente neste turno (o nome só se grava se foi dito nela). */
	userText: string | null;
	/** Nome que a conversa já tem — pré-preenche o formulário de lead. */
	nomeDoCliente: string | null;
	/** Telefone e CPF MASCARADOS (nunca em claro) — os cards de estado só levam
	 * a máscara; o submit resolve a identidade cifrada no servidor. */
	telefoneMascarado?: string | null;
	cpfMascarado?: string | null;
	/** Fala que o agente já escreveu NESTE turno, antes da tool: o aceite da LGPD é
	 * conferido nela também, porque o aviso pode ser dado no mesmo turno do fechamento. */
	textoDoTurno?: string;
	/** Onde a tool põe o card que o driver vai emitir depois de persistir. */
	cards: CardLivre[];
	/** Texto do fecho (copy de produção) que acompanha o card. */
	falasDoFecho: string[];
	/** Cartas que foram para o CARD neste turno (não as 12 da busca crua). É
	 * contra elas que a proposta é ancorada — o modelo só pode escolher o que o
	 * cliente está vendo. */
	cartasNaTela: CartaLivre[];
	/** Grupos REAIS que `buscar_cartas` pôs na tela neste turno, por id — a fonte
	 * única dos cards de FATO. Vazio enquanto a busca não roda. */
	gruposRevelados: Map<string, GroupSummary>;
	/** Perfil que o cliente DECLAROU na qualificação (prazo e lance) — default do
	 * `contemplation_dial`. Preenchido pelo turno com `qualifyAnswers`. */
	perfilDeclarado?: PerfilDeclarado;
	/** Setado por `falar_com_humano`. */
	pediuHumano: boolean;
	/** O caso FOI aberto neste turno — o balão que sai é a linha do handoff, não a prosa do modelo. */
	casoAbertoNesteTurno?: () => void;
	/** Setado por `buscar_cartas` — o driver grava na meta. */
	estadoDepoisDaBusca: {
		categoria?: Category;
		creditMax?: number;
		creditMin?: number;
		parcelaAlvo?: number;
		valorDoBemAlvo?: number;
		lanceEmbutido?: boolean;
	} | null;
};

const PISO_DO_EMBUTIDO = 0.9;
const EMBUTIDO_DEFAULT_PERCENT = 30;

/** A carta que o cliente ESCOLHEU — do turno atual ou do que já foi mostrado
 * nesta conversa (`listShownOffersForConversation`). */
export type OfertaDoFecho = {
	groupId: string;
	administradora?: string | null;
	creditValue?: number | null;
	termMonths?: number | null;
};

/** A meta que o builder do contrato vai ler: a cota ESCOLHIDA AGORA vira
 * `contractOffer`, junto do aceite da LGPD.
 *
 * O `contractOffer` é a âncora do contrato (`buildStartContractInput`: `valor`,
 * `administradoraPreferida`, `prazoPreferido`) — persistir a carta escolhida e
 * depois montar o input com a meta ANTERIOR mandava à Bevi o crédito/prazo da
 * seleção velha. */
export function metaDoFecho(args: {
	meta: ConversationMetadata;
	escolhida: OfertaDoFecho;
	falaDoCliente: string | null;
}): ConversationMetadata {
	return {
		...args.meta,
		contractOffer: {
			administradora: args.escolhida.administradora ?? null,
			creditValue: args.escolhida.creditValue ?? null,
			termMonths: args.escolhida.termMonths ?? null,
		} as ConversationMetadata["contractOffer"],
		lgpdAceite:
			args.meta.lgpdAceite ??
			({
				em: new Date().toISOString(),
				fala: (args.falaDoCliente ?? "").slice(0, 200),
			} as ConversationMetadata["lgpdAceite"]),
	};
}

/** O input do `startContract` do fecho livre.
 *
 * O celular é o que o `celularDeFechamento` VALIDOU/normalizou — nunca o
 * `identity.celular` cru (no simulador ele é um hash; no WhatsApp vem com DDI e
 * formatação). */
export function inputDoFecho(args: {
	meta: ConversationMetadata;
	cpf: string;
	celular: string;
	leadId: string | null;
	registeredAdministradora: string | null;
}): StartContractInput {
	return buildStartContractInput(
		args.meta,
		{ cpf: args.cpf, celular: args.celular, lgpd: true },
		{ leadId: args.leadId, registeredAdministradora: args.registeredAdministradora },
	);
}

/** A meta DEPOIS de a proposta real existir: a cota REAL vira o
 * `recommendedOffer` — é o snapshot que a retomada lê
 * (`workers/retomada.ts:56`); sem ele a retomada diz que o cliente "ainda não
 * viu nenhuma oferta" e puxa a conversa pelo lugar errado.
 *
 * No WhatsApp arma também o estágio `offer-confirm`: é o que faz a confirmação
 * por TEXTO ("sim, pode fechar") finalizar em `confirmOffer`, como o botão do
 * `real_offer` já fazia. */
export function metaDepoisDaProposta(args: {
	meta: ConversationMetadata;
	channel: "web" | "whatsapp";
	offer: Parameters<typeof ancorarOfertaReal>[1];
}): ConversationMetadata {
	return {
		...args.meta,
		...ancorarOfertaReal(args.meta, args.offer),
		...(args.channel === "whatsapp"
			? { contractCollection: { stage: "offer-confirm" as const } }
			: {}),
	};
}

/** O lead da conversa, como os dados que ele precisa carregar. */
export type LeadDoFecho = { id: string; phone: string | null; name: string | null };

export type DepsDoLeadDoFecho = {
	lerLead?: (conversationId: string) => Promise<LeadDoFecho | null>;
	gravarTelefone?: (args: {
		leadId: string;
		conversationId: string;
		phone: string;
		nome: string | null;
	}) => Promise<void>;
	criarLead?: (args: {
		conversationId: string;
		name: string | null;
		phone: string;
	}) => Promise<string>;
};

async function lerLeadDaConversa(conversationId: string): Promise<LeadDoFecho | null> {
	const lead = await db.query.leads.findFirst({
		where: eq(leads.conversationId, conversationId),
		columns: { id: true, phone: true, name: true },
	});
	return lead ?? null;
}

async function gravarTelefoneDoLead(args: {
	leadId: string;
	conversationId: string;
	phone: string;
	nome: string | null;
}): Promise<void> {
	await db
		.update(leads)
		.set({ phone: args.phone, updatedAt: new Date() })
		.where(eq(leads.id, args.leadId));
	// FIX-42: religa o cliente unificado pelo telefone. Não bloqueia o fecho.
	await attachContact({
		conversationId: args.conversationId,
		leadId: args.leadId,
		input: { phone: args.phone, name: args.nome },
	}).catch(() => undefined);
}

async function criarLeadDaConversa(args: {
	conversationId: string;
	name: string | null;
	phone: string;
}): Promise<string> {
	const { leadId } = await createLeadFromConversation({ ...args, email: null });
	return leadId;
}

/** O telefone do lead já é o da identidade? Comparação por DÍGITOS (sem DDI):
 * o lead guarda o que veio do canal (`+55 11 98765-4321`) e o fecho traz o
 * normalizado (`11987654321`) — regravar a cada fecho não muda nada e sujam o
 * registro. */
function digitosDoTelefone(valor: string | null): string {
	const digitos = (valor ?? "").replace(/\D/g, "");
	return digitos.length > 11 && digitos.startsWith("55") ? digitos.slice(2) : digitos;
}

function mesmoTelefone(a: string | null, b: string | null): boolean {
	return digitosDoTelefone(a) === digitosDoTelefone(b);
}

/** O lead da conversa COM o telefone da identidade, criado se ainda não existir.
 *
 * `createBeviProposal` só move a raia (`qualificado`→`proposta_enviada`) quando
 * recebe `leadId`; sem lead a proposta nasce ÓRFÃ — medido no dev: 6/6
 * `bevi_proposals` das últimas 24 h sem `lead_id`, e o poll não promove CRM,
 * Purchase nem transbordo.
 *
 * `conversations.waId` NÃO é tocado de propósito (é o que `saveContactWhatsapp`
 * faz): no simulador ele é `SIM-<uuid>` e trocá-lo pelo celular de fechamento
 * quebraria a própria sessão. */
export async function garantirLeadDoFecho(
	args: { conversationId: string; celular: string; nome: string | null },
	deps: DepsDoLeadDoFecho = {},
): Promise<string | null> {
	const lerLead = deps.lerLead ?? lerLeadDaConversa;
	const gravarTelefone = deps.gravarTelefone ?? gravarTelefoneDoLead;
	const criarLead = deps.criarLead ?? criarLeadDaConversa;
	try {
		const lead = await lerLead(args.conversationId);
		if (lead) {
			if (!mesmoTelefone(lead.phone, args.celular)) {
				await gravarTelefone({
					leadId: lead.id,
					conversationId: args.conversationId,
					phone: args.celular,
					nome: lead.name ?? args.nome,
				});
			}
			return lead.id;
		}
		return await criarLead({
			conversationId: args.conversationId,
			name: args.nome,
			phone: args.celular,
		});
	} catch (erro) {
		// Sem lead a proposta ainda vale (é o cliente fechando); o que se perde é a
		// raia. Logado para não virar defeito silencioso.
		console.error("[fazer_proposta] lead da conversa não resolvido:", erro);
		return null;
	}
}

const CATEGORIAS = ["auto", "moto", "imovel", "servicos"] as const;

export type DepsDasToolsLivres = {
	/** Fronteira da busca — injetável nos testes (Bevi real em produção). */
	buscarGrupos?: (args: {
		category: Category;
		creditMin?: number;
		creditMax?: number;
		parcelaAlvo?: number;
	}) => Promise<GroupSummary[]>;
	/** Fronteira da simulação — injetável nos testes (Bevi real em produção). */
	simularCota?: (params: { groupId: string; creditValue: number }) => Promise<QuotaSimulation>;
	/** Logos das administradoras — injetável nos testes. */
	carregarLogos?: () => Promise<ReadonlyMap<string, string>>;
};

/** O que o cliente PEDIU nesta busca: o teto de crédito alimenta o aviso de
 * ajuste do hero, e o valor do bem é a conta do lance embutido. Fora do turno da
 * busca fica vazio — o card então degrada (sem aviso, sem `cartaNecessaria`). */
function valoresPedidos(ctx: ContextoDasTools): { valorPedido?: number; valorDoBem?: number } {
	const busca = ctx.estadoDepoisDaBusca;
	if (!busca) return {};
	const pedido = busca.creditMax ?? busca.valorDoBemAlvo;
	const bem = busca.valorDoBemAlvo;
	return {
		...(typeof pedido === "number" && pedido > 0 ? { valorPedido: pedido } : {}),
		...(typeof bem === "number" && bem > 0 ? { valorDoBem: bem } : {}),
	};
}

/** Do payload do modelo, só estas três chaves são lidas (ver `RefDeCard`). */
function refDoPayload(payload: Record<string, unknown>): RefDeCard {
	const ref: RefDeCard = {};
	if (typeof payload.groupId === "string" && payload.groupId.length > 0) {
		ref.groupId = payload.groupId;
	}
	if (typeof payload.lancePercent === "number" && Number.isFinite(payload.lancePercent)) {
		ref.lancePercent = payload.lancePercent;
	}
	if (
		typeof payload.initialTargetMonth === "number" &&
		Number.isFinite(payload.initialTargetMonth)
	) {
		ref.initialTargetMonth = payload.initialTargetMonth;
	}
	return ref;
}

export function buildToolsLivres(ctx: ContextoDasTools, deps: DepsDasToolsLivres = {}) {
	// UM adapter por turno: `simulateQuota` lê o índice de ofertas que a busca
	// populou dentro da MESMA instância — com um adapter novo por chamada, a
	// simulação nunca acharia a carta (`GroupNotInDiscoveryError`).
	let adapterDaVenda: BeviSelfContractAdapter | null = null;
	const adapterReal = (): BeviSelfContractAdapter => {
		adapterDaVenda ??= new BeviSelfContractAdapter(new BeviSelfContractClient(), {
			getIdentity: async () => identidadeDeVitrine(),
			getSimulationPrefs: async () => prefsFromMeta(await reloadMeta(ctx.conversationId)),
		});
		return adapterDaVenda;
	};
	const logosDoTurno = async (): Promise<ReadonlyMap<string, string> | undefined> => {
		if (deps.carregarLogos) return deps.carregarLogos();
		return loadAdministradoraLogoMap().catch(() => undefined);
	};
	const simularCotaReal = async (params: { groupId: string; creditValue: number }) => {
		if (!vitrineDisponivel()) {
			throw new Error("A identidade da casa (VITRINE_CPF/VITRINE_CELULAR) não está configurada.");
		}
		return adapterReal().simulateQuota(params);
	};

	const buscar_cartas = tool({
		description:
			"Busca cartas de consórcio REAIS na administradora, no tipo de bem e na faixa que o cliente disse, e mostra as opções na tela. Usa a identidade da própria Aja Agora: NÃO peça CPF nem telefone para isto. Devolve o resumo de cada carta (id, administradora, carta, parcela, prazo).",
		inputSchema: z.object({
			categoria: z.enum(CATEGORIAS).describe("Tipo de bem: auto, moto, imovel ou servicos"),
			valorDoBem: z
				.number()
				.positive()
				.optional()
				.describe("Valor do bem em reais, como o cliente disse"),
			parcelaMensal: z
				.number()
				.positive()
				.optional()
				.describe(
					"Parcela que cabe no bolso, em reais — quando ele fala em parcela e não em valor",
				),
			usaraLanceEmbutido: z
				.boolean()
				.optional()
				.describe("true só se o cliente quiser usar parte da própria carta como lance"),
		}),
		execute: async (args) => {
			// O guard da vitrine vale para a busca REAL (que abre proposta com o par
			// da casa). Com a fronteira injetada (teste), não há identidade envolvida.
			if (!deps.buscarGrupos && !vitrineDisponivel()) {
				return "Busca rápida indisponível: a identidade da casa não está configurada (VITRINE_CPF/VITRINE_CELULAR). Não peça CPF ao cliente para contornar — diga que a busca está fora do ar agora.";
			}
			const categoria = args.categoria as Category;
			const pct = EMBUTIDO_DEFAULT_PERCENT;
			const { params, creditMax, creditMin } = paramsDaBusca({
				categoria,
				valorDoBem: args.valorDoBem,
				parcelaMensal: args.parcelaMensal,
				usaraLanceEmbutido: args.usaraLanceEmbutido,
			});
			const bem = args.valorDoBem;

			let grupos: GroupSummary[];
			try {
				if (deps.buscarGrupos) {
					grupos = await deps.buscarGrupos(params);
				} else {
					grupos = await adapterReal().searchGroups(params);
				}
			} catch (erro) {
				console.error("[buscar_cartas] falha na Bevi:", erro);
				return `Busca falhou agora (${erro instanceof Error ? erro.message : String(erro)}). Diga ao cliente que a busca não voltou e proponha tentar de novo — nunca invente número.`;
			}

			const index: RevealGroupIndex = new Map();
			// `indexRevealGroups` espera o ENVELOPE (`{ groups }`), não o array: com
			// o array cru o índice sai vazio e a coerção descarta todas as cotas —
			// o card chegava vazio na tela (medido no smoke de 20/10/2026).
			indexRevealGroups(index, "search_groups", { groups: grupos });
			const cartas: CartaLivre[] = grupos
				.filter((g) => typeof g?.id === "string" && g.id.length > 0)
				.slice(0, 12)
				.map((g) => ({
					groupId: g.id,
					administradora: g.administradora,
					carta: g.creditValue,
					parcela: g.monthlyPayment,
					prazoMeses: g.termMonths,
					contempladosMes: g.availableSlots,
				}));

			if (cartas.length === 0) {
				ctx.estadoDepoisDaBusca = {
					categoria,
					creditMax,
					creditMin,
					parcelaAlvo: args.parcelaMensal,
				};
				return "A busca voltou sem nenhuma carta nessa faixa. Diga isso ao cliente com naturalidade e proponha outro valor ou outra parcela.";
			}

			const logos = await logosDoTurno();
			// O card corta em até 4 opções (`limitarOpcoesDaComparacao`). O modelo
			// recebia as 12 da busca e recomendava carta que o cliente NÃO estava
			// vendo — e `fazer_proposta` recusava depois. A verdade é o card.
			const payloadDoCard = buildComparisonTableFromRevealGroups(index, logos) as {
				groups?: Array<{ id?: string }>;
			};
			const idsNoCard = new Set(
				(payloadDoCard.groups ?? [])
					.map((g) => g?.id)
					.filter((id): id is string => typeof id === "string"),
			);
			const cartasNoCard = cartas.filter((c) => idsNoCard.has(c.groupId));
			// A fonte dos cards de FATO é o que está NA TELA — não as 12 da busca.
			// SOMA ao índice em vez de substituir: duas buscas no mesmo turno (outra
			// categoria, refino de faixa) deixam a primeira `comparison_table` na tela,
			// e os ids dela continuam válidos para os cards de FATO.
			for (const g of grupos) {
				if (idsNoCard.has(g.id)) ctx.gruposRevelados.set(g.id, g);
			}
			ctx.cards.push({
				type: "comparison_table",
				payload: payloadDoCard as unknown as Record<string, unknown>,
			});
			ctx.cartasNaTela = cartasNoCard;
			ctx.estadoDepoisDaBusca = {
				categoria,
				creditMax,
				creditMin,
				parcelaAlvo: args.parcelaMensal,
				valorDoBemAlvo: bem,
				lanceEmbutido: args.usaraLanceEmbutido === true,
			};

			return JSON.stringify({
				cartas: cartasNoCard,
				obs: args.usaraLanceEmbutido
					? `Busca feita com lance embutido de ${pct}%: a carta é maior que o bem de propósito (o embutido consome parte dela).`
					: "Cartas reais, sem lance embutido.",
				...(args.parcelaMensal && args.valorDoBem
					? {
							parcelaDoCliente: args.parcelaMensal,
							aviso:
								"A busca foi pelo VALOR do bem. Compare a parcela de cada carta com a parcela que o cliente disse e fale com honestidade se passar dela.",
						}
					: {}),
			});
		},
	});

	const fazer_proposta = tool({
		description:
			"Gera a proposta REAL no nome do cliente, na administradora, e mostra o card de confirmação. Exige: o cliente escolheu uma das cartas mostradas, mandou CPF e celular dele e aceitou o aviso da LGPD (aceiteLgpd=true). CPF e celular NÃO são parâmetros — o sistema usa o que o cliente mandou.",
		inputSchema: z.object({
			groupId: z
				.string()
				.min(3)
				.describe("id da carta escolhida, copiado LITERAL de buscar_cartas"),
			aceiteLgpd: z
				.boolean()
				.describe("true só depois de o cliente concordar com o aviso da LGPD que você deu"),
		}),
		execute: async (args) => {
			if (args.aceiteLgpd !== true) {
				return "Proposta NÃO gerada: falta o aceite da LGPD. Dê o aviso e só siga depois do sim do cliente.";
			}
			const doTurno = ctx.cartasNaTela.find((c) => c.groupId === args.groupId);
			const exibidas = await listShownOffersForConversation(ctx.conversationId).catch(() => []);
			const escolhida = doTurno
				? {
						groupId: doTurno.groupId,
						administradora: doTurno.administradora,
						creditValue: doTurno.carta,
						termMonths: doTurno.prazoMeses,
					}
				: exibidas.find((o) => o.groupId === args.groupId);
			if (!escolhida) {
				return `Proposta NÃO gerada: o id "${args.groupId}" não está entre as cartas que o cliente viu nesta conversa. Busque de novo ou peça para ele escolher uma das que estão na tela.`;
			}

			const identity = await loadIdentity(ctx.conversationId);
			if (!identity) {
				return "Proposta NÃO gerada: não tenho o CPF do cliente guardado nesta conversa. Peça o CPF, explique que a administradora consulta os birôs de crédito, e só então chame de novo.";
			}
			if (!identity.celular) {
				return "Proposta NÃO gerada: falta o celular do cliente — o CPF já está guardado nesta conversa. No WhatsApp o celular é o número da conversa, não peça: use o que já existe. Na web, peça uma vez e chame de novo.";
			}

			// CONVERSA DE TESTE não fecha com número inventado. O hash do simulador
			// (`SIM-<uuid>`) não é telefone: a Bevi valida celular × CPF e recusou
			// (`BeviApiError: Dados inválidos`, 25/10/2026). Sem par de teste no
			// ambiente, o fechamento para — não se fabrica um número.
			const celularDoFecho = celularDeFechamento({
				waId: ctx.waId ?? null,
				cpf: identity.cpf,
				celular: identity.celular,
			});
			if (!celularDoFecho.ok) {
				return "Proposta NÃO gerada: esta conversa é de teste e o ambiente não tem par de teste. Não invente número — diga que o fechamento aqui é de teste e siga.";
			}

			// O AVISO E O ACEITE SÃO FATO CONFERIDOS NA CONVERSA INTEIRA, não na última
			// fala do agente — o `aceiteLgpd: true` do modelo não é prova de nada, e
			// `startContract` já dispara consulta de bureau com `termoLgpd: true`.
			// Medido em 92dfa1ba: aviso dado dois turnos antes, no meio o agente pediu o
			// celular; o check antigo (só a última fala) não achava o aviso, recusava, e
			// o modelo repetia o aviso — texto duplicado na tela. Agora o aviso vale em
			// qualquer fala do agente, um "pode" do cliente depois dele é aceite, e o
			// aceite registrado uma vez não se pede de novo.
			const meta = await reloadMeta(ctx.conversationId);
			const historico = await loadConversationHistory(ctx.conversationId).catch(() => []);
			const aceite = resolverAceiteLgpd({
				falas: historico.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
				falaDoCliente: ctx.userText,
				textoDoTurno: ctx.textoDoTurno ?? "",
				aceiteJaGravado: meta.lgpdAceite ?? null,
			});
			if (!aceite.ok) {
				return aceite.motivo === "aviso-nao-dado"
					? "Proposta NÃO gerada: o aviso da LGPD ainda não foi dado nesta conversa. Dê o aviso com suas palavras (a administradora consulta o CPF nos birôs de crédito e usa os dados só para isso) e só chame de novo depois do sim do cliente."
					: "Proposta NÃO gerada: o cliente ainda não respondeu o aviso que você já deu. Peça o aceite em uma frase, sem repetir o aviso, e só siga depois do sim dele.";
			}

			// QUEM RECUSA IDENTIDADE DA CASA É O FULFILLMENT (`startContract`), que
			// compara com a identidade DIGITADA — não a tool. Duplicar aqui barrava
			// até o teste de homologação, onde o "cliente" é a conta da casa.

			// UMA proposta por conversa: segunda proposta em OUTRA administradora
			// dispara nova consulta de bureau no CPF da pessoa.
			const anterior = await getLatestBeviProposal(ctx.conversationId).catch(() => null);
			// FECHO JÁ CONCLUÍDO NÃO ABRE OUTRA PROPOSTA. Depois do aceite, a
			// proposta saiu da simulação (`documentos` e além) ou a conversa
			// fechou de vez — reabrir aqui é uma SEGUNDA proposta real com nova
			// consulta de bureau no mesmo CPF.
			if (
				fechoJaConcluido({
					contractClosed: meta.contractClosed,
					proposalStatus: anterior?.proposalStatus,
				})
			) {
				return "Proposta NÃO gerada: o fechamento desta conversa já foi concluído. Não abra outra — ofereça acompanhar o andamento da proposta que já existe.";
			}
			if (
				administradoraConflictsWithRegisteredProposal(
					anterior?.administradora,
					escolhida.administradora ?? null,
				)
			) {
				return `Proposta NÃO gerada: já existe uma proposta com a ${anterior?.administradora} nesta conversa. Ofereça conferir o status dela em vez de abrir outra.`;
			}

			// A CARTA ESCOLHIDA VIRA A ÂNCORA DO CONTRATO — e é ELA, não a meta
			// anterior, que o builder do `startContract` lê (`contractOffer`).
			// Sem isto, `buildStartContractInput` usava o teto do funil e o cliente
			// via 92.902 em 120x enquanto a Bevi recebia "uns 80 mil" — troca
			// silenciosa de cota (o FIX-73 de volta).
			const metaDaProposta = metaDoFecho({
				meta,
				escolhida,
				falaDoCliente: ctx.userText,
			});
			await persistMeta(ctx.conversationId, metaDaProposta);

			// A proposta nasce VINCULADA ao lead da conversa, com o telefone da
			// identidade — é o que move a raia e o que o poll/mesa encontram.
			const leadId = await garantirLeadDoFecho({
				conversationId: ctx.conversationId,
				celular: celularDoFecho.celular,
				nome: ctx.nomeDoCliente,
			});

			let result: Awaited<ReturnType<typeof startContract>>;
			try {
				result = await startContract(
					ctx.conversationId,
					inputDoFecho({
						meta: metaDaProposta,
						cpf: identity.cpf,
						celular: celularDoFecho.celular,
						leadId,
						registeredAdministradora: anterior?.administradora ?? null,
					}),
				);
			} catch (erro) {
				console.error("[fazer_proposta] falha no fechamento:", erro);
				return `Proposta NÃO gerada (${erro instanceof Error ? erro.message : String(erro)}). Diga ao cliente que houve um problema ao falar com a administradora e ofereça um especialista humano.`;
			}

			// Depois do fecho, a cota REAL é a âncora do estado — é o snapshot que
			// a retomada lê — e, no WhatsApp, o aceite por TEXTO passa a poder
			// finalizar (`offer-confirm`).
			if (result.offer) {
				await persistMeta(
					ctx.conversationId,
					metaDepoisDaProposta({
						meta: await reloadMeta(ctx.conversationId).catch(() => metaDaProposta),
						channel: ctx.channel,
						offer: result.offer,
					}),
				);
			}

			aplicarItensDoFecho(ctx, realOfferPresentation(result));

			if (result.noOffer || !result.offer) {
				return "A administradora não devolveu carta para esse valor. Explique ao cliente e proponha outro valor.";
			}
			return JSON.stringify({
				proposta: result.proposalId,
				administradora: result.offer.administradora,
				carta: result.offer.creditValue,
				parcela: result.offer.monthlyPayment,
				prazoMeses: result.offer.termMonths,
				valorDivergiu: result.valorDivergiu === true,
				administradoraMudou: result.administradoraChanged === true,
				obs: "O card de confirmação está na tela. Ele só vira contrato quando o cliente confirmar.",
			});
		},
	});

	const mostrar_card = tool({
		description:
			"Quando fizer UMA pergunta com respostas curtas e previsíveis, chame esta tool antes de escrever a pergunta. As alternativas vão somente no card; não escreva lista ou menu equivalente na fala. Espere a resposta antes de fazer outra pergunta. " +
			"Mostra na tela um card. Há dois caminhos, e nenhum aceita número de oferta seu.\n\n" +
			"1) Card de ESCOLHA (o payload é seu): `quick_reply` (payload { options: [{ label }] }, até 4 atalhos de resposta), `value_picker` (payload { category: imovel|auto|moto, fields: [{ id, label, min, max, default }] }, faixas de valor do bem) e `topic_picker` (payload { topics: [...], includeBackButton }).\n\n" +
			"2) Card de FATO (o payload é do servidor; você só diz QUAL carta e, se for o caso, o cenário): `group_card`, `recommendation_card`, `comparison_table`, `simulation_result`, `financing_comparison`, `contemplation_dial`, `embedded_bid`, `two_paths`, `scarcity`, `decision_prompt` (todos precisam de `groupId` copiado de buscar_cartas), e os de estado `lead_form`, `contract_form`, `whatsapp_optin`. Payload do fato: { groupId, lancePercent?, initialTargetMonth? } — qualquer outro número que você mandar é ignorado, porque o valor vem da carta real.",
		inputSchema: z.object({
			tipo: z
				.string()
				.describe(
					"quick_reply, value_picker, topic_picker, group_card, recommendation_card, comparison_table, simulation_result, financing_comparison, contemplation_dial, embedded_bid, two_paths, scarcity, lead_form, contract_form, whatsapp_optin ou decision_prompt",
				),
			payload: z
				.record(z.string(), z.unknown())
				.optional()
				.describe("Conteúdo do card, no shape do tipo escolhido"),
		}),
		execute: async (args) => {
			const payload = args.payload ?? {};
			const destino = destinoDoCard(args.tipo);

			// Recusa é TEXTO, nunca exceção: é essa fala que ensina o modelo a pedir
			// o card certo ou a usar a tool de dado.
			if (destino?.classe === "emitivel" && destino.origem === "escolha") {
				if (
					ctx.cards.some((c) => ["quick_reply", "value_picker", "topic_picker"].includes(c.type))
				) {
					return "Já há uma pergunta interativa neste turno. Use o card existente e espere a resposta; não faça outra pergunta.";
				}
				// FIX-109 (decisão do Kairo, 28/06/2026): no WhatsApp o `valuePickerToWhatsApp`
				// degrada o card DE PROPÓSITO — lá o valor do bem é CONVERSA (o cliente
				// digita "uns 80 mil"). Emitir o card aqui some com as faixas e ainda manda
				// o modelo não repeti-las. Não "consertar" isto de volta.
				if (args.tipo === "value_picker" && ctx.channel === "whatsapp") {
					return 'Card NÃO mostrado: no WhatsApp as faixas de valor não aparecem na tela — aqui o valor do bem é conversa. Pergunte o valor em texto ("quanto você pensa em gastar?") e siga.';
				}
				const escolha = cardDeEscolha(args.tipo, payload);
				if (!escolha.ok) return escolha.erro;
				ctx.cards.push(escolha.card);
				return `[Card ${escolha.card.type} na tela. Ele aparece para o cliente agora — não repita as opções na sua fala.]`;
			}

			const card = await montarCardDeFato(
				args.tipo,
				{
					conversationId: ctx.conversationId,
					channel: ctx.channel,
					nomeDoCliente: ctx.nomeDoCliente,
					grupos: ctx.gruposRevelados,
					telefoneMascarado: ctx.telefoneMascarado ?? null,
					cpfMascarado: ctx.cpfMascarado ?? null,
					...valoresPedidos(ctx),
					...(ctx.perfilDeclarado ? { perfilDeclarado: ctx.perfilDeclarado } : {}),
				},
				refDoPayload(payload),
				{ simularCota: deps.simularCota ?? simularCotaReal, logos: await logosDoTurno() },
			);
			if (!card.ok) return card.erro;
			ctx.cards.push(card.card);
			return `[Card ${card.card.type} na tela. Ele aparece para o cliente agora — os números vieram da carta real, não os repita com outros valores.]`;
		},
	});

	const falar_com_humano = tool({
		description:
			"Abre o caso na mesa. Use quando o cliente pedir para falar com uma pessoa, estiver insatisfeito, ou o assunto fugir do que você resolve. Não prometa prazo nem 'está a caminho': avise em uma linha que o caso foi aberto.",
		inputSchema: z.object({
			motivo: z.string().min(3).describe("Por que está chamando o especialista"),
		}),
		execute: async ({ motivo }) => {
			ctx.pediuHumano = true;
			// O nome que o cliente já disse na fala é FATO, não interpretação do modelo. Sem
			// nome não há caso na mesa — capturar é mais honesto que pedir de novo.
			const nome = ctx.nomeDoCliente ?? nomeNaFala(ctx.userText);
			if (nome && !ctx.nomeDoCliente) {
				await saveContactName(ctx.conversationId, nome, { ancorarEm: ctx.userText });
			}
			const caso = await abrirCasoNaMesa({
				conversationId: ctx.conversationId,
				nome,
				motivo,
			});
			if (!caso.ok) {
				return "Caso NÃO aberto: falta o nome do cliente. Capture o nome em uma linha, sem prometer especialista.";
			}
			ctx.casoAbertoNesteTurno?.();
			return `Caso aberto na mesa${caso.handoffId ? ` (id ${caso.handoffId})` : ""}. Avise em UMA linha, sem prometer prazo, e pare de responder nesta conversa — a mesa assume.`;
		},
	});

	const salvar_nome = tool({
		description: "Salva o primeiro nome do cliente. Chame assim que ele disser o nome, uma vez só.",
		inputSchema: z.object({ nome: z.string().min(2).max(30) }),
		execute: async ({ nome }) => {
			const r = await saveContactName(ctx.conversationId, nome, { ancorarEm: ctx.userText });
			return r.ok ? `[Nome '${nome}' salvo.]` : `[Nome NÃO gravado: ${r.error}]`;
		},
	});

	return { buscar_cartas, fazer_proposta, mostrar_card, falar_com_humano, salvar_nome };
}

/** Itens do fecho de `fazer_proposta` → cards e falas do turno. O `type` do item
 * é respeitado: o fecho sabe devolver `signature_handoff`.
 * (`document_upload`/`atendimento_handoff` saem por fora do turno.) */
export function aplicarItensDoFecho(ctx: ContextoDasTools, itens: ClosingItem[]): void {
	for (const item of itens) {
		if (item.kind === "text") ctx.falasDoFecho.push(item.text);
		else ctx.cards.push({ type: item.type, payload: item.payload });
	}
}

export const NOMES_DAS_TOOLS_LIVRES = [
	"buscar_cartas",
	"fazer_proposta",
	"mostrar_card",
	"falar_com_humano",
	"salvar_nome",
] as const;
