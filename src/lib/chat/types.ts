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
	 * da oferta Bevi (monthlyAwardedQuotas/availableSlots). Contagem, não %. */
	contempladosMes?: number;
	score: number; // 0-1 composite score from rankGroups()
	scoreBreakdown: {
		monthlyFit: number;
		contemplation: number;
		adminFee: number;
		termMatch: number;
	};
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
	{ intent: "contratar", label: "Sim, quero contratar agora", waTitle: "Contratar agora" },
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
	monthlyPayment: number;
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
	maxEmbutidoPct?: number;
	initialTargetMonth: number;
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
	| { type: "contemplation_dial"; payload: ContemplationDialPayload };

export type ArtifactType = ArtifactByType["type"];

export type Artifact = ArtifactByType & { id: string };
