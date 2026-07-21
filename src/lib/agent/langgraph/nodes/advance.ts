// Nó `advance` — FIX-360 (funil completo, Rodada 1). Roda ENTRE `route` e
// `converse`: transições de RAPPORT (motivo/espelho) e os marcadores de
// dispatch/resposta dos gates pós-reveal (reco-consent, simulator-offer,
// lance-embutido, lance-value) que `nextGate`/`decideShowGate`
// (qualify-state.ts, reusados tal-e-qual em `route.ts`) LEEM mas não
// ESCREVEM — esses são side-effects de o SISTEMA ter mostrado/reconhecido
// uma resposta, não algo que o analyzer extrai do texto livre.
//
// NÃO ENGESSAR: este nó nunca decide O QUE o modelo fala nem TRAVA a
// conversa — só atualiza flags de estado que `nextGate`/`decideShowGate` já
// consultam. O `converse` (nó seguinte) sempre gera a fala via
// `model.stream()`, cego a este nó.

import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { resolveAdministradoraMentionForConversation } from "@/lib/agent/orchestrator/choose-offer";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
/** Sim/não em texto livre — FONTE ÚNICA, importada do orchestrator. Era
 * duplicada aqui, e a cópia ficou para trás: mantinha o bug em que o "não"
 * ganhava sempre por ser testado primeiro, então "não sei, pode mostrar sim"
 * virava recusa. Duas cópias da mesma heurística = uma delas sempre desatualiza.
 */
import { detectYesNoText } from "@/lib/agent/orchestrator/yes-no";
import { parseAssetValue } from "@/lib/agent/parse-asset-value";
import type { Category } from "@/lib/agent/personas";
import { LANCE_EMBUTIDO_DEFAULT_PERCENT } from "@/lib/agent/qualify-config";
import {
	shouldAskMotive,
	shouldMirrorMotivation,
	type UserIntent,
} from "@/lib/agent/qualify-state";
import { projectToMeta } from "../emit";
import type { AgentGraphStateType, FunnelState } from "../state";

export async function advanceFunnelNode(
	state: AgentGraphStateType,
	config?: LangGraphRunnableConfig,
): Promise<Partial<AgentGraphStateType>> {
	if (!state.isUserTurn) return {};

	const meta = projectToMeta(state);
	const intent: UserIntent = state.intent ?? "neutral";
	let funnel: FunnelState = state.funnel;
	const events: TurnEvent[] = [];

	// ── Libera o hero PENDENTE (a descoberta o guardou coagido contra o grupo
	// REAL) assim que a experiência foi respondida. Isto acontece AQUI, antes do
	// `converse`, de propósito: enquanto a liberação vivia no `emitCard` — que
	// roda DEPOIS de o modelo falar — o turno em que o cliente respondia a
	// experiência já pulava pro gate seguinte, o agente perguntava o PRAZO e a
	// recomendação caía embaixo, órfã, como se fosse um anexo. Recomendar é o
	// assunto do turno; o prazo vem depois. Não passa por `artifactAllowed` de
	// novo: o guard já autorizou este payload especificamente A ESPERAR — o
	// release é a resolução daquele hold, não um card novo.
	const liberaHero =
		Boolean(funnel.pendingRecommendationCard) &&
		(funnel.experiencePrev !== undefined || funnel.recoConsentAnswered === true);
	if (liberaHero && funnel.pendingRecommendationCard) {
		// Anuncia AO VIVO que a recomendação está sendo montada. Este turno faz
		// DOIS beats de modelo e chega a durar quase um minuto sem chamar tool
		// nenhuma — o cliente ficava encarando três pontinhos mudos, sem saber se
		// o agente morreu. A UI já sabe rotular este evento ("Selecionando
		// recomendação"); é o mesmo mecanismo que a busca usa.
		config?.writer?.({
			type: "tool-call",
			toolName: "present_recommendation_card",
			input: {},
			toolCallId: crypto.randomUUID(),
		});
		events.push({
			type: "artifact",
			artifactType: "recommendation_card",
			payload: funnel.pendingRecommendationCard,
			toolCallId: crypto.randomUUID(),
		});
		funnel = { ...funnel, pendingRecommendationCard: undefined };
	}

	// ── Rapport: motivo (turno próprio) → espelho (turno seguinte) ──
	// Reusa os predicados PUROS do runtime Vercel tal-e-qual (mesma
	// suppressão já aplicada por `decideShowGate` dentro de `route.ts`) — só
	// marca o beat como já rodado, uma vez cada, nunca os dois no mesmo turno.
	if (shouldAskMotive(meta) && !funnel.motivationAsked) {
		funnel = { ...funnel, motivationAsked: true };
	} else if (shouldMirrorMotivation(meta) && !funnel.motivationMirrored) {
		funnel = { ...funnel, motivationMirrored: true };
	}

	// ── reco-consent: dispatch na 1ª vez, resposta reconhecida depois ──
	if (state.gate === "reco-consent") {
		if (!funnel.recoConsentDispatched) {
			funnel = { ...funnel, recoConsentDispatched: true };
		} else if (!funnel.recoConsentAnswered) {
			// O convite aceita SIM e NÃO — os dois resolvem o gate. Só o SIM
			// resolvia, então "não quero" congelava o funil para sempre (nunca vinha
			// decisão, nunca vinha contrato) e a venda morria em silêncio.
			const resposta = detectYesNoText(state.userText, intent);
			if (resposta === true) {
				funnel = { ...funnel, recoConsentAnswered: true };
			} else if (resposta === false) {
				funnel = { ...funnel, recoConsentAnswered: true, recoConsentDeclined: true };
			}
		}
	}

	// ── simulator-offer: dispatch na EMISSÃO (mesmo padrão do runtime
	// Vercel, comentário em qualify-state.ts:200) — `nextGate` só consulta
	// `simulatorOfferDispatched` (nunca `simulatorOfferAnswered`), então o
	// convite é estruturalmente um passe de 1 turno: assim que `routeFinal`
	// recomputa com a flag já true, o funil já avança pra "decision" no
	// PRÓXIMO turno, independente de o usuário confirmar o dial (o card
	// numérico do dial em si é o "what-if" de sempre, tool-call do modelo —
	// TODO(rodada-2): tool dedicada de contemplation_dial no toolset). ──
	if (state.gate === "simulator-offer" && !funnel.simulatorOfferDispatched) {
		funnel = { ...funnel, simulatorOfferDispatched: true };
	}

	// ── experience: captura DETERMINÍSTICA da resposta ao card ──
	// O rótulo do chip é a resposta, não uma frase a interpretar. Enquanto isso
	// dependeu só do analyzer LLM extrair `experiencePrev`, houve turno em que
	// ele não extraiu: o gate voltou como `experience` de novo e o card de
	// recomendação — que fica pendurado esperando exatamente esta resposta —
	// nunca saiu. O cliente respondeu e a jornada parou de andar. Texto livre
	// continua com o analyzer; o que veio de card é dado.
	if (state.gate === "experience" && funnel.experiencePrev === undefined) {
		const t = (state.userText ?? "").trim().toLowerCase();
		const daResposta: FunnelState["experiencePrev"] | undefined = /primeira vez/.test(t)
			? "first"
			: /j[áa] conhe[çc]o|j[áa] fiz|j[áa] tive/.test(t)
				? "returning"
				: /tenho d[úu]vidas/.test(t)
					? "doubts"
					: undefined;
		if (daResposta) funnel = { ...funnel, experiencePrev: daResposta };
	}

	// ── RECUSA EXPLÍCITA DO EMBUTIDO, FORA DO GATE ──
	// A captura abaixo só escuta quando o gate `lance-embutido` está aberto. Só
	// que o cliente costuma recusar ANTES, no turno em que o agente menciona o
	// mecanismo ("pera, não quero lance embutido não, só o meu dinheiro"). A
	// recusa não era registrada, o gate abria depois, e o "beleza, mostra aí"
	// seguinte era lido como ACEITE — o contrato saiu com embutido para quem o
	// tinha recusado duas mensagens antes (visto ao vivo, 2026-07-21).
	//
	// Só a RECUSA é capturada aqui, nunca o aceite: aceitar muda o alvo da busca
	// e o tamanho da carta, então continua exigindo o gate. Assimetria de
	// propósito — errar pra menos devolve a pergunta, errar pra mais vende
	// diferente do combinado. E só vale quando ele NOMEIA o mecanismo.
	if (
		state.gate !== "lance-embutido" &&
		funnel.qualifyAnswers.lanceEmbutido === undefined &&
		/embutid/i.test(state.userText ?? "") &&
		detectYesNoText(state.userText, intent) === false
	) {
		funnel = {
			...funnel,
			qualifyAnswers: { ...funnel.qualifyAnswers, lanceEmbutido: false },
		};
	}

	// ── lance-embutido: educa + opt-in por texto livre ──
	if (state.gate === "lance-embutido" && funnel.qualifyAnswers.lanceEmbutido === undefined) {
		const answer = detectYesNoText(state.userText, intent);
		if (answer !== null) {
			const pct = LANCE_EMBUTIDO_DEFAULT_PERCENT;
			// Aceitar o embutido MUDA O ALVO DA BUSCA. O embutido sai da própria
			// carta: numa carta do tamanho do bem, o cliente contempla e falta
			// dinheiro. Então o certo não é encolher o que ele já escolheu — é ir
			// atrás de GRUPOS DE VALOR MAIOR e deixar o embutido encolher aquilo até
			// entregar exatamente o que ele precisa. `creditMax` (alvo da busca)
			// passa a ser `bem / (1 - pct)`, e `valorDoBemAlvo` guarda o preço do bem
			// pra não se perder. Trocar o alvo já re-dispara a descoberta sozinho
			// (`readyForDiscovery` compara com `discoveredCreditTarget`), então a
			// recomendação seguinte nasce de grupos REAIS daquela faixa — nunca de
			// uma carta hipotética calculada na fala.
			const bem = funnel.qualifyAnswers.valorDoBemAlvo ?? funnel.qualifyAnswers.creditMax;
			const alvoComEmbutido =
				answer && bem ? Math.round(bem / (1 - pct / 100)) : funnel.qualifyAnswers.creditMax;
			// O PISO da faixa sobe junto. Mexer só no teto deixava a busca aberta de
			// R$ 162 mil a R$ 257 mil — os grupos do tamanho do bem continuariam no
			// resultado e o ranking podia recomendar exatamente a carta que NÃO
			// serve pra quem vai usar embutido. Mesma proporção (90%) que o analyzer
			// usa ao derivar o `creditMin` do valor informado.
			const pisoComEmbutido = alvoComEmbutido
				? Math.round(alvoComEmbutido * 0.9)
				: funnel.qualifyAnswers.creditMin;
			funnel = {
				...funnel,
				qualifyAnswers: {
					...funnel.qualifyAnswers,
					lanceEmbutido: answer,
					lanceEmbutidoPercent: answer ? pct : undefined,
					...(answer && bem
						? {
								valorDoBemAlvo: bem,
								creditMax: alvoComEmbutido,
								creditMin: pisoComEmbutido,
							}
						: {}),
				},
			};
		}
	}

	// ── lance-value: backstop determinístico (mesmo padrão do FIX-115 pro
	// creditMax) — o valor do lance nunca é derivado, só lido do texto do
	// usuário quando ele traz um marcador explícito (R$/mil/milhão/k). ──
	if (state.gate === "lance-value" && funnel.qualifyAnswers.lanceValue === undefined) {
		const parsed = parseAssetValue(state.userText, {
			gate: "lance-value",
			category: funnel.currentCategory as Category | undefined,
		});
		if (parsed !== null) {
			funnel = {
				...funnel,
				qualifyAnswers: { ...funnel.qualifyAnswers, lanceValue: parsed },
			};
		}
	}

	// ── O CLIENTE NOMEOU UMA OPÇÃO: a âncora passa a ser ELA ──
	// Ele diz "essa da Canopus me atende, bora fechar" e o fechamento saía com a
	// administradora que o SISTEMA tinha recomendado — sem uma palavra sobre a
	// troca (visto ao vivo, 2026-07-21). A resolução por menção já existia no
	// runtime Vercel (`resolveOfferMentionForConversation`) e nunca foi ligada
	// aqui. Só re-ancora quando a menção resolve pra UMA oferta REAL já exibida
	// nesta conversa — nunca adivinha, nunca inventa grupo.
	/** O cliente nomeou uma cota já exibida NESTE turno — ancoragem determinística
	 * (nunca classificação de intenção), e portanto uma escolha feita. */
	let escolhaPorMencao = false;
	if (funnel.revealCompleted && state.userText?.trim()) {
		const mencionada = await resolveAdministradoraMentionForConversation(
			state.conversationId,
			state.userText,
		).catch(() => null);
		const mudou =
			mencionada?.administradora &&
			mencionada.administradora !== funnel.recommendedOffer?.administradora;
		if (mencionada && mudou) {
			// SUBSTITUIÇÃO, nunca merge. Os campos de uma cota viajam juntos: trocou
			// de grupo, campo que a cota nova não confirmou NÃO sobrevive do grupo
			// velho. O merge (`...funnel.recommendedOffer`) herdava o `avgBidValue`
			// do grupo anterior, e o lance médio errado atravessava a conversa até o
			// fecho — "ainda falta R$ 106.013" numa cota onde faltavam ~R$ 23.000.
			const trocouDeGrupo = Boolean(
				mencionada.groupId && mencionada.groupId !== funnel.recommendedOffer?.groupId,
			);
			const herdado = trocouDeGrupo ? undefined : funnel.recommendedOffer;
			funnel = {
				...funnel,
				recommendedAdministradora: mencionada.administradora ?? funnel.recommendedAdministradora,
				recommendedOffer: {
					...(mencionada.groupId
						? { groupId: mencionada.groupId }
						: herdado?.groupId
							? { groupId: herdado.groupId }
							: {}),
					...(herdado?.category ? { category: herdado.category } : {}),
					administradora: mencionada.administradora ?? herdado?.administradora,
					creditValue: mencionada.creditValue ?? herdado?.creditValue,
					termMonths: mencionada.termMonths ?? herdado?.termMonths,
					monthlyPayment: mencionada.monthlyPayment ?? herdado?.monthlyPayment,
					// Só o da cota resolvida. Ausente é melhor que errado: sem ele o
					// `blocoLance` não é montado e o modelo não cita lance médio nenhum.
					avgBidValue: mencionada.avgBidValue,
				} as FunnelState["recommendedOffer"],
			};
			escolhaPorMencao = true;
		}
	}

	// ── A ESCOLHA É UM FATO, NÃO UMA PERGUNTA EM ABERTO ──
	// O gate `decision` só se dava por resolvido quando o CARD de decisão saía —
	// e o card é suprimido justamente quando o cliente responde com informação
	// ("quero a de menor parcela", "pode ser a que você recomendou"). O funil não
	// registrava nada, o gate seguia ativo e o sistema mandava o modelo perguntar
	// de novo: três confirmações da MESMA cota em três turnos seguidos.
	//
	// Aqui a escolha vira estado quando ela é VERIFICÁVEL — nunca adivinhada:
	// (a) o cliente nomeou uma cota que já foi exibida (resolvida acima), ou
	// (b) o critério que decide já está capturado no funil e existe uma única
	//     oferta ancorada — não há o que perguntar.
	// Como a fala disso é feita, com que palavra, continua sendo do modelo.
	if (funnel.revealCompleted && funnel.recommendedOffer && !meta.contractClosed) {
		const perguntaAberta =
			intent === "asking_question" ||
			intent === "expressing_doubt" ||
			intent === "confused" ||
			intent === "off_topic" ||
			intent === "wants_more_options";
		const criterioJaCapturado =
			funnel.qualifyAnswers.objetivo !== undefined || funnel.qualifyAnswers.prazoMeses !== undefined;
		const origem: NonNullable<FunnelState["escolha"]>["origem"] | null = escolhaPorMencao
			? "mencao"
			: funnel.escolha
				? null // já registrada — não reescreve por inércia
				: // "Bora, pode seguir com a contratação" sobre uma oferta ancorada é
					// uma decisão tomada, não uma etapa a cumprir. Sem isto o funil
					// continuava cobrando o prazo desejado e o cliente pedia pra fechar
					// três vezes ouvindo que ainda não havia proposta nenhuma.
					intent === "ready_to_proceed"
					? "afirmacao"
					: !perguntaAberta && criterioJaCapturado
						? "criterio"
						: null;
		if (origem) {
			funnel = {
				...funnel,
				escolha: {
					...(funnel.recommendedOffer.groupId ? { groupId: funnel.recommendedOffer.groupId } : {}),
					administradora: funnel.recommendedOffer.administradora,
					creditValue: funnel.recommendedOffer.creditValue,
					termMonths: funnel.recommendedOffer.termMonths,
					monthlyPayment: funnel.recommendedOffer.monthlyPayment,
					origem,
				},
				// Coerência de fase: `phaseFromMeta` (tool-policy.ts) vira `closing`
				// por este flag. Resolver a decisão sem marcá-lo deixaria a política
				// de tools presa no regime de `reveal`, com o funil já no fecho.
				decisionDispatched: true,
			};
		}
	}

	return liberaHero ? { funnel, events, apresentaOfertaNesteTurno: true } : { funnel };
}
