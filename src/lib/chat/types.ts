// src/lib/chat/types.ts

// ---- Artifact payload types (derived from adapter domain types) ----

export interface GroupCardPayload {
	id: string;
	administradora: string;
	category: "imovel" | "auto" | "moto" | "servicos";
	creditValue: number;
	monthlyPayment: number;
	adminFeePercent: number;
	termMonths: number;
	availableSlots: number;
	contemplationRate: number;
	/** FIX-191 (CONTRATO bloco-b, adendo B8): identificadores REAIS coagidos
	 * server-side pra o seletor emitir `choose_offer` com o grupo já resolvido.
	 * `groupId`/`quotaId` == `id` (quotaId opaco da Bevi); `ofertaId` é o UUID de
	 * sessão da oferta (quando propagado). `tipoOferta` é interno — nunca aqui.
	 * A UI (bloco-b/reveal hero+seletor) apenas CONSOME; nunca fabrica. */
	groupId?: string;
	ofertaId?: string;
	quotaId?: string;
	/** FIX-197: valorCarta BRUTO (denominação da carta, ex. 300k) — distinto de
	 * `creditValue` (faixa re-simulada exibida). Alimenta o aviso de ajuste de
	 * faixa. Ausente → aviso não aparece (degradação graciosa). */
	rawCreditValue?: number;
	/** FIX-223 (Ata 2026-07-04): lance médio do grupo (R$), quando a fonte o
	 * traz. Ausente → linha "Lance médio" omitida (nunca fabrica). */
	avgBidValue?: number;
	/** FIX-222 (Ata 2026-07-04): logo da administradora, quando cadastrado.
	 * Ausente → o card cai no fallback gracioso (iniciais/nome). */
	logoUrl?: string;
}

export interface ComparisonTablePayload {
	groups: GroupCardPayload[];
	highlightBestIndex?: number;
}

export interface SimulationResultPayload {
	groupId: string;
	administradora: string;
	category: "imovel" | "auto" | "moto" | "servicos";
	creditValue: number;
	monthlyPayment: number;
	adminFee: number;
	reserveFund: number;
	insurance: number;
	totalCost: number;
	termMonths: number;
	effectiveRate: number;
	/** Cenário projetado com lance (bug #10). */
	lanceScenario?: {
		lancePercent: number;
		expectedTermMonths: number;
	};
	/** Cenário de lance embutido (jornada do .docx) — crédito líquido + lance
	 * necessário. Permite exibir a variação "com/sem lance embutido". */
	embeddedBid?: {
		percent: number;
		embeddedBidValue: number;
		receivedCredit: number;
		/** FIX-8: dado real ou null/0 — a UI só exibe quando > 0. */
		necessaryBidToContemplate?: number | null;
	};
	/** Correção prevista — INCC pra imóvel, IPCA pra auto (bug #10). */
	expectedAdjustment?: {
		index: "INCC" | "IPCA";
		annualPercent: number;
	};
	/** CTAs explícitas pro fechamento (bug #12). */
	actions?: Array<{
		label: string;
		intent: string;
	}>;
}

export interface RecommendationCardPayload {
	id: string;
	administradora: string;
	category: "imovel" | "auto" | "moto" | "servicos";
	creditValue: number;
	monthlyPayment: number;
	adminFeePercent: number;
	termMonths: number;
	contemplationRate: number;
	/** docx passo 4 (resumo por opção): qtde de contemplados por MÊS — dado REAL
	 * da oferta Bevi (monthlyAwardedQuotas/availableSlots). Contagem, não %.
	 * FIX-191: coagido server-side a partir do availableSlots real (>0); nunca
	 * digitado pela LLM (era a origem do "36/mês" fabricado). */
	contempladosMes?: number;
	/** FIX-191/192: contagem REAL de contemplados/mês coagida (0 quando ausente →
	 * bloco-b oculta a linha de contemplação). */
	availableSlots?: number;
	/** FIX-191 (CONTRATO bloco-b, adendo B8): identificadores REAIS coagidos pra o
	 * seletor emitir `choose_offer`. `groupId`/`quotaId` == `id`; `ofertaId` = UUID
	 * de sessão da oferta (quando propagado). `tipoOferta` é interno — nunca aqui. */
	groupId?: string;
	ofertaId?: string;
	quotaId?: string;
	score: number; // 0-1 composite score from rankGroups()
	scoreBreakdown: {
		monthlyFit: number;
		contemplation: number;
		adminFee: number;
		termMatch: number;
	};
	// FIX-196/197 CONTRATO(bloco-a) — hero fixo do reveal (campos coagidos
	// server-side). groupId/ofertaId/quotaId/availableSlots já estão declarados
	// acima (bloco FIX-191/192) — não redeclarar; aqui só o adendo do FIX-197.
	/** FIX-197: valorCarta BRUTO (denominação, ex. 300k) vs a faixa exibida
	 * (`creditValue`). Alimenta o aviso de ajuste de faixa. */
	rawCreditValue?: number;
	/** FIX-220 (Ata 2026-07-04): a 1ª lista de reveal é NEUTRA — sem "grupo
	 * preferencial" (ainda não há dado de lance pra recomendar nada). Server-side
	 * SEMPRE coage "neutral" hoje (ver recommendation-payload.ts); "personalized"
	 * é o gancho pro estágio 2 (ONDA 2 — recomendação personalizada com dado de
	 * lance/recurso próprio, jornada-canonica.md item 6), ainda não implementado.
	 * Ausente == "neutral" (default seguro). */
	recommendationStage?: "neutral" | "personalized";
	/** FIX-223 (Ata 2026-07-04): lance médio do grupo (R$), quando a fonte o
	 * traz. Ausente → linha "Lance médio" omitida (nunca fabrica). */
	avgBidValue?: number;
	/** FIX-222 (Ata 2026-07-04): logo da administradora, quando cadastrado.
	 * Ausente → o card cai no fallback gracioso (iniciais/nome). */
	logoUrl?: string;
}

// ---- Lead form payload (NO PII — only metadata for artifact storage) ----

export interface LeadFormPayload {
	conversationId: string;
	recommendationId?: string;
	/**
	 * Nome já capturado conversacionalmente (save_contact_name) durante a
	 * conversa. Pré-preenche o campo "name" do form sem depender de fetch
	 * tardio em `/api/leads/[id]` — quando esse fetch falhava o form
	 * aparecia vazio mesmo com `conversations.contactName` populado.
	 */
	prefilledName?: string | null;
}

// ---- Quick reply payload ----

export interface QuickReplyOption {
	label: string;
	value: string;
	emoji?: string;
}

export interface QuickReplyPayload {
	options: QuickReplyOption[];
}

// ---- Value picker payload (legacy tool artifact) ----

export interface ValuePickerField {
	id: string;
	label: string;
	min: number;
	max: number;
	step: number;
	default: number;
	prefix?: string;
	suffix?: string;
	format?: "currency" | "months";
}

export interface ValuePickerPayload {
	category: "imovel" | "auto" | "moto" | "servicos";
	fields: ValuePickerField[];
}

// ---- Artifact discriminated union ----

// ---- Topic picker (#05) ----

export interface TopicPickerPayload {
	prompt?: string;
	topics: string[];
	includeBackButton: boolean;
}

// ---- 3 cenários (#16) ----

export interface ScenarioPayload {
	lancePercent: number;
	lanceValue: number;
	ownResourcesValue: number;
	expectedTermMonths: number;
	strategy: string;
	disclaimer: string;
}

export interface ScenariosPayload {
	groupId: string;
	administradora: string;
	creditValue: number;
	termMonths: number;
	scenarios: {
		conservador: ScenarioPayload;
		provavel: ScenarioPayload;
		acelerado: ScenarioPayload;
	};
}

// ---- Comparador consórcio × financiamento (#17) ----

export interface FinancingComparisonPayload {
	category: "imovel" | "auto" | "moto" | "servicos";
	creditValue: number;
	termMonths: number;
	consorcio: { monthlyPayment: number; totalCost: number };
	financing: { monthlyPayment: number; totalCost: number; annualRate: number };
	diff: { monthlyDelta: number; totalDelta: number };
	disclaimer: string;
}

// ---- WhatsApp opt-in (conversational capture pós-simulação) ----

// Sem payload obrigatório — agent só sinaliza "mostre o card aqui".
// O frontend resolve conversationId via context.
export interface WhatsappOptinPayload {
	conversationId?: string;
	/** FIX-27 — telefone MASCARADO já capturado (lead form/identify). Presença →
	 * o card vira confirmação de 1 clique (sem input vazio de re-coleta). */
	knownPhone?: string;
}

// ---- Decision prompt ("Esse plano faz sentido?" — jornada do .docx etapa 4) ----
// As 3 opções são canônicas (definidas pelo doc). Os botões enviam o texto do
// label, interpretado pelos fluxos existentes (contratar → lead form; outras →
// recomendação; especialista → handoff). Payload só carrega contexto opcional.
export interface DecisionPromptPayload {
	administradora?: string;
}

/** Opções canônicas do card de decisão (doc etapa 4). `label` = texto enviado
 * (web) / título do botão (WhatsApp, ≤20 chars via `waTitle`). `intent` rotula
 * a intenção pro roteamento conversacional. */
export const DECISION_PROMPT_QUESTION = "Esse plano faz sentido para você?";
export const DECISION_PROMPT_OPTIONS: Array<{
	intent: "contratar" | "outras" | "especialista";
	label: string;
	waTitle: string;
}> = [
	{ intent: "contratar", label: "Sim, quero reservar agora", waTitle: "Reservar agora" },
	{ intent: "outras", label: "Quero ver outras opções", waTitle: "Ver outras opções" },
	{
		intent: "especialista",
		label: "Quero falar com um especialista da Aja Agora",
		waTitle: "Falar c/ consultor",
	},
];

// ---- Passo 5 "Contratar" (fechamento Bevi) ----

/** Form de contratação: CPF + celular + aceite LGPD. NO PII em claro no
 * payload — só contexto pra renderizar (o form coleta e envia via action
 * contract-submit). FIX-9: quando a identidade já foi coletada no identify,
 * o runner enriquece com identityOnFile + CPF MASCARADO (nunca completo) e o
 * submit usa useStoredIdentity (route resolve via loadIdentity). */
export interface ContractFormPayload {
	conversationId: string;
	administradora?: string;
	prefilledPhone?: string | null;
	/** Identidade (CPF+celular) já armazenada cifrada — form vira confirmação. */
	identityOnFile?: boolean;
	/** Ex.: "529.•••.•••-25" — só os 3 primeiros e 2 últimos dígitos. */
	prefilledCpfMasked?: string | null;
}

/** Oferta REAL confirmada pela administradora (re-simulação Bevi). O usuário
 * confirma antes do choose_offer — fecha o gap indicativo×real da Descoberta. */
export interface RealOfferPayload {
	proposalId: string;
	administradora: string;
	grupo: string;
	category: "imovel" | "auto" | "moto" | "servicos";
	creditValue: number;
	/** Pode vir null/ausente — a API da Bevi mudou o shape (BUG-PARCELA-STRING
	 * 2026-06-12); o card omite a linha em vez de morrer. */
	monthlyPayment: number | null;
	/** FIX-39: prazo REAL (meses) da oferta de parceiro — a API nova (2026-06-12)
	 * passou a trazê-lo (gap do FIX-13 acabou). Opcional: shape antigo não tinha e
	 * a API pode voltar atrás → ausente mantém a copy de fallback do card. */
	termMonths?: number;
	/** FIX-40: lance médio do grupo (R$) — rótulo LITERAL do campo `lanceMedio` da
	 * API nova. Opcional; exibido só com fonte (D11). NUNCA prometer contemplação a
	 * partir dele (semântica não confirmada — só comparação factual de posição). */
	avgBidValue?: number;
	/** FIX-197 CONTRATO(bloco-a): valorCarta BRUTO (denominação da carta, ex. 300k)
	 * — distinto de `creditValue` (faixa re-simulada exibida). Presente e ≠ da faixa
	 * → aviso "ajustamos essa carta pra sua faixa de ~R$ X". Ausente → sem aviso. */
	rawCreditValue?: number;
}

/** Encaminhamento pra assinatura digital da administradora (sem "trocar de
 * empresa" — frase do doc). consortiumProposalLink = link Bevi. */
export interface SignatureHandoffPayload {
	administradora: string;
	consortiumProposalLink: string;
}

/** Upload de documento no chat (RG/CNH frente+verso). Os links são o fallback se
 * o upload automatizado falhar. */
export interface DocumentUploadPayload {
	proposalId: string;
	documentsLinkPersonal?: string;
	/** Documentos são opcionais — o card oferece "pular". */
	optional: boolean;
}

// ---- Simulador-agulha (passo 4 — viés de contemplação do Bernardo) ----

/** A agulha aponta o mês-alvo; o componente recalcula a "receita" (lance/crédito/
 * parcela) client-side com computeContemplationDial. O payload carrega só os
 * inputs-base + a posição inicial. */
export interface ContemplationDialPayload {
	administradora?: string;
	category: "imovel" | "auto" | "moto" | "servicos";
	creditValue: number;
	termMonths: number;
	monthlyPayment: number;
	historicalWinningBidPct?: number;
	/** FIX-C1: mês em que o lance de referência vence (probContemplacaoMeses
	 * real da oferta) — calibra a curva do dial pra bater com o card. */
	referenceMonth?: number;
	maxEmbutidoPct?: number;
	/** FIX-40: lance médio do grupo (R$) — âncora REAL de lance quando o snapshot
	 * da oferta a carrega. Opcional; referência factual, nunca probabilidade. */
	avgBidValue?: number;
	initialTargetMonth: number;
	/** FIX-C5: lance que o usuário declarou ter na qualificação — o componente
	 * confronta com o lance em dinheiro necessário ("cobre / não cobre"). */
	declaredLanceValue?: number;
}

// ---- Card lance embutido (FIX-228, docs/02-cards-novos.md CARD 1) ----

/** Regra dura: este card SEMPRE diz que o crédito recebido diminui — não é
 * opcional (separa consultoria de venda enganosa). Os números vêm da oferta
 * REAL, coagidos server-side (`embedded-bid-payload.ts`); a LLM só escolhe o
 * grupo. `maxEmbutidoPct` é 0-100 (mesma convenção do resto do codebase). */
export interface EmbeddedBidPayload {
	maxEmbutidoPct: number;
	creditValue: number;
	embeddedBidValue: number;
	netCredit: number;
	disclaimer: string;
}

// ---- Card dois caminhos, sem lance (FIX-229, docs/02-cards-novos.md CARD 3) ----

/** Bifurcação A/B pra quem NÃO vai dar lance (gate `lance`, saída "só a
 * parcela"). NUNCA carrega métrica de chance/probabilidade de contemplação
 * (proibido, docs/05-compliance-e-dados.md) — nenhum dos dois caminhos é
 * recomendado, o agente devolve a decisão ao cliente. `administradora`
 * (PT) segue a convenção do resto do codebase — não `administrator`. */
export interface TwoPathsPayload {
	monthlyPayment: number;
	administradora: string;
	disclaimer: string;
}

// ---- Card escassez (FIX-230, docs/02-cards-novos.md CARD 2) ----

/** `availableSlots` é PLACEBO comercial 1-6 (decisão de produto 2026-07-09,
 * ADR docs/decisoes/blocos/2026-07-09-agente-vendas-consorcio.md D3) — hash
 * determinístico do grupo (`scarcity-payload.ts` stableSlotFromId), NUNCA
 * `Math.random()` por render. `groupCode` é o id real ancorado (não exibido
 * na UI — só contexto/telemetria). `administradora` (PT). */
export interface ScarcityPayload {
	groupCode: string;
	administradora: string;
	availableSlots: number;
	disclaimer?: string;
}

export type ArtifactByType =
	| { type: "group_card"; payload: GroupCardPayload }
	| { type: "comparison_table"; payload: ComparisonTablePayload }
	| { type: "simulation_result"; payload: SimulationResultPayload }
	| { type: "recommendation_card"; payload: RecommendationCardPayload }
	| { type: "lead_form"; payload: LeadFormPayload }
	| { type: "quick_reply"; payload: QuickReplyPayload }
	| { type: "value_picker"; payload: ValuePickerPayload }
	| { type: "topic_picker"; payload: TopicPickerPayload }
	| { type: "scenarios"; payload: ScenariosPayload }
	| { type: "financing_comparison"; payload: FinancingComparisonPayload }
	| { type: "whatsapp_optin"; payload: WhatsappOptinPayload }
	| { type: "decision_prompt"; payload: DecisionPromptPayload }
	| { type: "contract_form"; payload: ContractFormPayload }
	| { type: "real_offer"; payload: RealOfferPayload }
	| { type: "signature_handoff"; payload: SignatureHandoffPayload }
	| { type: "document_upload"; payload: DocumentUploadPayload }
	| { type: "contemplation_dial"; payload: ContemplationDialPayload }
	| { type: "embedded_bid"; payload: EmbeddedBidPayload }
	| { type: "two_paths"; payload: TwoPathsPayload }
	| { type: "scarcity"; payload: ScarcityPayload };

export type ArtifactType = ArtifactByType["type"];

export type Artifact = ArtifactByType & { id: string };
