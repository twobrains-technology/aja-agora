// ============================================================================
// CONTEXTO DO TURNO — a montagem do system prompt, extraída do nó `converse`.
//
// Vive num módulo próprio por um motivo só: o motor novo (pi) precisa montar
// EXATAMENTE o mesmo contexto — a caixa (prompt gerenciado) + os FATOS do turno
// + a mensagem do turno — e, enquanto isso morava dentro de `createConverseNode`,
// só o LangGraph era capaz de montá-lo. Duplicar essa montagem daria duas
// verdades sobre o mesmo turno, que é justamente o defeito que a fase 2 da
// campanha acabou de pagar para corrigir.
//
// A regra do corte continua valendo: o FATO do turno é montado aqui (estado,
// números, o que está na tela); a CONDUTA vem da caixa, na seção "Situações do
// turno". Nada aqui decide como o agente fala.
// ============================================================================

import type { BaseMessage } from "@langchain/core/messages";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import {
	blocoDeSituacoes,
	fatoDeCanal,
	fatoDeFechamento,
	fatoDeNovato,
	fatoDeRetomadaPosFechamento,
	fatoDeReveal,
} from "@/lib/agent/box/situacoes";
import { blocoDeFechoPendente } from "@/lib/agent/fecho-pendente";
import {
	listShownOffers,
	listShownOffersForConversation,
} from "@/lib/agent/orchestrator/choose-offer";
import { buildGateContextText } from "@/lib/agent/orchestrator/system-context";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import { alvoDeBusca } from "@/lib/agent/qualify-answers";
import { LANCE_EMBUTIDO_DEFAULT_PERCENT } from "@/lib/agent/qualify-config";
import { querAntecipar, shouldAskMotive } from "@/lib/agent/qualify-state";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { vitrineDisponivel } from "@/lib/bevi/identidade-vitrine";
import { dossieDaConversa } from "@/lib/bevi/pessoa";
import { CARDS_QUE_REVELAM_OFERTA } from "@/lib/chat/desbloqueio-do-telefone";
import type { leituraDoDesbloqueio } from "@/lib/chat/telefone-ab-do-servidor";
import { fetchManagedPrompt, PROMPT_NAMES } from "@/lib/observability/langfuse/prompts";
import { projectToMeta } from "../emit";
import { cacheableSystemBlock } from "../provider";
import type { AgentGraphStateType } from "../state";
import type { buildLangGraphTools } from "../tool-adapter";
import {
	blocoDaPessoa,
	blocoDeBemAbandonado,
	blocoDeBuscaVazia,
	blocoDeOpcoesNaTela,
	blocoDoQueEstaNaTela,
} from "./contexto-da-tela";

const REGRA_DE_VITRINE = /\*\*REGRA DURA\s*\[VITRINE\]/i;

function extrairRegrasDuras(fluxo: string): string[] {
	const linhas = fluxo.split("\n");
	const blocos: string[] = [];
	let atual: string[] | null = null;
	const abreOutroItem = (l: string) => /^\s*\d+\.\s+\*\*/.test(l) || /^\s*##\s/.test(l);
	for (const linha of linhas) {
		if (linha.includes("**REGRA DURA")) {
			if (atual) blocos.push(atual.join("\n").trimEnd());
			atual = [linha];
			continue;
		}
		if (!atual) continue;
		if (abreOutroItem(linha)) {
			blocos.push(atual.join("\n").trimEnd());
			atual = null;
			continue;
		}
		atual.push(linha);
	}
	if (atual) blocos.push(atual.join("\n").trimEnd());

	// Regras marcadas `[VITRINE]` só valem no mundo COM vitrine — sem ela sairiam
	// contradizendo o bloco de ordem na MESMA janela do modelo.
	//
	// O marcador é ESTRUTURAL de propósito. A primeira versão filtrava pela frase
	// ("custa documento"), e isso quebrava em silêncio se alguém reescrevesse a
	// regra — inclusive pela UI do Langfuse, que edita este texto sem passar por
	// teste nenhum. Uma tag no TÍTULO sobrevive à reescrita do corpo, que é o que
	// de fato costuma mudar.
	return vitrineDisponivel() ? blocos : blocos.filter((b) => !REGRA_DE_VITRINE.test(b));
}

function ordemDoFunil(): string {
	const cauda =
		"é decidida pelo SISTEMA (grafo de estado), não por você — nunca tente " +
		'"pular etapas" sozinho nem anuncie a mecânica pro usuário. Fale livremente ' +
		"sobre o que ele trouxer; quando o sistema decidir que é hora de um próximo " +
		"passo estruturado, ele te avisa (ferramenta liberada ou card na tela).";
	if (!vitrineDisponivel()) {
		return `A ordem de coleta (nome → objetivo → valor do bem → identidade → busca →
recomendação) ${cauda}`;
	}
	return `A ordem (bem → valor → busca → recomendação → escolha → identidade → contrato)
${cauda}

Repare onde a identidade entra: no FIM. As cartas reais aparecem com o valor que
o cliente deu, sem documento nenhum — o CPF só é pedido depois que ele escolheu
a cota, e quem pede é o sistema.`;
}

export function blocoDoJaRespondido(args: {
	categoria?: string | null;
	desiredItem?: string;
	valorDoBem?: number;
	prazoMeses?: number;
	lance?: "yes" | "maybe" | "no" | "so_parcela";
	lanceValue?: number;
	lanceEmbutido?: boolean;
}): string | null {
	const brl = (n: number) => `R$ ${n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
	const linhas: string[] = [];
	if (args.desiredItem) linhas.push(`- o bem que ele quer: ${args.desiredItem}`);
	if (args.categoria) linhas.push(`- a categoria: ${args.categoria}`);
	if (args.valorDoBem) linhas.push(`- o valor do bem que ele informou: ${brl(args.valorDoBem)}`);
	if (args.prazoMeses) linhas.push(`- o prazo que ele escolheu: ${args.prazoMeses} meses`);
	if (args.lance === "yes" || args.lance === "maybe") {
		linhas.push(
			`- ele ${args.lance === "yes" ? "vai dar" : "talvez dê"} lance` +
				(args.lanceValue ? ` de ${brl(args.lanceValue)}` : "") +
				", já respondido no gate do lance",
		);
	}
	if (args.lance === "no" || args.lance === "so_parcela") {
		linhas.push("- ele NÃO quer comprometer nada além da parcela (já respondido)");
	}
	if (args.lanceEmbutido === true) linhas.push("- ele aceitou usar lance embutido");
	if (linhas.length === 0) return null;
	return (
		"FATO: estas perguntas do funil JÁ FORAM RESPONDIDAS por ele. NÃO as faça de novo — nem " +
		'quando a conversa parecer recomeçar (um cumprimento, um "oi"): retome o que ele já disse.\n' +
		linhas.join("\n")
	);
}

export function leanSystemPrompt(base: string = SYSTEM_PROMPT): string {
	const flowHeading = "## Fluxo de Vendas";
	const nextHeading = "## Regras de Ouro";
	const flowStart = base.indexOf(flowHeading);
	const nextStart = base.indexOf(nextHeading);
	if (flowStart === -1 || nextStart === -1) return base;
	const before = base.slice(0, flowStart);
	const after = base.slice(nextStart);
	// AS REGRAS DURAS SOBREVIVEM AO CORTE (2026-08-27).
	//
	// A poda existe por custo de contexto e continua valendo — mas ela recortava
	// a seção "## Fluxo de Vendas" inteira, e é lá que moram as regras que
	// governam a FALA. Resultado medido: `SYSTEM_PROMPT` tinha a regra de "buscar
	// oferta não custa documento", e o texto que chegava ao modelo NÃO tinha —
	// enquanto o bloco substituto abaixo ensinava a ordem antiga em todo turno.
	//
	// Trabalho de prompt que não sobrevive ao recorte é texto morto, e o
	// `prompts:check` não pega (ele compara a constante, não o que é enviado).
	// Ver `lean-prompt-entrega-as-regras.test.ts`, que asserta sobre ESTE
	// retorno — o único artefato que o modelo de fato recebe.
	const regrasDuras = extrairRegrasDuras(base.slice(flowStart, nextStart)).join("\n\n");
	return `${before}${after}${regrasDuras ? `\n\n${regrasDuras}` : ""}

## Ordem do funil
${ordemDoFunil()}`;
}

export function resumeAfterCloseSection(
	contractClosed: boolean,
	isResumeGreeting: boolean,
	administradora: string | null | undefined,
): string | null {
	// CONDUTA migrada para a caixa ("### retomada-pos-fechamento"). O que sobra
	// aqui é o FATO: fechou, ele voltou, e com qual administradora. A instrução de
	// reconhecer a reserva na primeira frase (FIX-368) mora na caixa, onde pode ser
	// ajustada sem deploy.
	if (!contractClosed || !isResumeGreeting) return null;
	return blocoDeSituacoes([fatoDeRetomadaPosFechamento({ administradora })]);
}

export type ContextoDoTurno = {
	state: AgentGraphStateType;
	config: LangGraphRunnableConfig;
	tools: ReturnType<typeof buildLangGraphTools>;
	desbloqueio: Awaited<ReturnType<typeof leituraDoDesbloqueio>> | null;
	desbloqueioPendente: boolean;
};

export type SystemDoTurno = Awaited<ReturnType<typeof montarContextoDoTurno>>;

export async function montarContextoDoTurno(ctx: ContextoDoTurno) {
	const { state, config, tools, desbloqueio, desbloqueioPendente } = ctx;
	const gateAtivo = state.gate ?? state.answeredGate;
	// Beat do MOTIVO — turno próprio, logo depois do bem. Sem isto o gate
	// `desire` pedia bem + motivo no mesmo balão e o cliente respondia só um.
	const pedirMotivo = state.isUserTurn && shouldAskMotive(projectToMeta(state));
	// O que o CARD deste turno pede — o fato que evita a fala pedir uma coisa e a
	// tela pedir outra. No gate `credit` da web, o que está na tela é a agulha do
	// VALOR do bem com a parcela estimada ao vivo. O texto tem que pedir o valor;
	// perguntar o modelo antes do valor morreu em 15 de 31 conversas (02–05/10).
	// O CARD DO VALOR só está na tela quando o gate `credit` é o card DESTE
	// turno. `state.gate` é o card que de fato vai aparecer (`routeNode` só o
	// preenche quando `decideShowGate` libera); `state.answeredGate` é o gate que
	// o funil AGUARDA, mesmo suprimido. Olhar os dois (`??`) afirmava que a
	// agulha do valor estava na tela em turno em que ela não estava — e o texto
	// pedia o valor apontando para um card inexistente.
	const cardDoValorNaTela = !pedirMotivo && state.gate === "credit" && state.channel === "web";
	const gateContextText = pedirMotivo
		? `Próximo passo do funil: descobrir por que ele quer isso AGORA — o que mudou, o ` +
			`que está pesando. Faça VOCÊ essa pergunta, com as suas palavras, UMA pergunta só; ` +
			`o sistema mostra os atalhos de resposta logo depois e NÃO vai repetir a pergunta.`
		: cardDoValorNaTela
			? `O CARD DESTE TURNO pede o VALOR do bem: a tela mostra a agulha do valor com a ` +
				`parcela estimada se movendo junto. Faça VOCÊ a pergunta do valor, com as suas ` +
				`palavras e de forma calorosa — o sistema mostra o campo logo depois e NÃO vai ` +
				`repetir. É PROIBIDO perguntar o modelo/versão do bem antes do valor: se ele já ` +
				`contou o modelo, reaja a isso numa frase e siga direto para o valor. Faça UMA ` +
				`pergunta só, sobre ISSO.`
			: buildGateContextText(gateAtivo, Boolean(state.gate));

	const brl = (n: number) => `R$ ${n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;

	// ── LANCE EMBUTIDO: a conta que faz o vendedor parecer vendedor ──
	// O embutido sai DA PRÓPRIA CARTA (até 30%), então o crédito recebido cai.
	// Quem quer o bem de R$ X e não tem dinheiro pra lance NÃO deve mirar uma
	// carta de R$ X — tem que mirar `X / (1 - pct)`, senão contempla e falta
	// dinheiro. O agente explicava o embutido sobre a carta atual ("usa uma
	// fatia dos R$ 92.902"), que é justamente o conselho errado. A conta é
	// invariante → vive aqui, em código; a venda é do modelo.
	const pctEmbutido =
		state.funnel.qualifyAnswers.lanceEmbutidoPercent ?? LANCE_EMBUTIDO_DEFAULT_PERCENT;
	const valorDoBem =
		state.funnel.qualifyAnswers.valorDoBemAlvo ?? state.funnel.qualifyAnswers.creditMax;
	const jaAceitouEmbutido = state.funnel.qualifyAnswers.lanceEmbutido === true;
	// Este bloco entra SÓ quando o lance está em jogo. Ele estava sendo injetado
	// em todo turno pós-valor, e um contexto que explica embutido em detalhe é um
	// convite pro modelo puxar o assunto: o cliente respondia "sem pressa, quero
	// menor parcela" e no turno seguinte ouvia "quer que eu te explique o lance
	// embutido?" — justamente o que ele acabou de dispensar. A ordem do funil é
	// código (`nextGate`), mas o CONTEXTO também precisa respeitá-la.
	const lanceEstaEmJogo =
		gateAtivo === "lance" ||
		gateAtivo === "lance-value" ||
		gateAtivo === "lance-embutido" ||
		querAntecipar(state.funnel.qualifyAnswers) ||
		/\blance|embutid|antecip|contempla[çc]/i.test(state.userText ?? "");
	const blocoEmbutido =
		valorDoBem && lanceEstaEmJogo && !desbloqueioPendente
			? `Regra do lance embutido (fato, não opinião): o embutido sai DA PRÓPRIA CARTA, até ` +
				`${pctEmbutido}% dela — então o crédito que o cliente recebe DIMINUI nessa proporção. ` +
				`O bem que ele quer custa ${brl(valorDoBem)}. É por isso que a carta do tamanho do bem ` +
				`NÃO serve pra quem vai usar embutido: ela deixaria só ` +
				`${brl(Math.round(valorDoBem * (1 - pctEmbutido / 100)))} na mão dele. ` +
				(jaAceitouEmbutido
					? `Ele ACEITOU usar embutido, então o sistema foi buscar GRUPOS DE VALOR MAIOR — cartas ` +
						`em torno de ${brl(Math.round(valorDoBem / (1 - pctEmbutido / 100)))} — pra que, depois ` +
						`do embutido, sobrem os ${brl(valorDoBem)} que ele precisa. As ofertas na tela já são ` +
						`dessa faixa nova: fale delas, não da carta antiga.`
					: `A saída de um vendedor bom é procurar grupos de carta MAIOR, em torno de ` +
						`${brl(Math.round(valorDoBem / (1 - pctEmbutido / 100)))}, e deixar o embutido encolher ` +
						`aquilo até os ${brl(valorDoBem)} que ele precisa — nunca cortar o crédito da carta que ` +
						`ele já escolheu. Se ele topar, o sistema busca esses grupos maiores automaticamente.`) +
				` Use esses números quando o assunto for lance/embutido; nunca invente outros.`
			: null;

	// A busca já rodou (nó `discovery`, agora ANTES deste) — os cards com as
	// ofertas REAIS já estão montados. Sem este bloco o modelo não sabia disso e
	// prometia "só um segundo que já te trago", como se a busca ainda fosse
	// acontecer. Os NÚMEROS vêm daqui (do estado, coagidos contra o grupo real),
	// nunca da cabeça dele; a APRESENTAÇÃO é dele.
	const oferta = state.funnel.recommendedOffer;

	// ── O TELEFONE AINDA É PEDÁGIO: AS OPÇÕES EXISTEM, MAS NÃO TÊM NÚMERO ──
	// D1 do FIX-432: enquanto o desbloqueio está pendente (`pede-antes` no braço A,
	// `borrado` no B), o modelo NÃO recebe carta, parcela, prazo, taxa, contemplação
	// nem lance da oferta — nem nos blocos de contexto, nem por tool de número. No
	// lugar, recebe o FATO verdadeiro: a busca já rodou e as opções aparecem quando o
	// cliente informar o WhatsApp no card. É contexto, não fala: nenhuma frase fixa
	// vai ao cliente.
	const blocoOfertaAguardandoTelefone =
		desbloqueioPendente && oferta
			? `O sistema JÁ BUSCOU as opções para este cliente, mas elas ainda NÃO foram ` +
				`liberadas: os valores só aparecem depois que ele informar o WhatsApp no card de ` +
				`telefone. Você NÃO tem esses números agora. É PROIBIDO citar carta, parcela, ` +
				`prazo, taxa, contemplação ou lance da oferta, e é PROIBIDO dizer que os valores ` +
				`"estão na tela" para ele conferir. Se ele pedir números ou opções, diga com ` +
				`naturalidade que falta um passo: informar o WhatsApp no card, e as opções ` +
				`liberam. Quem pede o telefone é o card, não você por texto.`
			: null;

	// O CARD DESTE TURNO, quando a busca já rodou e o telefone ainda não chegou:
	// quem pede o próximo passo é o CARD do WhatsApp — não a pergunta do funil.
	// Sem isto, o `gateContextText` mandava o modelo perguntar experiência/prazo
	// enquanto o card pedia o telefone: duas perguntas no mesmo turno e a pessoa
	// respondia nenhuma (medido 02–05/10). O card é a autoridade da janela.
	// O CARD DO TELEFONE só é EMITIDO no turno em que um artifact que revela
	// oferta chega — a MESMA regra do `adapter` (`src/lib/web/adapter.ts`), que
	// escreve o `telefone_do_desbloqueio` junto do primeiro card de oferta do
	// turno. Nos turnos seguintes a oferta continua no estado, mas o card NÃO
	// reaparece: afirmar "NESTE turno o card aparece" manda o modelo apontar para
	// um card que não está na tela e trava o funil. Com o desbloqueio pendente as
	// tools de reveal não são vinculadas, então a única fonte de card do turno é
	// o `discovery` (eventos do estado) ou o `emitCard` (card pendente) — os dois
	// são emitidos neste mesmo turno.
	const cardDeOfertaEmitidoNesteTurno =
		Boolean(state.funnel.pendingRecommendationCard) ||
		state.events.some(
			(ev) => ev.type === "artifact" && CARDS_QUE_REVELAM_OFERTA.has(ev.artifactType),
		);
	const cardDoTelefoneNaTela =
		desbloqueioPendente && Boolean(oferta) && cardDeOfertaEmitidoNesteTurno;
	const conducaoDoTurno = cardDoTelefoneNaTela
		? `NESTE turno o card que pede o WhatsApp aparece na tela, junto com a sua fala: ` +
			`informar o número ali é o que LIBERA a comparação. Conduza para esse card em UMA ` +
			`frase natural (as opções já estão prontas e falta só o telefone pra elas aparecerem) ` +
			`e NÃO faça nenhuma outra pergunta neste turno — nem experiência prévia, nem prazo, ` +
			`nem lance, nem qualquer etapa do funil. Quem pede o telefone é o card, nunca você ` +
			`por texto.`
		: gateContextText;

	// ── O QUE ELE JÁ VIU NA TELA ──
	// O contexto só carregava a oferta RECOMENDADA, então o modelo não sabia
	// quais outras opções tinham sido exibidas — e, quando o cliente falava
	// delas ("vamos de prazo mais curto", "aquela do Itaú"), ele devolvia o
	// trabalho: "pode me confirmar a administradora ou o valor da parcela dela
	// pra eu não errar o grupo?". O cliente respondeu o óbvio ("não decorei os
	// valores"), e numa das conversas isso travou a venda inteira: três
	// pedidos seguidos pra ela repetir o que estava no card acima.
	// Quem tem a proposta na mão é o vendedor.
	// A lista vinha SÓ do banco — e no turno em que os cards nascem eles ainda
	// não foram gravados (`persist` roda depois deste nó). Ou seja: exatamente
	// no turno em que o modelo apresenta as ofertas, ele não tinha nenhuma
	// delas no contexto. Foi assim que saiu "as parcelas variam entre R$ 250 e
	// R$ 400" no mesmo turno em que o card na tela dizia R$ 484,16.
	const doBanco = state.funnel.revealCompleted
		? await listShownOffersForConversation(state.conversationId).catch(() => [])
		: [];
	const doTurno = listShownOffers(
		state.events
			.filter((ev): ev is Extract<TurnEvent, { type: "artifact" }> => ev.type === "artifact")
			.map((ev) => ({ type: ev.artifactType, payload: ev.payload })),
	);
	const vistos = new Set(doBanco.map((o) => o.groupId).filter(Boolean));
	const ofertasExibidas = [...doBanco, ...doTurno.filter((o) => !vistos.has(o.groupId))];
	// ── A PESSOA, NÃO A CONVERSA (fio cruzado L1 → turno) ──
	//
	// O dossiê cross-canal vem do telefone → contato → TODAS as conversas dele.
	// Sem este bloco, o único caminho vivo era a tool `check_proposal_status`
	// (só quando o modelo pergunta) — e o defeito medido foi o agente AFIRMAR
	// por conta própria que a proposta já estava registrada quando ela existia
	// em OUTRA conversa (web `a1b2c3d4` / WhatsApp `e5f6a7b8`, a mesma pessoa).
	//
	// `dossieDaConversa` LANÇA em erro de leitura de propósito; `.catch(() => null)`
	// aqui é a decisão certa: o turno segue sem o bloco em vez de receber um
	// dossiê vazio como "nada registrado".
	const dossie = await dossieDaConversa(state.conversationId).catch(() => null);
	const blocoPessoa = dossie ? blocoDaPessoa(dossie) : null;
	// Os NÚMEROS que o cliente está vendo, e o que a última busca respondeu.
	// Sem estes dois o modelo preenchia o vácuo com otimismo: anunciou faixa de
	// parcela que não existia no card, e afirmou que "as opções apareceram" no
	// mesmo turno em que a busca voltou vazia. Proibir a frase não devolvia o
	// dado a ele — estes blocos devolvem.
	const blocoTela = desbloqueioPendente ? null : blocoDoQueEstaNaTela(ofertasExibidas);
	// O que ele JÁ respondeu — para o modelo não reabrir pergunta fechada
	// (medido em produção, 21/09/2026: um "Oi" depois de o cliente já ter dito o
	// carro reabria "que carro você tem em mente?").
	const blocoJaRespondido = blocoDoJaRespondido({
		categoria: state.funnel.currentCategory,
		desiredItem: state.funnel.qualifyAnswers.desiredItem,
		valorDoBem: state.funnel.qualifyAnswers.valorDoBemAlvo ?? state.funnel.qualifyAnswers.creditMax,
		prazoMeses: state.funnel.qualifyAnswers.prazoMeses,
		lance: state.funnel.qualifyAnswers.hasLance,
		lanceValue: state.funnel.qualifyAnswers.lanceValue,
		lanceEmbutido: state.funnel.qualifyAnswers.lanceEmbutido,
	});
	// O bem que ele largou no meio do caminho. Sem este fato, a ironia sobre o
	// valor antigo ("ta maluco 1,5 milhão numa moto?") foi lida como intenção
	// de compra em 2 de 7 conversas — uma delas propondo, no último turno,
	// "voltar ao plano original, a casa de R$ 1,5 milhão", com o funil vivo.
	const blocoAbandono = state.funnel.currentCategory
		? blocoDeBemAbandonado({
				categoriaAtual: state.funnel.currentCategory,
				valorAtual: state.funnel.qualifyAnswers.creditMax,
				categoriaAnterior: state.funnel.bemAbandonado?.categoria,
				valorAnterior: state.funnel.bemAbandonado?.valor,
			})
		: null;
	const blocoVazia =
		!desbloqueioPendente && (state.funnel.discoveryEmptyStreak ?? 0) > 0
			? blocoDeBuscaVazia({
					alvo: alvoDeBusca(state.funnel.qualifyAnswers),
					parcelaAlvo: state.funnel.qualifyAnswers.parcelaAlvo,
					creditMax: state.funnel.qualifyAnswers.creditMax,
					ofertasNaTela: ofertasExibidas,
				})
			: null;
	// A lista do que ele já viu, COM contemplados por mês — o dado que decide
	// compra de consórcio e que ficava só no objeto do servidor (D4). O corte
	// de oito itens também saiu daqui: escondia a 11ª cota e o agente contou
	// errado o que estava na tela. Ver `blocoDeOpcoesNaTela`.
	const blocoOpcoesNaTela = desbloqueioPendente ? null : blocoDeOpcoesNaTela(ofertasExibidas);

	// A instrução da TOOL fica separada da lista de propósito: ela só pode
	// entrar na janela quando a tool existe no bind.
	//
	// O beat da âncora roda SEM tools (`executarBeat(false)`) e remontava o
	// system com todos os blocos, este incluído. Mandar "chame `escolher_cota`
	// com o id entre colchetes" a um modelo que não tem tool nenhuma é o
	// atrator clássico de emitir a chamada como TEXTO — e foi nesse formato,
	// com o id entre colchetes, que o vazamento chegou à tela do cliente na web
	// (`ff8f2080`, 16/08/2026: "[card: escolher_cota com id 6a7b59c1…]").
	const blocoChamarEscolherCota =
		!desbloqueioPendente && ofertasExibidas.length > 1
			? // Falar os números certos NÃO basta: sem esta chamada o sistema segue
				// ancorado na cota anterior e a contratação fecha errada. Foi assim
				// que um cliente escolheu a carta de R$ 120 mil com parcela de
				// R$ 1.289 e recebeu a proposta de outra, de R$ 132 mil e R$ 3.375.
				`ASSIM QUE ele escolher uma, chame \`escolher_cota\` com o id entre colchetes — é essa ` +
				`chamada que faz a contratação sair com a cota certa. O id é interno: nunca fale ele ` +
				`pro cliente.`
			: null;

	// ── O LANCE DELE ALCANÇA? ──
	// O cliente diz "tenho 100 mil", o card mostra lance médio de R$ 183 mil, e
	// o agente respondia "baita empurrão!" sem ligar os dois pontos — porque a
	// comparação não existia no contexto dele, só no card. Um vendedor faz essa
	// conta na hora e é ela que abre o embutido de forma natural. Comparação
	// numérica é invariante → nasce aqui; a fala continua sendo dele.
	const lanceDele = state.funnel.qualifyAnswers.lanceValue ?? 0;
	const lanceMedio = oferta?.avgBidValue;
	// O embutido É lance: sai da própria carta e entra na disputa junto com o
	// dinheiro do bolso. Comparar só o que o cliente tem guardado contra o lance
	// médio subestimava a posição dele e, pior, deixava o agente vender
	// "contemplação rápida" sem saber se a conta fecha. Só conta quando ele
	// ACEITOU usar embutido — antes disso é hipótese, não recurso.
	const embutidoDisponivel =
		state.funnel.qualifyAnswers.lanceEmbutido === true && oferta?.creditValue
			? Math.round(oferta.creditValue * (pctEmbutido / 100))
			: 0;
	const lanceTotal = lanceDele + embutidoDisponivel;
	// ── A ESCOLHA ESTÁ FEITA: o estado sabe qual é ──
	// Não é mais o modelo inferindo do histórico se a decisão saiu: o funil
	// grava `escolha` quando ela é verificável (cota nomeada pelo cliente ou
	// critério já capturado — `advance.ts`). O que este bloco entrega são os
	// FATOS da cota escolhida; a fala continua sendo dele.
	const escolha = state.funnel.escolha;
	const querMenorParcela =
		state.funnel.qualifyAnswers.objetivo === "investimento" ||
		(state.funnel.qualifyAnswers.prazoMeses ?? 0) >= 120;
	const blocoEscolha =
		escolha && oferta?.monthlyPayment && !desbloqueioPendente
			? `A ESCOLHA JÁ ESTÁ FEITA — está no estado desta conversa, não é suposição sua: ` +
				`${oferta.administradora}, ${brl(oferta.monthlyPayment)} por mês em ${oferta.termMonths} ` +
				`meses.${
					querMenorParcela
						? ` O critério dele foi a MENOR PARCELA (ele disse que não tem pressa), e a busca foi ` +
							`calibrada assim — pelo prazo mais longo disponível, que é o que deixa a parcela mais leve.`
						: ""
				} Fale dela como decidida e siga pro fechamento. NÃO pergunte de novo qual opção ele quer, ` +
				`nem peça confirmação do que já está definido. Se ELE pedir outra, aí sim você busca.`
			: null;

	// ── O GRUPO MUDOU: o número de antes era de outro grupo ──
	// Quando o cliente aceita embutido, o sistema busca cartas MAIORES e a
	// oferta ancorada troca — junto com ela troca o lance médio. O agente
	// continuava citando o número antigo em algum ponto da conversa, e o
	// cliente via três "lance médio deste grupo" diferentes, sem nada explicar
	// (visto ao vivo, 2026-07-21). O fato é do código; a frase é dele.
	const blocoGrupoTrocado =
		jaAceitouEmbutido && oferta?.avgBidValue && !desbloqueioPendente
			? `A oferta na mesa MUDOU quando ele aceitou o embutido: o sistema foi atrás de cartas ` +
				`maiores, e o grupo é outro. Qualquer lance médio que você tenha citado ANTES era de ` +
				`outro grupo e não vale mais. O número que vale agora é ${brl(oferta.avgBidValue)}. Se ` +
				`for falar disso de novo, diga que o grupo mudou — nunca deixe dois números diferentes ` +
				`no ar como se fossem do mesmo grupo.`
			: null;

	const blocoLance =
		lanceTotal > 0 && lanceMedio && !desbloqueioPendente
			? lanceTotal >= lanceMedio
				? `O lance dele ALCANÇA o lance médio desse grupo (${brl(lanceMedio)}): ` +
					(embutidoDisponivel > 0
						? `${brl(lanceDele)} do bolso + ${brl(embutidoDisponivel)} de embutido = ` +
							`${brl(lanceTotal)}. `
						: `${brl(lanceTotal)}. `) +
					`Diga isso com clareza — é a posição dele, não uma promessa de contemplação, que ` +
					`ninguém pode garantir.`
				: `ATENÇÃO, o fato mais importante deste momento: o lance dele NÃO alcança o lance ` +
					`médio desse grupo (${brl(lanceMedio)}). ` +
					(embutidoDisponivel > 0
						? `Somando tudo — ${brl(lanceDele)} do bolso + ${brl(embutidoDisponivel)} de ` +
							`embutido — dá ${brl(lanceTotal)}, e ainda faltam ${brl(lanceMedio - lanceTotal)}. ` +
							`Diga isso com todas as letras, mesmo sendo desconfortável: é PROIBIDO vender ` +
							`contemplação rápida quando a conta não fecha. Ofereça as saídas reais — juntar ` +
							`a diferença, mirar um prazo maior, ou olhar um grupo com lance médio menor.`
						: `Faltam ${brl(lanceMedio - lanceTotal)}. Não elogie o valor dele e siga em ` +
							`frente como se estivesse resolvido: diga onde ele está, sem drama, e mostre a ` +
							`saída — é exatamente para isso que existe o lance embutido, que completa a ` +
							`diferença usando parte da própria carta, sem ele tirar mais nada do bolso.`) +
					` Nunca prometa contemplação: lance médio é posição, não garantia.`
			: null;

	// Basta a oferta EXISTIR no estado — a busca já rodou em ALGUM turno. Antes
	// isto exigia artifact NESTE turno, então em todo turno pós-reveal (liberar o
	// hero, responder "sim, quero ver") o modelo ficava sem saber que os números
	// já estavam apurados e improvisava "só um instante que vou confirmar com a
	// administradora e já te trago" — duas, três vezes seguidas, sem nunca trazer
	// nada, porque não havia nada a buscar. O card já estava pronto no estado.
	// Oferta MARCADA como stale (a última busca voltou vazia) não autoriza o
	// agente a dizer "as ofertas já foram buscadas e estão na tela" — foi essa
	// afirmação, sobre uma oferta de três faixas atrás, que o cliente recebeu
	// depois de quatro buscas em branco. Ela continua valendo para escolha e
	// contratação (o card segue visível); o que ela perde é o direito de virar
	// anúncio de descoberta nova.
	const temCardsDeOferta = Boolean(oferta) && state.funnel.recommendedOfferStale !== true;
	// Critério VERIFICÁVEL da recomendação — o cliente consegue conferir na
	// lista que acabou de ver. O card hero vinha MUDO: aparecia sem nenhuma
	// frase dizendo em QUÊ aquela opção é a melhor, e o cliente tinha que abrir
	// um acordeão pra descobrir. "Melhor opção" sem dizer melhor em quê não
	// vende — e, pior, soa a truque.
	const blocoOfertas =
		temCardsDeOferta && oferta && !desbloqueioPendente
			? `As ofertas REAIS das administradoras JÁ FORAM BUSCADAS e os cards estão na tela. ` +
				`Você NUNCA precisa buscar, confirmar ou validar nada com a administradora: os números ` +
				`abaixo são finais. É PROIBIDO dizer "só um instante", "vou confirmar", "já te trago", ` +
				`"já já te mostro" ou qualquer promessa de trazer algo depois — se o cliente pede pra ` +
				`ver, você MOSTRA agora, falando dos números. A que melhor atende: ` +
				`${oferta.administradora} — carta de ` +
				`${brl(oferta.creditValue)}, parcela de ${brl(oferta.monthlyPayment)} em ` +
				`${oferta.termMonths} meses. Apresente como um vendedor de consórcio experiente: ` +
				`diga o que encontrou, aponte o que chama atenção nesses números e por quê. ` +
				`NUNCA diga que vai buscar ou que "já já traz" — a busca já aconteceu.` +
				(oferta.groupId
					? ` Pra simular ESSA cota você NÃO precisa de nada do cliente: o identificador ` +
						`dela é ${oferta.groupId} — chame \`simulate_quota\` com ele e traga os números. ` +
						`É PROIBIDO pedir pro cliente "tocar", "clicar" ou "selecionar" um card pra você ` +
						`conseguir seguir: quem faz o trabalho é você, nunca ele. Também nunca diga que ` +
						`trouxe um card se você não chamou a ferramenta que o desenha.` +
						` Quando ele te der um CRITÉRIO ("quero a menor parcela", "o mais rápido"), ` +
						`NÃO devolva a escolha em forma de pergunta ("qual delas você quer?"): você tem ` +
						`os números, então DIGA qual atende o critério dele e por quê. Devolver a decisão ` +
						`pra quem acabou de dizer como quer decidir é o oposto de vender.`
					: "")
			: null;
	// ── PRIMEIRA VEZ: a pergunta que não pode morrer sem resposta ──
	// O funil pergunta "já fez consórcio antes?", o cliente responde "é a
	// primeira vez"… e o agente seguia direto pra pergunta seguinte. Coletar
	// e não usar é o comportamento de formulário que este produto combateu.
	// Só no turno em que a resposta CHEGA (o gate já resolveu, mas a fala
	// ainda não aconteceu) — depois disso o assunto não volta.
	// Guiado por FLAG, não por "aconteceu neste turno": amarrar no turno exato
	// era frágil (quando o `converse` roda, o `route` já avançou o gate) e, se
	// o modelo ignorasse a instrução uma vez, a explicação sumia pra sempre. Com
	// a flag, ela insiste até acontecer — e acontece uma vez só.
	const deveExplicarComoFunciona =
		state.funnel.experiencePrev === "first" && !state.funnel.explicouComoFunciona;
	// CONDUTA migrada para a caixa ("### novato", em `system-prompt.ts` / prompt
	// gerenciado): como explicar consórcio a quem é de primeira viagem deixou de
	// ser texto em código. Aqui fica só o fato do turno.
	const blocoNovato = deveExplicarComoFunciona ? blocoDeSituacoes([fatoDeNovato()]) : null;

	// ── O CANAL NÃO TEM TELA ──
	// No WhatsApp não existe card, botão nem "aqui em cima": tudo é mensagem.
	// O agente dizia "das opções que você viu na tela" e "aqui na minha tela
	// preciso que você confirme", e o cliente não tinha tela nenhuma.
	// FIX-431: a regra de CPF mora AQUI, não no prompt global. "Nunca peça
	// dados pessoais por texto" é verdade na web (o formulário é a tela) e
	// MENTIRA no WhatsApp, onde a identidade sempre chegou por mensagem
	// (`whatsapp/adapter.ts` pede o CPF por texto; `identify-capture.ts` o lê
	// do texto). Produção 2026-08-13: o cliente ofereceu o CPF e o agente
	// recusou — obedecendo, corretamente, à regra do canal errado.
	// CONDUTA migrada para a caixa ("### canal"): como escrever em cada canal
	// (sem tela no WhatsApp, formulário na web) é orientação, não estado. O
	// código entrega o fato do canal e a caixa decide a redação.
	const blocoCanal = blocoDeSituacoes([fatoDeCanal(state.channel)]);

	// ── A CONTRATAÇÃO FOI OFERECIDA E AINDA NÃO ACONTECEU ──
	// No web a contratação se conclui com o cliente confirmando os dados no
	// formulário (é ali que o consentimento acontece). Quando ele responde por
	// texto — "pode confirmar sim" —, o modelo achava que estava feito e
	// respondia "seus dados já estão confirmados no sistema, o pré-cadastro
	// segue direto": afirmação de uma ação que NÃO aconteceu, e o cliente
	// ficava esperando ("cadê o passo de contratação? não apareceu nada").
	//
	// A condição era `channel === "web"`, então no WhatsApp este fato nunca
	// entrava na janela — e é exatamente ali que ele mais falta, porque lá não
	// há formulário na tela para o cliente ver que falta algo. Em `fd76e393`
	// (prod, 16/08/2026) o turno final foi "Pronto, Kairo! Sua proposta está
	// fechada…" com zero propostas no banco. O texto por canal mora em
	// `agent/fecho-pendente.ts`.
	const blocoFormularioAberto = blocoDeFechoPendente({
		channel: state.channel,
		contractFormDispatched: state.funnel.contractFormDispatched,
		contractClosed: state.baseMeta.contractClosed,
	});

	// ── A BUSCA NÃO TROUXE NADA ──
	// O contexto só falava quando HAVIA oferta. Quando a administradora falhava
	// (timeout, HTML no lugar de JSON — acontece), o modelo ficava sem
	// informação nenhuma e preenchia o vazio com otimismo: anunciou "Encontrei
	// ótimas opções aí na sua faixa de R$ 190 mil!" sem ter encontrado nada, e
	// dois turnos depois teve que se desculpar ("ainda não te mostrei nada").
	// Afirmar achado que não existe é a pior mentira possível numa venda.
	// A condição arma por FATO do turno, não só por ausência de âncora. Busca
	// que volta vazia não marca `searchDispatched` (o retry fica liberado), e
	// enquanto uma oferta velha continuasse ancorada este bloco ficava
	// desarmado exatamente na hora em que era necessário — foi assim que o
	// contexto afirmou "as ofertas já foram buscadas e os cards estão na tela"
	// com a última busca em branco (`fa0533a0-…`, 13/08).
	const buscaJaTentada =
		state.funnel.searchDispatched === true || (state.funnel.discoveryEmptyStreak ?? 0) > 0;
	const blocoBuscaVazia =
		buscaJaTentada && !oferta
			? `A busca de ofertas JÁ foi tentada nesta conversa e NÃO há nenhuma oferta ancorada agora ` +
				`— nenhum card de oferta está na tela. É PROIBIDO dizer que encontrou opções, que "achei ` +
				`ótimas opções", que elas "estão aí" ou pedir que ele escolha entre opções que ele não ` +
				`viu. Se ele perguntar pelas opções, seja honesto: você ainda não tem os números pra ` +
				`mostrar e está atrás deles. Nunca invente carta, parcela ou administradora.`
			: null;

	// ── A CARTA NÃO COBRE O BEM ──
	// A carta real vem em denominações do grupo e quase nunca bate com o preço
	// do bem. Quando ela vem MENOR, o cliente vai ter que tirar a diferença do
	// bolso na hora da compra — e isso não estava sendo dito: um cliente ouviu
	// que crédito líquido de R$ 118.500 era "um cenário mais tranquilo" pro
	// carro de R$ 150 mil que ele queria, e outro fechou carta de R$ 225.759
	// pra uma sala de R$ 250 mil sem que o buraco fosse retomado no fecho.
	// A conta é verificável → código. O jeito de dizer é do modelo.
	const faltaParaOBem =
		valorDoBem && oferta?.creditValue && oferta.creditValue < valorDoBem
			? valorDoBem - oferta.creditValue
			: 0;
	const blocoCartaMenor =
		!desbloqueioPendente && faltaParaOBem > 0
			? `ATENÇÃO — a carta NÃO cobre o bem que ele quer: a carta é de ${brl(
					oferta?.creditValue as number,
				)} e o bem custa ${brl(valorDoBem as number)}, então faltam ${brl(faltaParaOBem)} ` +
				`que sairiam do bolso dele na hora da compra. Diga isso com todas as letras ANTES de ` +
				`seguir pro fechamento — é dinheiro dele. Nunca apresente uma carta menor que o bem ` +
				`como boa notícia ou alívio. Se houver carta maior disponível, ofereça.`
			: null;

	// ── QUEM É O CLIENTE, E O QUE ELE JÁ ENTREGOU ──
	// O prompt manda "verifique a system message «Nome do usuario» antes de
	// perguntar o nome" — e essa injeção só existia no runtime Vercel
	// (`orchestrator/system-context.ts`). No LangGraph o modelo nunca via nada
	// disso: pedia o nome de quem o WhatsApp já identifica pelo perfil e, no
	// fim da conversa, dizia "seus dados eu não tenho aqui comigo" a um cliente
	// que tinha passado CPF e celular dez turnos antes (visto ao vivo).
	const blocoIdentidade = [
		state.contactName ? `Nome do usuario: "${state.contactName}".` : null,
		state.contactName
			? "Ele JÁ está identificado — não pergunte o nome de novo. Use quando fizer sentido, sem forçar em todo balão."
			: null,
		state.funnel.identityCollected
			? "O CPF e o celular dele JÁ estão registrados nesta conversa. É PROIBIDO dizer que você não tem os dados dele ou pedir de novo — a contratação segue com o que já está no sistema."
			: null,
	]
		.filter(Boolean)
		.join(" ");

	// Prompt Management: o texto-base pode vir do Langfuse (label `production`,
	// cache 60s) — fallback OBRIGATÓRIO é o SYSTEM_PROMPT do código. O
	// `llmConfig` linka a VERSÃO usada em cada generation (métrica por versão).
	const { text: baseSystemText, lfPrompt } = await fetchManagedPrompt(
		PROMPT_NAMES.system,
		SYSTEM_PROMPT,
	);
	const llmConfig = lfPrompt
		? { ...config, metadata: { ...config.metadata, langfusePrompt: lfPrompt } }
		: config;

	/** `comTools` = este beat tem tools no bind. Instrução de chamar tool só
	 * entra quando ela existe — ver `blocoChamarEscolherCota`. */
	const montarSystem = (conducao: string | null, comTools = true) =>
		new SystemMessage({
			content: [
				cacheableSystemBlock(leanSystemPrompt(baseSystemText)),
				...(blocoIdentidade ? [{ type: "text" as const, text: blocoIdentidade }] : []),
				...(blocoCartaMenor ? [{ type: "text" as const, text: blocoCartaMenor }] : []),
				...(blocoBuscaVazia ? [{ type: "text" as const, text: blocoBuscaVazia }] : []),
				...(blocoFormularioAberto ? [{ type: "text" as const, text: blocoFormularioAberto }] : []),
				...(blocoCanal ? [{ type: "text" as const, text: blocoCanal }] : []),
				...(blocoOfertas ? [{ type: "text" as const, text: blocoOfertas }] : []),
				...(blocoOfertaAguardandoTelefone
					? [{ type: "text" as const, text: blocoOfertaAguardandoTelefone }]
					: []),
				...(blocoPessoa ? [{ type: "text" as const, text: blocoPessoa }] : []),
				...(blocoTela ? [{ type: "text" as const, text: blocoTela }] : []),
				...(blocoJaRespondido ? [{ type: "text" as const, text: blocoJaRespondido }] : []),
				...(blocoAbandono ? [{ type: "text" as const, text: blocoAbandono }] : []),
				...(blocoVazia ? [{ type: "text" as const, text: blocoVazia }] : []),
				...(blocoOpcoesNaTela ? [{ type: "text" as const, text: blocoOpcoesNaTela }] : []),
				...(comTools && blocoChamarEscolherCota
					? [{ type: "text" as const, text: blocoChamarEscolherCota }]
					: []),
				...(blocoFechamento ? [{ type: "text" as const, text: blocoFechamento }] : []),
				...(blocoRetomadaPosFechamento
					? [{ type: "text" as const, text: blocoRetomadaPosFechamento }]
					: []),
				...(blocoNovato ? [{ type: "text" as const, text: blocoNovato }] : []),
				...(blocoEscolha ? [{ type: "text" as const, text: blocoEscolha }] : []),
				...(blocoGrupoTrocado ? [{ type: "text" as const, text: blocoGrupoTrocado }] : []),
				...(blocoLance ? [{ type: "text" as const, text: blocoLance }] : []),
				...(blocoEmbutido ? [{ type: "text" as const, text: blocoEmbutido }] : []),
				...(conducao ? [{ type: "text" as const, text: conducao }] : []),
			],
		});

	// ── TURNO DE APRESENTAÇÃO: MOSTRA, ANCORA, E DEIXA A PERGUNTA DO FUNIL PRO TURNO SEGUINTE ──
	// No turno em que a busca acabou de rodar, o modelo recebia ao mesmo tempo
	// "apresente as ofertas" e "descubra a experiência do cliente" — e resolvia
	// as duas coisas numa frase só ("Encontrei ótimas opções! E me conta: você
	// já fez consórcio antes?"), com os cards e os atalhos pendurados embaixo.
	//
	// A primeira tentativa foi partir isso em DOIS BALÕES no mesmo turno, com os
	// cards no meio. Não resolveu: na tela (Kairo, 2026-07-30) o resultado foi o
	// agente indicando a carta do Itaú no primeiro balão e, logo abaixo,
	// perguntando "ANTES de eu te indicar a melhor opção...". Ele se contradizia
	// dentro do próprio turno.
	//
	// Agora o turno da busca fala de UM assunto só: as opções que ele achou.
	// Apresenta → cards → âncora ("alguma te chamou atenção?"). A pergunta do
	// FUNIL (experiência, prazo, lance) é do turno seguinte. Aqui só a ESTRUTURA
	// é do código (o que sai, em que ordem, com que respiro) — as palavras são
	// todas do modelo, nos dois balões.
	const turnoDeApresentacao = Boolean(state.apresentaOfertaNesteTurno && blocoOfertas);
	// O turno mostra a RECOMENDAÇÃO (hero liberado pelo `advance`) ou a LISTA
	// recém-buscada? Muda o que o vendedor tem a dizer no primeiro balão.
	const ehRecomendacao = state.events.some(
		(ev) => ev.type === "artifact" && ev.artifactType === "recommendation_card",
	);

	// A conversa enviada ao modelo TEM que terminar numa mensagem de usuário —
	// o Sonnet 5 não aceita prefill de assistente e devolve 400
	// ("This model does not support assistant message prefill"). Num turno de
	// SERVIDOR (`isUserTurn:false`, `pipeDirectiveTurn`) `newMessages` vinha
	// vazio: o array terminava na última fala do agente (→ 400) e, pior, a
	// DIRETIVA nem chegava ao modelo — o turno inteiro rodava sem a instrução
	// que o motivou. Ela entra como turno de usuário ROTULADO (o cliente nunca
	// vê; `pareceDirectiveDeServidor` em persist.ts impede de virar fala dele).
	const turnMessage = state.isUserTurn
		? new HumanMessage(state.userText?.trim() || "(o cliente abriu a conversa)")
		: new HumanMessage(
				`[instrução do sistema — o cliente NÃO vê este texto, não o repita] ${
					state.userText?.trim() || "siga a conversa a partir do ponto em que ela parou"
				}`,
			);
	const newMessages: BaseMessage[] = [turnMessage];
	// ── FECHAMENTO: o que acontece DEPOIS que o cliente confirma ──
	// A adesão na administradora é feita por um atendente humano, e o canal do
	// contato muda conforme onde a conversa aconteceu. São fatos operacionais
	// (quem faz, por onde, qual número) — viram contexto; a fala continua dele.
	// FECHAMENTO — o FATO fica aqui, a CONDUTA vive na caixa.
	//
	// O texto que dizia "não repita nada disso, não peça pra clicar, não liste os
	// próximos passos" estava AQUI, depois da caixa, e portanto vencia a caixa:
	// mudar como o agente fala no fecho exigia engenheiro e deploy. Agora o código
	// entrega só o que o sistema SABE (contrato fechado, quais cards estão na
	// tela, qual administradora) e a conduta correspondente está na seção
	// "Situações do turno" de `system-prompt.ts` / do prompt gerenciado.
	const blocoFechamento = state.baseMeta.contractClosed
		? blocoDeSituacoes([
				fatoDeFechamento({
					canal: state.channel,
					administradora: state.funnel.recommendedAdministradora,
				}),
			])
		: null;

	const blocoRetomadaPosFechamento = resumeAfterCloseSection(
		state.baseMeta.contractClosed === true,
		state.isResumeGreeting === true,
		state.funnel.recommendedAdministradora,
	);

	// TURNO DE APRESENTAÇÃO — de novo, FATO aqui e CONDUTA na caixa. O texto que
	// ordenava fechar sem pergunta, não anunciar pergunta seguinte e dizer por que
	// a opção é a certa pra ele vivia em código e vencia a caixa; agora o turno leva
	// a situação `reveal` com o estado real (recomendou ou não, qual administradora,
	// que valores) e a caixa decide como falar.
	const systemBeat1 = montarSystem(
		turnoDeApresentacao
			? blocoDeSituacoes([
					fatoDeReveal({
						recomendada: ehRecomendacao,
						administradora: oferta?.administradora ?? null,
						valor: oferta?.creditValue ?? null,
					}),
				])
			: conducaoDoTurno,
	);

	return {
		montarSystem,
		systemBeat1,
		llmConfig,
		turnMessage,
		newMessages,
		gateAtivo,
		ofertasExibidas,
		turnoDeApresentacao,
		dossie,
		lfPrompt,
		deveExplicarComoFunciona,
	};
}
