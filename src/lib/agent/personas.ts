import type { DocumentSlot } from "@/lib/adapters/proposal-gateway";

// Persona id (free-form slug, e.g. "concierge", "imovel", "helena-premium").
// Persona row carries role + category that drive routing/agent build.
export type Persona = string;

// The 3 specialist categories the consórcio platform supports.
// Concierge persona has category=null.
export type Category = "imovel" | "auto" | "moto" | "servicos";

export type ExpertiseLevel = "leigo" | "expert" | "neutro";
export type ExperiencePrev = "first" | "returning" | "doubts";

/** Eixo de objetivo da Bevi (input nativo da simulação): quer o bem rápido
 * (contemplação acelerada via lance) ou enxerga o consórcio como investimento
 * de longo prazo (menor parcela). Derivado do gate de prazo. */
export type Objetivo = "contemplacao_rapida" | "investimento";

export type QualifyAnswers = {
	creditMin?: number;
	creditMax?: number;
	/** FIX-33 — valor do bem ORIGINAL pedido por texto livre quando ficou FORA
	 * da faixa da categoria e foi clampado pro teto/piso. Sinaliza ao agente pra
	 * confrontar a faixa real ("auto vai até R$ 300 mil"). undefined = sem clamp. */
	creditClampedFrom?: number;
	/** Parcela mensal que o usuário consegue pagar (em reais). */
	monthlyBudget?: number;
	/** 0 = imediato (lance forte). */
	prazoMeses?: number;
	/** Eixo Bevi derivado do prazo escolhido (jornada do doc 2026-05-29). */
	objetivo?: Objetivo;
	/** FIX-233 (handoff agente-vendas-consorcio, 2026-07-09): 3ª saída do gate
	 * `lance` — "não quero comprometer nada além da parcela". Pula lance-value/
	 * lance-embutido/simulator-offer (dial); o agente chama `present_two_paths`
	 * (tool do bloco-cards-ui) e devolve a decisão ao usuário. */
	hasLance?: "yes" | "maybe" | "no" | "so_parcela";
	/** Valor aproximado do lance que o usuário pretende ofertar (em reais).
	 * Capturado no sub-fluxo de lance embutido quando hasLance="yes". Bevi: valorDoLance. */
	lanceValue?: number;
	/** Usuário optou por considerar lance embutido nas simulações (jornada do doc).
	 * Bevi: lanceEmbutido = "30"|"50" (percentual). */
	lanceEmbutido?: boolean;
	/** Percentual do lance embutido aceito (Bevi aceita 30 ou 50). Default 30. */
	lanceEmbutidoPercent?: 30 | 50;
	/** FIX-233 — gate `desire` (não bloqueante): bem específico que o usuário
	 * tem em mente ("um Corolla", "apê de 2 quartos"). Espelhado no card/copy
	 * de forma livre, não normalizado. */
	desiredItem?: string;
	/** FIX-233 — motivação/gatilho do momento ("carro vive na oficina"). Vira
	 * contexto injetado no prompt e é espelhada UMA vez, não a cada turno. */
	motivation?: string;
	/** FIX-233/FIX-241 — quanto o usuário consegue juntar por mês pro lance,
	 * quando não tem reserva hoje mas pretende ir juntando ("junto uns 4 mil
	 * por mês"). Ancora a agulha (âncora de dinheiro) no mês em que o BOLSO
	 * cobre o lance necessário, em vez do prazo desejado (docs/03). */
	monthlySavings?: number;
	/** FIX-241 (spec 03 "Âncora de dinheiro") — FGTS disponível (vertical
	 * imóvel), entrada pontual que abate o bolso necessário direto (vai ao
	 * vendedor) — maior acelerador da âncora nessa vertical. */
	fgtsValue?: number;
	/** FIX-284 — valor aproximado do bem MENCIONADO informalmente no turno do
	 * gate `desire` (ex.: "Um carro, uns 70 mil"), antes de a agulha formal do
	 * `credit` estar ativa. Captura oportunista, primeira ocorrência apenas —
	 * NUNCA substitui `creditMax` (guard `activeGateAtTurnStart` do FIX-279),
	 * só alimenta a copy de CONFIRMAÇÃO do gate `credit` (`gateQuestion`) em
	 * vez de perguntar o valor do zero. */
	creditMentionedAtDesire?: number;
};

import type { NavState } from "./orchestrator/navigation";
import type { Gate } from "./qualify-state";

export type ConversationMetadata = {
	currentPersona?: Persona;
	currentCategory?: Category;
	expertiseLevel?: ExpertiseLevel;
	previousPersona?: Persona;
	personasSeen?: Category[];
	awaitingName?: boolean;
	experiencePrev?: ExperiencePrev;
	/** Stack de estados anteriores pra suportar comando "voltar" (#06).
	 * Push em transições major (gate avançado, persona trocada, artefato chave).
	 * Pop em detectBackIntent. Cap em NAV_STACK_CAP estados (descarta o mais antigo). */
	navigationStack?: NavState[];
	/** FIX-233 — gate `desire` já foi disparado nesta conversa (não bloqueante:
	 * uma vez marcado, `nextGate` nunca mais o emite, respondido ou não). Mesmo
	 * padrão de `consentOffered`/`simulatorOfferDispatched`. */
	desireAsked?: boolean;
	/** FIX-274 — o beat do MOTIVO ("por que agora", 2ª pergunta do gate desire) já
	 * foi ativado nesta conversa. Marcado no runner quando o funil segura pra o LLM
	 * perguntar o motivo (`shouldAskMotive`). Torna o beat NÃO-bloqueante: se o motivo
	 * não vier, o funil segue mesmo assim (mesmo padrão de `desireAsked`). */
	motivationAsked?: boolean;
	/** FIX-296 — o beat de ESPELHO+OBJETIVO ("entendo bem — quando o carro dá
	 * trabalho, atrapalha tudo. Então o objetivo já fica claro...") já foi
	 * ativado nesta conversa (`shouldMirrorMotivation`). Marcado no runner
	 * quando o beat dispara — igual `motivationAsked`, torna o beat NÃO-
	 * bloqueante e garante que ele rode UMA vez só, nunca a cada turno. */
	motivationMirrored?: boolean;
	/** FIX-285 — o gate `desire` já recebeu uma RESPOSTA do usuário nesta
	 * conversa, independente de o item citado ter sido específico o bastante
	 * pra virar `qualifyAnswers.desiredItem` (o analyzer devolve `desiredItem:
	 * null` por design quando o usuário só nomeia a categoria genérica, ex.:
	 * "um carro"). Marcado em `analyze.ts` no primeiro turno de usuário após
	 * `desireAsked` — substitui `Boolean(qualifyAnswers.desiredItem)` como
	 * precondição de `shouldAskMotive`, que falhava nesse cenário. */
	desireAnswered?: boolean;
	/** @deprecated FIX-274 — o gate `consent` saiu do funil (decisão do Kairo,
	 * 2026-07-11: "remover, fiel ao mockup"). Campo mantido só pra não quebrar
	 * conversas legadas em jsonb; não é mais lido/escrito por nenhum caminho vivo. */
	qualifyConsented?: boolean;
	/** Set when consent gate fires the first time. Once set, the gate never re-fires —
	 * user must click "Bora!" / "Entender mais" buttons or volunteer info that triggers
	 * extraction. Prevents spam re-prompting after each free-text doubt the user asks. */
	consentOffered?: boolean;
	/** Set after specialist answers the user's question on the doubts path. */
	doubtsAddressed?: boolean;
	/** Set when user clicks "Entender mais antes"; cleared after their reply lands. */
	pendingFollowUp?: boolean;
	/** FIX-207 (watchdog de inatividade) — epoch ms de quando um turno de usuário
	 * terminou com um gate REAL do funil pendente porém SUPRIMIDO (nenhum card
	 * disparado): o funil ficaria parado até o usuário voltar a falar. O worker
	 * gate-reengage-poll varre conversas com este marcador além do teto
	 * (GATE_REENGAGE_TIMEOUT_MS) e dispara o gate. Limpo quando o gate dispara, o
	 * funil avança ou a conversa entra em estado terminal. Number (epoch ms) —
	 * serializa trivialmente no jsonb (nunca Date, pra não repetir o quebra-meta). */
	pendingGateSince?: number;
	/** FIX-207 — rótulo do gate que ficou pendente quando pendingGateSince foi
	 * marcado. O worker RE-CALCULA nextGate no disparo (frescor); este é só o
	 * indicador do que estava aberto. */
	pendingGate?: Gate;
	/** FIX-211 — contador de cobranças por gate de COLETA obrigatória (identify/
	 * credit/lance/...). Incrementado a cada RE-cobrança (turno mudo ou desvio do
	 * usuário), NÃO na emissão original do gate. Governa a ESCADA de cobrança
	 * (reengageQuestionForGate): 1→pedido direto, 2/3→incentivo, >=4→saída pro
	 * especialista. Por-gate (Partial<Record<Gate,number>>) → não vaza entre gates;
	 * resetado ao capturar o dado. */
	gateAttempts?: Partial<Record<Gate, number>>;
	/** FIX-305 — contador de turnos de USUÁRIO consecutivos em que o MESMO gate
	 * (`STUCK_ESCAPE_GATES`, qualify-state.ts: timeframe/lance/lance-value/
	 * lance-embutido) não avançou (nextGate() devolveu o mesmo gate antes e
	 * depois do merge do turno). DISTINTO de `gateAttempts` (escalada por
	 * INATIVIDADE/desvio, termina em oferta de especialista) — este mede "sem
	 * progresso NA MESMA conversa ativa" e, no teto, ASSUME um default e segue
	 * o funil (Kairo, AskUserQuestion 2026-07-13: "nunca trava"). Resetado a 0
	 * quando o default é assumido — o gate avança e o contador nunca mais é lido. */
	gateStuckTurns?: Partial<Record<Gate, number>>;
	/** FIX-305 — marca os gates cujo dado em `qualifyAnswers` foi um DEFAULT
	 * assumido (teto de tentativas atingido), não uma resposta real do
	 * usuário. Só rastreabilidade/analytics — nenhuma lógica de gate lê isto. */
	gateDefaultsAssumed?: Partial<Record<Gate, true>>;
	/** Identidade (CPF+celular+LGPD) coletada no gate "identify" — fim do passo 2
	 * (D1, docs/jornada/CONTEXT.md). A Bevi exige antes de simular; a busca real
	 * (passo 3) só libera com isto true. */
	identityCollected?: boolean;
	/** Identidade cifrada (AES-256-GCM via IDENTITY_ENC_KEY) — NUNCA em claro.
	 * Ler/escrever apenas via src/lib/conversation/identity.ts. */
	identityEnc?: string;
	/** Idempotency guard — prevents re-firing the summary + search reveal. */
	searchDispatched?: boolean;
	/** Set once the reveal turn produced a simulation_result/recommendation_card
	 * (passo 4 da jornada — o usuário já viu o plano + detalhamento). Habilita o
	 * gate "decision" ("Esse plano faz sentido?"). */
	revealCompleted?: boolean;
	/** Oferta do simulador (docx passo 4: "contemplado em 3, 6 ou 12 meses — que
	 * tal?") já feita nesta conversa. Setado quando o gate simulator-offer é
	 * emitido (padrão consentOffered) — a oferta acontece UMA vez, na sequência
	 * do reveal, antes do card de decisão. */
	simulatorOfferDispatched?: boolean;
	/** FIX-260 (rodada 5, veredito Fable r4): resposta AFIRMATIVA por TEXTO LIVRE
	 * ao gate simulator-offer já foi processada (emitiu o directive do dial) —
	 * idempotência pra não reabrir o dial em turnos seguintes com intent
	 * afirmativo/neutro dentro da mesma janela pré-decision. Espelha
	 * decisionDispatched/consentOffered (mesmo padrão). */
	simulatorOfferAnswered?: boolean;
	/** Idempotency guard do card de decisão (present_decision_prompt). Espelha
	 * searchDispatched: o orquestrador dirige o card UMA vez, depois o passo 5
	 * (contratar) é conversacional. Sem isso o agent re-disparava o reveal em
	 * loop (BUG-REVEAL-LOOP, 2026-06-02). */
	decisionDispatched?: boolean;
	/** FIX-297 (rodada 10, 2026-07-12) — gate `reco-consent` ("Posso te mostrar
	 * a opção que eu recomendo?") já foi disparado nesta conversa. Mesmo padrão
	 * de `simulatorOfferDispatched`: marcado na EMISSÃO, não na resposta —
	 * torna o gate não-bloqueante (nextGate nunca mais o re-emite depois de
	 * dispatched, respondido ou não). */
	recoConsentDispatched?: boolean;
	/** FIX-297 — resposta AFIRMATIVA por TEXTO LIVRE ao gate reco-consent já foi
	 * processada (emitiu o hero pendente) — idempotência pra não reemitir o
	 * hero em turnos seguintes com intent afirmativo/neutro. Espelha
	 * `simulatorOfferAnswered`. */
	recoConsentAnswered?: boolean;
	/** FIX-297 — hero (recommendation_card) computado no turno da busca original
	 * mas SUPRIMIDO até o usuário consentir (`hero-awaits-reco-consent` em
	 * artifact-guard.ts) — o payload já coagido server-side (Lei 1) fica aqui
	 * pra emissão determinística posterior via `emitServerCard`, sem depender
	 * de o LLM re-chamar a tool nem de recalcular com dados diferentes do
	 * turno original. Limpo (fica, é inofensivo) depois de emitido. */
	pendingRecommendationCard?: Record<string, unknown>;
	/** FIX-297 — mesma ideia do `pendingRecommendationCard`, pro
	 * `simulation_result` que aprofunda a oferta recomendada (só existe quando
	 * a busca original também produziu simulação — grupo único não passa por
	 * aqui, ver `discoveryCount` em runner.ts). */
	pendingSimulationResult?: Record<string, unknown>;
	/** Administradora do plano recomendado no reveal — usada como contexto do
	 * card de decisão e do passo 5 (contratar). Capturada do recommendation_card/
	 * simulation_result quando revealCompleted é setado. */
	recommendedAdministradora?: string;
	/** FIX-68 — valor-alvo (creditMax) usado na ÚLTIMA descoberta que produziu o
	 * reveal. Baseline pra distinguir "trocar de faixa de valor" (re-buscar é
	 * legítimo) de "re-revelar a MESMA faixa em loop" (BUG-REVEAL-LOOP, que NÃO
	 * pode voltar). Snapshotado pelo runner quando os cards de descoberta saem;
	 * comparado contra qualifyAnswers.creditMax em tool-policy/artifact-guard
	 * (revealValueTargetChanged). undefined = descoberta anterior ao fix → fail-safe
	 * (não reabre a busca, mantém o anti-loop). */
	discoveredCreditTarget?: number;
	/** FIX-6: snapshot dos NÚMEROS da oferta ativa (capturado no reveal e
	 * atualizado em what-if). O payload do contemplation_dial é coagido
	 * server-side a partir daqui (coerceDialPayload) — o modelo passava o
	 * crédito do slider e o dial contradizia a oferta na tela. */
	recommendedOffer?: {
		administradora?: string;
		category?: Category;
		creditValue: number;
		termMonths: number;
		monthlyPayment: number;
		/** FIX-246 (rodada 3, Fable r2): id do grupo real ancorado no reveal —
		 * sobrevive no meta pra emissão SERVER-SIDE do card `scarcity` (pós-
		 * reveal, sem depender de um `RevealGroupIndex` de turno). Nunca
		 * fabricado — ausente quando o artifact-âncora não o carrega. */
		groupId?: string;
	};
	/** docx passo 5: resumo da contratação por WhatsApp NÃO foi enviado (canal
	 * não configurado ou falha) — pendência observável, nunca envio fingido. */
	contractSummaryPending?: boolean;
	/** Estado TERMINAL do fechamento (offer-confirm concluído — proposta em
	 * 'documentos'). Pós-Parabéns o agente não re-apresenta contract_form
	 * (BUG-POS-FECHAMENTO-NAO-TERMINAL, E2E real 2026-06-04). */
	contractClosed?: boolean;
	/** FIX-244 (rodada 2, Fable r1, gap #9): marca que `present_contract_form`
	 * JÁ apareceu nesta conversa (runner.ts, no mesmo padrão hardening do
	 * `decisionDispatched`). O handler `contract-submit` (route.ts) EXIGE essa
	 * flag antes de criar proposta real — sem isso, o servidor aceitava o
	 * submit mesmo numa conversa que nunca viu o formulário (defesa em
	 * profundidade, mesma família do guard `revealCompleted` do FIX-12). */
	contractFormDispatched?: boolean;
	/** Set when AI calls suggest_handoff. Pauses gates/search until user confirms or declines. */
	handoffSuggested?: boolean;
	handoffReason?: string;
	qualifyAnswers?: QualifyAnswers;
	/** Snapshot de qualifyAnswers por categoria visitada. Preservado em transição
	 * pra eval medir discovery agregado quando a conversa passa por múltiplas categorias. */
	qualifyAnswersByCategory?: Partial<Record<Category, QualifyAnswers>>;
	/** Active when the agent has triggered `present_lead_form` and we're collecting
	 * name → phone → email deterministically from the user's free-text replies.
	 * Cleared after `capture_lead` lands and confirmation goes out. */
	leadCollection?: {
		stage: "name" | "phone" | "email";
		name?: string;
		phone?: string;
	};
	/** Passo 5 "Contratar" no canal WhatsApp (FIX-25 / MC-5). Espelho conversacional
	 * do fluxo de form do web: ativo entre o `contract_form` renderizado e o disparo
	 * de `startContract`. `confirm` = identidade já on file (FIX-9), aguarda aceite
	 * LGPD/confirmação; `cpf` = defensivo, identidade ausente, aguarda CPF por texto.
	 * Limpo após o disparo (real_offer apresentado) ou recusa. WhatsApp-only — o web
	 * fecha via POST de form (route.ts). */
	contractCollection?: {
		stage: "confirm" | "cpf";
	};
	/** Highest funnel stage reached during AI conversation phase (before lead row exists).
	 * Applied to the lead at creation time so it lands in the correct kanban column. */
	maxStageReached?: "engajado" | "qualificado";
	/** Marca que o card WhatsApp opt-in foi mostrado nesta conversa.
	 * Impede o agent de chamar present_whatsapp_optin de novo. */
	whatsappOptinShown?: boolean;
	/** Marca que o user clicou "Agora não" no card WhatsApp opt-in.
	 * Usado pra métrica de funil (decline rate). */
	whatsappOptinDeclined?: boolean;
	/** FIX-27 — telefone do usuário JÁ capturado (lead form / identify do
	 * fechamento), MASCARADO (LGPD — vai pro prompt). Presença → o opt-in vira
	 * confirmação de canal (stage "confirm") em vez de re-coletar o número. */
	contactPhone?: string;
	/** FIX-27 — fechamento (contract-submit) falhou com erro Bevi e aguarda
	 * re-tentativa. Enquanto pendente, o opt-in de WhatsApp NÃO é oferecido —
	 * o assunto do turno é re-tentar a proposta, não pedir WhatsApp. */
	contractRetryPending?: boolean;
	/** State da camada de memória (Letta sidecar — ADR 2026-05-16).
	 * `reconciled` é setado true após cópia bem-sucedida do agent anônimo (cookie)
	 * pro agent permanente (phone) — guarda idempotência pra não re-disparar. */
	letta?: {
		reconciled?: boolean;
		reconciledAt?: string; // ISO 8601
		reconciledFromAgentId?: string;
	};
	/** Debug-only: último texto do system message de memória injetado no turno.
	 * **Somente populado quando `AJA_DEBUG_MEMORY=1`** no env do servidor.
	 * Permite E2E inspecionar o hint via SQL sem hacks de stream. Não use em
	 * produção. */
	lettaDebugHint?: string | null;
	/** FIX-122 (D13) — slots de documento (RG/CNH) já recebidos pelo WhatsApp no
	 * Passo 6 (KYC). Rastreia a progressão frente → verso pra o handler de mídia
	 * inbound saber qual slot preencher a cada foto (o web controla isso no
	 * componente client; no WhatsApp não há UI, então mora no meta da conversa). */
	documentSlotsSent?: DocumentSlot[];
};

export const ROUTABLE_CATEGORIES = [
	"imovel",
	"auto",
	"moto",
	"servicos",
] as const satisfies readonly Category[];
