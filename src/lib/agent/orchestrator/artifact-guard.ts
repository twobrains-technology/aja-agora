import type { ConversationMetadata } from "@/lib/agent/personas";
import { nextGate, type UserIntent } from "@/lib/agent/qualify-state";
import type { ArtifactType } from "@/lib/chat/types";
import { revealValueTargetChanged } from "./tool-policy";
import type { Channel } from "./types";
import { shouldEmitWhatsappOptin } from "./whatsapp-optin-guard";

/**
 * FIX-20 (bloco G) — segunda linha de defesa dos artifacts, em tabela
 * declarativa. Cada regra abaixo era um if inline no case tool-call do
 * runner (crescimento orgânico: cada bug de produção de 2026-06-02 a 06-05
 * adicionou um ramo). Todas compartilham a mesma assinatura lógica
 * `(meta, artifactType, contexto do turno) → suprimir|permitir` — é uma
 * tabela de regras, agora explícita.
 *
 * ── Onde este arquivo fica na governança (FIX-180, 2026-07-01) ──
 * A GOVERNANÇA PRIMÁRIA é a allowlist POSITIVA (Lei 2), em duas dimensões:
 *   1. ESTADO → AÇÃO: `tool-policy.ts` (`allowedTools`/`phaseFromMeta`) — tool
 *      fora de fase nem entra no request (fail-closed) + belt `prepareStep.activeTools`.
 *   2. AÇÃO → PRECONDIÇÃO (de dado): `action-policy.ts` (`evaluateActionPrecondition`) —
 *      tool de risco só age sobre grupo/administradora exibido (generaliza FIX-179).
 *
 * ESTE arquivo é a DEFESA-EM-PROFUNDIDADE (2ª linha) — NÃO a governança primária.
 * Segura: (a) o residual das regras de ESTADO que a tool-policy já cobre (é o 2º
 * cinto de whatsapp-optin/post-closure/premature-contract/value-picker-order); e
 * (b) o que é GENUINAMENTE PÓS-FATO e não representável como precondição pré-ação:
 *   - `single-option`: depende do `discoveryCount` (resultado da tool NO turno).
 *   - `reveal-loop`: parte é estado, parte é heurística de intent (userIntent +
 *     isUserTurn + revealValueTargetChanged).
 * Estes DOIS ficam aqui de propósito (não migram pra allowlist). Furo da policy
 * cuja tool estava fora de fase gera [tool-policy-violation] no runner.
 *
 * A ORDEM do array é semântica (primeira regra que aplica vence e assina o
 * log) e é travada por teste em artifact-guard.test.ts. Os formatos de
 * logLine são contrato — cassettes e grep de produção dependem deles.
 */
export type ArtifactGuardInput = {
	meta: ConversationMetadata;
	artifactType: ArtifactType;
	userIntent: UserIntent;
	isUserTurn: boolean;
	/** FIX-338: canal da conversa — o opt-in de WhatsApp só existe no canal
	 * web (o WhatsApp já É o canal ativo, o número já é o `waId`). */
	channel: Channel;
	/** Tamanho da descoberta DESTE turno (tool-results de search/recommend);
	 * null = nenhuma descoberta rodou no turno. */
	discoveryCount: number | null;
	/** FIX-187: a descoberta na Bevi DESTE turno falhou (sinal do FIX-186). Quando
	 * true, nenhum artifact da família de descoberta/proposta pode sair. */
	discoveryFailedThisTurn?: boolean;
	conversationId: string;
	/** Types dos artifacts já emitidos NESTE turno (reservado pra regras
	 * futuras de duplicação intra-turno — nenhuma regra atual consome). */
	turnArtifactTypes?: string[];
	/** O turno RODOU uma simulação nova (`simulate_quota`). Distingue conteúdo
	 * novo (o usuário escolheu um grupo) de re-apresentação do que ele já viu —
	 * é o que o guard `reveal-loop` precisa saber pra não engolir a simulação
	 * pedida só porque o intent saiu `neutral`. */
	freshSimulationThisTurn?: boolean;
};

export type ArtifactGuardVerdict =
	| { allow: true }
	| { allow: false; rule: string; logLine: string };

type ArtifactGuardRule = {
	name: string;
	/** true = SUPRIMIR o artifact deste tool-call. */
	applies: (input: ArtifactGuardInput) => boolean;
	logLine: (input: ArtifactGuardInput) => string;
};

/** Família de artifacts de descoberta/simulação/decisão — morta no estado
 * terminal (FIX-11): pós-fechamento NENHUM deles volta, em qualquer intent. */
const POST_CLOSURE_FAMILY = new Set<ArtifactType>([
	"recommendation_card",
	"simulation_result",
	"comparison_table",
	"group_card",
	"contemplation_dial",
	"decision_prompt",
	"embedded_bid",
	"two_paths",
	"scarcity",
]);

export const ARTIFACT_GUARD_RULES: ArtifactGuardRule[] = [
	// FIX-187 (Kairo 2026-07-01): a descoberta do turno falhou (sinal do FIX-186)
	// → NENHUM artifact da família de descoberta/proposta pode sair (o print: card
	// "Esse plano faz sentido?" com números sobre dado que não carregou). É a regra
	// mais FORTE (1ª da lista) — vence qualquer outra. 2ª linha da defesa: a 1ª é a
	// precondição em action-policy (execute), mas o artifact é emitido do INPUT no
	// tool-call (antes do tool-result), então este guard reativo é quem barra o card.
	{
		name: "discovery-failed",
		applies: ({ artifactType, discoveryFailedThisTurn }) =>
			discoveryFailedThisTurn === true && POST_CLOSURE_FAMILY.has(artifactType),
		logLine: ({ artifactType, conversationId }) =>
			`[discovery-failed] guard: suprimindo ${artifactType} — descoberta do turno falhou, sem dado real pra propor (conv=${conversationId})`,
	},
	// PF-07: modelo pode chamar o optin 2x em conversa longa apesar do prompt.
	// BUG-OPTIN-ENGOLE-GATES (2026-06-04): optin no MEIO da qualificação
	// suprimia os gates lance-value/lance-embutido/identify. Pré-reveal ou
	// duplicado → suprime (regra determinística em whatsapp-optin-guard.ts).
	{
		name: "whatsapp-optin",
		applies: ({ artifactType, meta, channel }) =>
			artifactType === "whatsapp_optin" && !shouldEmitWhatsappOptin(meta, channel),
		logLine: ({ conversationId, channel }) =>
			`[whatsapp-optin] guard: suprimindo artifact (canal=${channel}, pré-reveal ou duplicado) (conv=${conversationId})`,
	},
	// FIX-11 (rodada 2026-06-05 tarde): pós-fechamento, "qual status da
	// proposta?" re-rodava a descoberta e emitia recommendation_card +
	// simulation_result de OUTRA administradora (BANCO DO BRASIL pra quem JÁ
	// contratou CANOPUS). Estado terminal vale pra TODA a família de
	// descoberta/simulação/decisão, em qualquer intent.
	{
		name: "post-closure",
		applies: ({ meta, artifactType }) =>
			meta.contractClosed === true && POST_CLOSURE_FAMILY.has(artifactType),
		logLine: ({ artifactType, conversationId, userIntent }) =>
			`[post-closure] guard: suprimindo ${artifactType} pós-fechamento — estado terminal (conv=${conversationId}, intent=${userIntent})`,
	},
	// FIX-12 (rodada 2026-06-05 tarde): no gate identify o modelo chamou
	// present_contract_form (passo 5) — submit criou proposta REAL na Bevi
	// (CPF + bureau) sem o usuário ter visto UMA opção. contract_form SÓ passa
	// com reveal feito (revealCompleted !== true → suprime); antes disso,
	// identidade é assunto do gate identify do SERVIDOR. Com o artifact
	// suprimido o turno fica sem artifact e a avaliação de gates do runner
	// reconduz ao identify naturalmente.
	{
		name: "premature-contract",
		applies: ({ artifactType, meta }) =>
			artifactType === "contract_form" && meta.revealCompleted !== true,
		logLine: ({ conversationId, userIntent }) =>
			`[contract-gate] guard: suprimindo contract_form PRÉ-reveal — identidade é assunto do gate identify (conv=${conversationId}, intent=${userIntent})`,
	},
	// FIX-239 (Fable r1, D3.4, gap P1 #6a): "Gostei, faz bastante sentido"
	// (elogio pós-reveal, NÃO decisão) disparava decision_prompt ANTES de
	// experience/timeframe/lance estarem resolvidos — a tool present_decision_
	// prompt é liberada pela FASE (reveal/closing) do tool-policy, não pelo
	// estado da qualificação; o LLM podia chamá-la livremente em qualquer
	// afirmativo pós-reveal. `nextGate()` é a fonte única da ordem — só chega
	// em "decision" depois que experience/timeframe/lance(+lance-embutido/
	// simulator-offer) resolveram. Escopado a `decisionDispatched !== true`
	// (a RE-emissão pós-dispatch é papel do `isDecisionDup` em reveal-loop).
	{
		name: "premature-decision",
		applies: ({ artifactType, meta }) => {
			if (artifactType !== "decision_prompt" || meta.decisionDispatched === true) return false;
			return nextGate(meta, { hasContactName: true }) !== "decision";
		},
		logLine: ({ conversationId, userIntent }) =>
			`[premature-decision] guard: suprimindo decision_prompt — qualificação pós-reveal (experience/timeframe/lance) ainda não resolvida (conv=${conversationId}, intent=${userIntent})`,
	},
	// FIX-426 (Kairo, WhatsApp 2026-07-30): "não faz sentido o simulador antes de
	// mostrar a nova carta com lance embutido".
	//
	// O funil já manda `lance-embutido` ANTES de `simulator-offer` (nextGate), mas a
	// tool-policy libera `present_contemplation_dial` em todo o pós-reveal e o modelo
	// chamava quando queria. Na tela: "o lance fica em torno de 30% (R$ 60.000), você
	// recebe R$ 140.000" chegando antes de a pessoa ler o que é lance embutido e de
	// onde sai esse dinheiro.
	//
	// Mesma família do FIX-425 (ninguém decide o embutido no escuro), pelo lado do
	// simulador: número de lance é justamente aquilo sobre o que ela vai decidir.
	// Escopado ao intervalo exato — só enquanto o gate estrutural ativo AINDA é
	// `lance-embutido` e a educação não saiu. Entregue o card, o simulador roda
	// livre; e quem não vai dar lance nenhum nunca passa por `lance-embutido`
	// (`querAntecipar` em qualify-state), então não é afetado.
	{
		name: "simulador-antes-do-embutido",
		applies: ({ artifactType, meta }) => {
			if (artifactType !== "contemplation_dial") return false;
			if (meta.qualifyAnswers?.embeddedBidDispatched === true) return false;
			return nextGate(meta, { hasContactName: true }) === "lance-embutido";
		},
		logLine: ({ conversationId }) =>
			`[simulador-antes-do-embutido] guard: suprimindo contemplation_dial — a educação do lance embutido ainda não saiu (conv=${conversationId})`,
	},
	// BUG-REVEAL-LOOP (2026-06-02): pós-reveal, num turno de usuário o agent
	// re-emitia os cards de DESCOBERTA a cada afirmativo ("ta otimo", "bora") —
	// loop que nunca cruzava pro passo 5. Chave em revealCompleted (não
	// searchDispatched): a flag liga em QUALQUER reveal, inclusive free-run do
	// próprio agent (comparison_table 5× no run real). O reveal original é o 1º
	// (revealCompleted ainda false) → passa. simulation_result só é suprimido
	// fora de what-if (providing_info = usuário pediu novo valor → re-simular é
	// legítimo). Inclui os dups do hardening (QA crítico 2026-06-02 + E2E real
	// 2026-06-04): decision_prompt re-emitido pós-decisionDispatched e
	// contract_form re-apresentado pós-Parabéns (contractClosed terminal).
	{
		name: "reveal-loop",
		applies: ({ meta, artifactType, userIntent, isUserTurn, freshSimulationThisTurn }) => {
			// FIX-68: trocou de FAIXA DE VALOR (valor-alvo ≠ o descoberto) → os cards
			// da NOVA faixa são re-descoberta legítima, não re-reveal. Não suprime —
			// a tool-policy já reabilitou search/recommend nesse caso. O afirmativo
			// curto na MESMA faixa (revealValueTargetChanged=false) continua caindo no
			// guard (BUG-REVEAL-LOOP intacto).
			// FIX-425 (Kairo, produção 2026-08-02, conversa retomada dias depois): o
			// cliente pediu "Ver outras opções", o agente respondeu "vou trazer as
			// melhores opções pra você" e NENHUM card saiu. Ele reclamou ("nao vi
			// nenhuma"), o agente prometeu de novo e engoliu de novo — e ainda
			// perguntou "qual delas te interessou?" sobre uma lista que nunca apareceu.
			// Prometer e não entregar é pior que não responder.
			//
			// O guard estava certo no que foi criado pra pegar (afirmativo curto —
			// "bora", "tá ótimo" — re-abrindo a descoberta em loop) e errado ao tratar
			// como re-reveal quem PEDE a lista. Os dois casos já têm rótulo próprio no
			// analyzer, então a distinção é dado, não heurística nova:
			//   `wants_more_options` — "mostra as outras", "ver todas" (FIX-183);
			//   `confused`           — não entendeu/não enxergou o que foi mostrado, e
			//                          reancorar é o comportamento certo (FIX-301).
			// Afirmativo segue sendo `ready_to_proceed`/`neutral` → continua barrado.
			const pedeParaVer = userIntent === "wants_more_options" || userIntent === "confused";
			const revealLoopActive =
				meta.revealCompleted === true &&
				isUserTurn &&
				!revealValueTargetChanged(meta) &&
				!pedeParaVer;
			const isRereveal =
				revealLoopActive &&
				(artifactType === "comparison_table" ||
					artifactType === "recommendation_card" ||
					artifactType === "group_card" ||
					(artifactType === "simulation_result" &&
						userIntent !== "providing_info" &&
						// Simulação RECÉM-RODADA neste turno é conteúdo NOVO, não
						// re-reveal. Sem isto, o usuário escolhia um grupo ("ITAÚ"), o
						// intent saía `neutral` e o card da simulação era engolido — o
						// agente dizia "dá uma olhada na simulação" e não havia simulação.
						!freshSimulationThisTurn));
			const isDecisionDup =
				meta.decisionDispatched === true && isUserTurn && artifactType === "decision_prompt";
			const isContractDup = meta.contractClosed === true && artifactType === "contract_form";
			return isRereveal || isDecisionDup || isContractDup;
		},
		logLine: ({ artifactType, conversationId, userIntent }) =>
			`[reveal-loop] guard: suprimindo ${artifactType} re-emitido pós-reveal (conv=${conversationId}, intent=${userIntent})`,
	},
	// FIX-7 (single-option guard): descoberta retornou opção ÚNICA →
	// recommendation_card duplicaria o grupo do detalhamento. Suprime; o
	// simulation_result vira o card único do reveal.
	{
		name: "single-option",
		applies: ({ artifactType, discoveryCount }) =>
			artifactType === "recommendation_card" && discoveryCount === 1,
		logLine: ({ conversationId }) =>
			`[single-option] guard: suprimindo recommendation_card — descoberta retornou opção única (conv=${conversationId})`,
	},
	// FIX-297 (rodada 10, 2026-07-12): reveal em DOIS TEMPOS com consentimento.
	// No turno da busca ORIGINAL (revealCompleted ainda false), o hero
	// (recommendation_card) e o `simulation_result` que o aprofunda ficam
	// PENDENTES até o usuário consentir no gate `reco-consent` (pós-
	// experience) — só a `comparison_table` (lista) sai imediata (FIX-290
	// preservado, tipo diferente, não cai aqui). `single-option` acima já
	// resolve o caso de 1 grupo só (sem hero, sem ceremônia de consentimento);
	// `simulation_result` só é pendurado quando há 2+ grupos (senão ELE é o
	// card único do reveal, precisa sair na hora). O runner.ts captura o
	// payload coagido e persiste em `meta.pendingRecommendationCard`/
	// `pendingSimulationResult` pra emissão determinística posterior
	// (`emitServerCard`, nunca recalculado, nunca dependente de nova tool-call).
	{
		// Teto de 2 cards por turno. Ao vivo saíram QUATRO de uma vez (comparativo +
		// recomendação + escassez + decisão) e o cliente rolava uma parede sem saber
		// o que decidir. O reveal legítimo usa dois (lista + hero); do terceiro em
		// diante é avalanche — o card espera o próximo turno.
		name: "teto-de-cards-por-turno",
		// FIX-431 — o CONTRATO não espera o próximo turno.
		//
		// `golden-fecho-nao-anda-pra-tras`, turno 9: o cliente diz "quero
		// contratar", o roteador decide `gate=contract show=true`, e o formulário
		// é cortado aqui porque o hero (pendente do consentimento) e o card de
		// escassez chegaram primeiro. O cliente pediu para fechar e recebeu a
		// recomendação de novo.
		//
		// O teto continua valendo para o que ele foi criado: avalanche de card de
		// APRESENTAÇÃO (saíram quatro de uma vez e ninguém sabia o que decidir).
		// O que muda é a precedência — quando a venda chega ao fechamento, o
		// formulário É o card do turno; quem espera é a apresentação.
		applies: ({ turnArtifactTypes, artifactType }) =>
			artifactType !== "contract_form" && (turnArtifactTypes?.length ?? 0) >= 2,
		logLine: ({ artifactType, conversationId }) =>
			`[teto-de-cards-por-turno] guard: suprimindo ${artifactType} — já saíram 2 cards neste turno (conv=${conversationId})`,
	},
	{
		name: "hero-awaits-reco-consent",
		applies: ({ artifactType, meta, discoveryCount }) => {
			// FIX-316 (rodada 10, onda 4 — veredito Fable, achado A2): a condição
			// original só suprimia no turno ORIGINAL da busca (revealCompleted
			// ainda false) — mas revealCompleted vira true assim que a busca
			// termina, MUITO antes do usuário responder reco-consent. Qualquer
			// turno DEPOIS do reveal (o LLM chamando a tool espontaneamente de
			// novo) escapava do guard inteiro. A condição certa é o estado de
			// consentimento em si — suprime enquanto `recoConsentAnswered` não
			// for true, esteja o reveal recém-concluído ou não.
			// 2026-07-21: o portão deixou de ser o CONVITE e passou a ser a
			// EXPERIÊNCIA. O reveal continua em dois tempos — a lista sai na hora, o
			// hero espera o cliente responder se já fez consórcio antes (é o que
			// muda COMO a recomendação é explicada) — só que agora, respondida a
			// experiência, o hero sai direto, sem pedir licença. Ver `nextGate`.
			if (meta.experiencePrev !== undefined) return false;
			if (meta.recoConsentAnswered === true) return false;
			// 2026-08-12 — O PORTÃO É A CHANCE, NÃO A RESPOSTA.
			//
			// Medido em produção: o `recommendation_card` NUNCA saía. O cliente via
			// só a `comparison_table`, o agente ficava sem a recomendação ancorada e,
			// ao ouvir "quero essa mesma", respondia "não consigo ver qual cota você
			// está vendo na tela".
			//
			// A causa é a soma de duas mudanças certas: o portão do hero virou a
			// EXPERIÊNCIA (2026-07-21, quando o convite saiu da cascata) e, no mesmo
			// dia de hoje, o gate `experience` ganhou idempotência — pergunta uma vez
			// e, sem resposta, o funil SEGUE, porque é qualificação opcional e estava
			// travando a venda. Juntas, prendem o hero para sempre: antes o gate
			// insistia turno após turno e `experiencePrev` acabava preenchido; agora
			// ele fica `undefined` e o guard espera por uma resposta que ninguém mais
			// vai pedir.
			//
			// Mesma regra dos dois lados: o que não bloqueia o funil não bloqueia o
			// card. Perguntada a experiência (`experienceDispatched`), o hero sai —
			// e quem já escolheu a cota vê a recomendação de qualquer jeito.
			if (meta.experienceDispatched === true) return false;
			if (meta.escolha) return false;
			if (artifactType === "recommendation_card") return true;
			// FIX-376 (Kairo, web ao vivo 2026-07-25): `group_card` recebe o MESMO
			// hold. O system-prompt oferece `present_group_card` como caminho
			// alternativo pra destacar UM grupo ("após present_recommendation_card
			// OU present_group_card", system-prompt.ts:578), então segurar só o
			// `recommendation_card` deixava a porta do lado aberta — e o modelo
			// entrava por ela. Efeito na tela: o agente perguntava "é sua primeira
			// vez fazendo consórcio?" e um card GRANDE da carta do Itaú caía entre
			// a pergunta e os chips de resposta, separando uma da outra.
			//
			// O `reveal-loop` já barrava esse card em turno de USUÁRIO; o reveal,
			// porém, entra por directive de servidor (`isUserTurn: false`), onde
			// aquele guard não se aplica — este aqui é a única linha de defesa no
			// exato turno em que o problema aparece.
			if (artifactType === "group_card") return true;
			if (artifactType === "simulation_result") return (discoveryCount ?? 0) >= 2;
			return false;
		},
		logLine: ({ artifactType, conversationId }) =>
			`[hero-awaits-reco-consent] guard: suprimindo ${artifactType} no reveal original — pendente até o gate reco-consent resolver (conv=${conversationId})`,
	},
	// FIX-53 (jornada2_revisão.docx — Bernardo, 2026-06-19) — HISTÓRICO, ordem
	// REVERTIDA pelo FIX-296 (rodada 10, 2026-07-12: "valor antes dos dados").
	// O credit gate (value picker server-emitido) já respeita a ordem nova via
	// qualify-state; esta é a 2ª linha de defesa se o MODELO chamar
	// present_value_picker fora de ordem. PRÉ-reveal, suprime o value_picker
	// quando: (a) o desire ainda não foi respondido (o credit ainda nem é o
	// gate estrutural ativo) OU (b) o valor já foi coletado (anti-repetição —
	// confirma em 1 frase e segue, nunca re-mostra o picker). PÓS-reveal o
	// picker é legítimo (ajuste de valor) — não cai aqui.
	{
		name: "value-picker-order",
		applies: ({ artifactType, meta }) =>
			artifactType === "value_picker" &&
			meta.revealCompleted !== true &&
			(!meta.desireAsked || meta.qualifyAnswers?.creditMax !== undefined),
		logLine: ({ meta, conversationId }) =>
			`[value-picker-order] guard: suprimindo value_picker pré-reveal — ${
				!meta.desireAsked
					? "desire ainda não respondido (valor antes dos dados, mas ainda cedo demais)"
					: "valor já coletado (anti-repetição)"
			} (conv=${conversationId})`,
	},
	// FIX-260 (rodada 5, veredito Fable r4, R5): "contemplation_dial DUPLICADO no
	// mesmo turno (2 tool-calls, initialTargetMonth 12 e 6)" — a instrução do
	// directive ("chame present_contemplation_dial UMA vez") é regra-no-prompt,
	// sobrevivia mesmo com o texto lá (Lei 4: invariante crítico vira código).
	// turnArtifactTypes já trazia os artifacts emitidos ANTES neste turno
	// (runner.ts) — só faltava uma regra que consumisse.
	{
		// FIX-353 (rodada 6, servicos-web t15): a regra era só pro contemplation_dial,
		// mas duplicar card é defeito para QUALQUER tipo. Ao vivo, a cascata de decisão
		// saiu inteira em dobro —
		//
		//     CARDS: scarcity, decision_prompt, scarcity, decision_prompt
		//
		// e o turno seguinte, com o usuário dizendo "tá bom, quero fazer", virou "Acho
		// que me perdi" + um LOOP de 3× "Deixa eu tentar de outro jeito". A jornada
		// morreu ali.
		//
		// Causa: `dispatchDecisionCascade` tem DOIS pontos de chamada (pré e pós-modelo,
		// index.ts) e o guard de idempotência lê `decisionDispatched` do BANCO — se os
		// dois caminhos rodam no mesmo turno HTTP, a leitura acontece antes da escrita
		// do outro e a cascata sai duas vezes. Esta é a rede intra-turno, em memória,
		// que não depende do timing da persistência.
		name: "card-dup-intraturn",
		applies: ({ artifactType, turnArtifactTypes }) =>
			(turnArtifactTypes ?? []).includes(artifactType),
		logLine: ({ artifactType, conversationId }) =>
			`[card-dup-intraturn] guard: suprimindo ${artifactType} duplicado no mesmo turno (conv=${conversationId})`,
	},
	// ATALHO DE RESPOSTA NÃO CONVIVE COM CARD DE PESO NO MESMO TURNO.
	//
	// Visto ao vivo (Kairo, 2026-07-30): o agente explicou o lance, perguntou
	// e ofereceu "Tenho essa grana" / "Prefiro lance menor" — e logo abaixo
	// caiu o card grande da recomendação do Itaú. O card enterra a pergunta:
	// o cliente é convidado a responder e, no mesmo fôlego, recebe outra coisa
	// pra olhar. "Matou totalmente o de cima", nas palavras dele.
	//
	// É a mesma classe do defeito que o turno de apresentação já resolveu
	// (mostrar e perguntar no mesmo turno), agora pela porta dos atalhos. Quando
	// o turno traz conteúdo de peso, ELE é o assunto; a pergunta com atalhos
	// fica pro turno seguinte, quando o cliente já olhou o card.
	{
		name: "quick-reply-com-card-de-peso",
		applies: ({ artifactType, turnArtifactTypes }) =>
			artifactType === "quick_reply" &&
			(turnArtifactTypes ?? []).some((t) =>
				[
					"recommendation_card",
					"comparison_table",
					"group_card",
					"simulation_result",
					"decision_prompt",
					"contract_form",
					"two_paths",
					"embedded_bid",
					"contemplation_dial",
				].includes(t),
			),
		logLine: ({ conversationId, turnArtifactTypes }) =>
			`[quick-reply-com-card-de-peso] guard: suprimindo atalhos — o turno já traz ${turnArtifactTypes?.join("+")}, que é o assunto (conv=${conversationId})`,
	},
	// FIX-300 (P6, loop-de-goal r10 — card alucinado no gate `decision`): o
	// print real mostrava um topic_picker com chips "a"/"b" no lugar do card
	// "Esse plano faz sentido?" — o gate `decision` tecnicamente ainda é fase
	// `reveal` (tool-policy.ts só bloqueia closing/terminal) até o directive
	// marcar `decisionDispatched`, então essa é a 2ª linha que cobre o instante
	// exato: o servidor JÁ vai emitir/já emitiu o card canônico da decisão, um
	// menu de dúvidas do LLM ali é sempre ruído.
	{
		name: "topic-picker-server-gate",
		applies: ({ artifactType, meta }) =>
			artifactType === "topic_picker" && nextGate(meta) === "decision",
		logLine: ({ conversationId }) =>
			`[topic-picker-server-gate] guard: suprimindo topic_picker — gate decision já tem card canônico do servidor (conv=${conversationId})`,
	},
];

/** Avalia as regras NA ORDEM; a primeira que aplicar suprime e assina o log. */
export function evaluateArtifactGuards(input: ArtifactGuardInput): ArtifactGuardVerdict {
	for (const rule of ARTIFACT_GUARD_RULES) {
		if (rule.applies(input)) {
			return { allow: false, rule: rule.name, logLine: rule.logLine(input) };
		}
	}
	return { allow: true };
}
