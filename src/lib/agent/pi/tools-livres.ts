// AS TOOLS DO VENDEDOR LIVRE — três ações e nada mais.
//
// O desenho é o oposto do funil: aqui não existe tool de APRESENTAÇÃO
// (`cards do funil`). O modelo decide QUANDO buscar e QUANDO fechar; o card aparece
// porque a tool rodou, montado pelo resultado dela — nunca porque o modelo
// escolheu um tipo de card.
//
//  · `buscar_cartas` usa SÓ a identidade da casa (vitrine). Buscar no nome do
//    cliente abriria proposta real na loja compartilhada antes de ele decidir.
//  · `fazer_proposta` usa SÓ a identidade do cliente, cifrada no servidor. O
//    CPF nunca chega ao modelo: ele vê `[CPF recebido e guardado]`.
//  · `falar_com_humano` emite o evento `handoff` (o funil só ligava uma flag, e
//    o botão "Sim, conectar" do WhatsApp nunca aparecia).

import { tool } from "ai";
import { z } from "zod";
import { BeviSelfContractAdapter } from "@/lib/adapters/bevi/bevi-self-contract-adapter";
import { BeviSelfContractClient } from "@/lib/adapters/bevi/self-contract-client";
import type { GroupSummary } from "@/lib/adapters/types";
import { listShownOffersForConversation } from "@/lib/agent/orchestrator/choose-offer";
import {
	buildComparisonTableFromRevealGroups,
	indexRevealGroups,
	type RevealGroupIndex,
} from "@/lib/agent/orchestrator/recommendation-payload";
import type { Category } from "@/lib/agent/personas";
import { realOfferPresentation } from "@/lib/bevi/closing-presentation";
import {
	administradoraConflictsWithRegisteredProposal,
	buildStartContractInput,
} from "@/lib/bevi/contract-input";
import { prefsFromMeta } from "@/lib/bevi/discovery-session";
import { startContract } from "@/lib/bevi/fulfillment";
import { identidadeDeVitrine, vitrineDisponivel } from "@/lib/bevi/identidade-vitrine";
import { getLatestBeviProposal } from "@/lib/bevi/proposal-repo";
import { loadAdministradoraLogoMap } from "@/lib/consorcio/administradora-logo-repo";
import { loadIdentity } from "@/lib/conversation/identity";
import { loadConversationHistory } from "@/lib/conversation/messages";
import { persistMeta, reloadMeta } from "@/lib/conversation/meta";
import { saveContactName } from "@/lib/leads/contact-capture";

export type CartaLivre = {
	groupId: string;
	administradora: string;
	carta: number;
	parcela: number;
	prazoMeses: number;
	contempladosMes?: number;
};

export type CardLivre = {
	type: "comparison_table" | "real_offer";
	payload: Record<string, unknown>;
};

export type ContextoDasTools = {
	conversationId: string;
	channel: "web" | "whatsapp";
	/** Fala do cliente neste turno (o nome só se grava se foi dito nela). */
	userText: string | null;
	/** Onde a tool põe o card que o driver vai emitir depois de persistir. */
	cards: CardLivre[];
	/** Texto do fecho (copy de produção) que acompanha o card. */
	falasDoFecho: string[];
	/** Cartas que foram para o CARD neste turno (não as 12 da busca crua). É
	 * contra elas que a proposta é ancorada — o modelo só pode escolher o que o
	 * cliente está vendo. */
	cartasNaTela: CartaLivre[];
	/** Setado por `falar_com_humano`. */
	pediuHumano: boolean;
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

const CATEGORIAS = ["auto", "moto", "imovel", "servicos"] as const;

export type DepsDasToolsLivres = {
	/** Fronteira da busca — injetável nos testes (Bevi real em produção). */
	buscarGrupos?: (args: {
		category: Category;
		creditMin?: number;
		creditMax?: number;
		parcelaAlvo?: number;
	}) => Promise<GroupSummary[]>;
};

export function buildToolsLivres(ctx: ContextoDasTools, deps: DepsDasToolsLivres = {}) {
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
			// Embutido: a carta tem que ser MAIOR que o bem, senão o cliente
			// contempla com 70% do valor e falta dinheiro para comprar. A conta é
			// invariante de dinheiro — fica aqui, não na fala.
			const pct = EMBUTIDO_DEFAULT_PERCENT;
			const bem = args.valorDoBem;
			const alvoComEmbutido =
				args.usaraLanceEmbutido && bem ? Math.round(bem / (1 - pct / 100)) : undefined;
			const creditMax = alvoComEmbutido ?? bem;
			const creditMin = args.parcelaMensal
				? undefined
				: alvoComEmbutido
					? Math.round(alvoComEmbutido * PISO_DO_EMBUTIDO)
					: undefined;

			const params = {
				category: categoria,
				...(args.parcelaMensal ? { parcelaAlvo: args.parcelaMensal } : { creditMin, creditMax }),
			};

			let grupos: GroupSummary[];
			try {
				if (deps.buscarGrupos) {
					grupos = await deps.buscarGrupos(params);
				} else {
					const adapter = new BeviSelfContractAdapter(new BeviSelfContractClient(), {
						getIdentity: async () => identidadeDeVitrine(),
						getSimulationPrefs: async () => prefsFromMeta(await reloadMeta(ctx.conversationId)),
					});
					grupos = await adapter.searchGroups(params);
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

			const logos = await loadAdministradoraLogoMap();
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
				return `Proposta NÃO gerada: falta o celular do cliente (o CPF ${identity.cpf.slice(0, 3)}… já está guardado). Peça o celular com DDD e chame de novo.`;
			}

			// O AVISO DA LGPD TEM QUE TER SIDO DITO, e o servidor confere em vez de
			// acreditar no booleano que o modelo mandou. Sem esta checagem, o
			// `aceiteLgpd: true` era uma afirmação do próprio modelo sobre um
			// consentimento que ninguém registrou — e `startContract` já dispara
			// consulta de bureau com `termoLgpd: true`.
			const historico = await loadConversationHistory(ctx.conversationId).catch(() => []);
			const ultimaFalaDoAgente =
				[...historico].reverse().find((m) => m.role === "assistant" && m.content.trim().length > 0)
					?.content ?? "";
			const avisoDado = /bir[oô]s?\s+de\s+cr[eé]dito|conforme a\s+LGPD/i.test(ultimaFalaDoAgente);
			if (!avisoDado) {
				return "Proposta NÃO gerada: o cliente ainda não recebeu o aviso da LGPD. Diga com suas palavras que a administradora consulta o CPF nos birôs de crédito e usa os dados só para isso, e só chame de novo depois do sim dele.";
			}

			// QUEM RECUSA IDENTIDADE DA CASA É O FULFILLMENT (`startContract`), que
			// compara com a identidade DIGITADA — não a tool. Duplicar aqui barrava
			// até o teste de homologação, onde o "cliente" é a conta da casa.
			const meta = await reloadMeta(ctx.conversationId);

			// UMA proposta por conversa: segunda proposta em OUTRA administradora
			// dispara nova consulta de bureau no CPF da pessoa.
			const anterior = await getLatestBeviProposal(ctx.conversationId).catch(() => null);
			if (
				administradoraConflictsWithRegisteredProposal(
					anterior?.administradora,
					escolhida.administradora ?? null,
				)
			) {
				return `Proposta NÃO gerada: já existe uma proposta com a ${anterior?.administradora} nesta conversa. Ofereça conferir o status dela em vez de abrir outra.`;
			}

			// A CARTA ESCOLHIDA VIRA A ÂNCORA DO CONTRATO.
			// Sem isto, `buildStartContractInput` usava o teto do funil e o cliente
			// via 92.902 em 120x enquanto a Bevi recebia "uns 80 mil" — troca
			// silenciosa de cota (o FIX-73 de volta).
			await persistMeta(ctx.conversationId, {
				...meta,
				contractOffer: {
					administradora: escolhida.administradora ?? null,
					creditValue: escolhida.creditValue ?? null,
					termMonths: escolhida.termMonths ?? null,
				} as never,
				lgpdAceite: {
					em: new Date().toISOString(),
					fala: (ctx.userText ?? "").slice(0, 200),
				} as never,
			});
			let result: Awaited<ReturnType<typeof startContract>>;
			try {
				result = await startContract(
					ctx.conversationId,
					buildStartContractInput(
						meta,
						{ cpf: identity.cpf, celular: identity.celular, lgpd: true },
						{ registeredAdministradora: escolhida.administradora ?? null },
					),
				);
			} catch (erro) {
				console.error("[fazer_proposta] falha no fechamento:", erro);
				return `Proposta NÃO gerada (${erro instanceof Error ? erro.message : String(erro)}). Diga ao cliente que houve um problema ao falar com a administradora e ofereça um especialista humano.`;
			}

			const itens = realOfferPresentation(result);
			for (const item of itens) {
				if (item.kind === "text") ctx.falasDoFecho.push(item.text);
				else
					ctx.cards.push({
						type: item.type === "real_offer" ? "real_offer" : "real_offer",
						payload: item.payload,
					});
			}

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

	const falar_com_humano = tool({
		description:
			"Chama um especialista humano para assumir a conversa. Use quando o cliente pedir para falar com uma pessoa, estiver insatisfeito, ou o assunto fugir do que você resolve.",
		inputSchema: z.object({
			motivo: z.string().min(3).describe("Por que está chamando o especialista"),
		}),
		execute: async () => {
			ctx.pediuHumano = true;
			return "Especialista chamado. Avise o cliente em uma frase e siga conversando até ele entrar.";
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

	return { buscar_cartas, fazer_proposta, falar_com_humano, salvar_nome };
}

export const NOMES_DAS_TOOLS_LIVRES = [
	"buscar_cartas",
	"fazer_proposta",
	"falar_com_humano",
	"salvar_nome",
] as const;
