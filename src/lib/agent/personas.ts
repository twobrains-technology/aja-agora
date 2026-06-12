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
	hasLance?: "yes" | "maybe" | "no";
	/** Valor aproximado do lance que o usuário pretende ofertar (em reais).
	 * Capturado no sub-fluxo de lance embutido quando hasLance="yes". Bevi: valorDoLance. */
	lanceValue?: number;
	/** Usuário optou por considerar lance embutido nas simulações (jornada do doc).
	 * Bevi: lanceEmbutido = "30"|"50" (percentual). */
	lanceEmbutido?: boolean;
	/** Percentual do lance embutido aceito (Bevi aceita 30 ou 50). Default 30. */
	lanceEmbutidoPercent?: 30 | 50;
};

import type { NavState } from "./orchestrator/navigation";

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
	qualifyConsented?: boolean;
	/** Set when consent gate fires the first time. Once set, the gate never re-fires —
	 * user must click "Bora!" / "Entender mais" buttons or volunteer info that triggers
	 * extraction. Prevents spam re-prompting after each free-text doubt the user asks. */
	consentOffered?: boolean;
	/** Set after specialist answers the user's question on the doubts path. */
	doubtsAddressed?: boolean;
	/** Set when user clicks "Entender mais antes"; cleared after their reply lands. */
	pendingFollowUp?: boolean;
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
	/** Idempotency guard do card de decisão (present_decision_prompt). Espelha
	 * searchDispatched: o orquestrador dirige o card UMA vez, depois o passo 5
	 * (contratar) é conversacional. Sem isso o agent re-disparava o reveal em
	 * loop (BUG-REVEAL-LOOP, 2026-06-02). */
	decisionDispatched?: boolean;
	/** Administradora do plano recomendado no reveal — usada como contexto do
	 * card de decisão e do passo 5 (contratar). Capturada do recommendation_card/
	 * simulation_result quando revealCompleted é setado. */
	recommendedAdministradora?: string;
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
	};
	/** docx passo 5: resumo da contratação por WhatsApp NÃO foi enviado (canal
	 * não configurado ou falha) — pendência observável, nunca envio fingido. */
	contractSummaryPending?: boolean;
	/** Estado TERMINAL do fechamento (offer-confirm concluído — proposta em
	 * 'documentos'). Pós-Parabéns o agente não re-apresenta contract_form
	 * (BUG-POS-FECHAMENTO-NAO-TERMINAL, E2E real 2026-06-04). */
	contractClosed?: boolean;
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
};

export const ROUTABLE_CATEGORIES = [
	"imovel",
	"auto",
	"moto",
	"servicos",
] as const satisfies readonly Category[];
