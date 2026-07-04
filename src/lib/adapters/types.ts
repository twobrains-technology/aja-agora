// src/lib/adapters/types.ts

// ---- Domain types ----

export type ConsorcioCategory = "imovel" | "auto" | "moto" | "servicos";

export interface GroupSummary {
	id: string;
	administradora: string;
	category: ConsorcioCategory;
	creditValue: number;
	monthlyPayment: number;
	adminFeePercent: number;
	termMonths: number;
	totalParticipants: number;
	availableSlots: number;
	contemplationRate: number; // % historically contemplated per month
	// FIX-193: critérios INTERNOS de ranking/dedup — NUNCA vão pra UI. `tipoOferta`
	// (SPECIAL_OFFER|FREE_BID) desempata por afinidade de lance; `grupo` (nº do
	// grupo) dedupa o mesmo grupo vindo em 2 modalidades. Stripados no
	// toModelGroupSummary (fora do contexto do modelo e do payload de card).
	tipoOferta?: string;
	grupo?: string;
	// FIX-191 (CONTRATO bloco-b): UUID de sessão da oferta (quando a fonte o traz).
	ofertaId?: string;
	// FIX-219: marcador INTERNO (sintético, não vem da Bevi) — de qual variante
	// da busca com/sem lance embutido esta oferta veio. NUNCA vai pra UI
	// (stripado no toModelGroupSummary); existe só pra o dedup de
	// recommendation.ts não colapsar as duas modalidades do mesmo grupo.
	embeddedVariant?: "sem" | "com";
}

export interface QuotaSimulation {
	groupId: string;
	category: ConsorcioCategory;
	creditValue: number;
	monthlyPayment: number;
	adminFee: number;
	reserveFund: number;
	insurance: number;
	totalCost: number;
	termMonths: number;
	effectiveRate: number; // taxa efetiva total over term
	/** Projeção de cenário com lance (bug #10 Bruna v1 review). */
	lanceScenario: {
		lancePercent: number; // % do crédito ofertado como lance
		expectedTermMonths: number; // prazo esperado até contemplação com esse lance
	};
	/** Cenário de lance embutido (jornada do .docx 2026-05-29 / Bevi).
	 * Usa parte da própria carta como lance — o usuário recebe o crédito
	 * líquido (carta − lance embutido). Sempre computado pra permitir a
	 * comparação "com/sem lance embutido" que o doc pede. NÃO é garantia de
	 * contemplação (CDC art. 30/37). */
	embeddedBid: {
		percent: number; // % da carta usado como lance embutido (30 default, Bevi aceita 30/50)
		embeddedBidValue: number; // R$ da carta destinado ao lance embutido
		receivedCredit: number; // crédito líquido recebido (carta − lance embutido)
		/** Estimativa de lance pra contemplar (R$) — dado REAL da oferta ou null
		 * (FIX-8: sem heurística; null = UI omite a linha). Não é garantia. */
		necessaryBidToContemplate: number | null;
	};
	/** Correção prevista da carta — INCC pra imóvel, IPCA pra auto (bug #10). */
	expectedAdjustment: {
		index: "INCC" | "IPCA";
		annualPercent: number;
	};
}

export interface RateInfo {
	administradora: string;
	category: ConsorcioCategory;
	adminFeePercent: number;
	reserveFundPercent: number;
	insurancePercent: number;
	updatedAt: string; // ISO date
}

export interface ContemplationEntry {
	month: string; // YYYY-MM
	contemplated: number;
	method: "sorteio" | "lance";
	lancePercent?: number;
}

export interface GroupDetails {
	id: string;
	administradora: string;
	groupNumber: string;
	category: ConsorcioCategory;
	creditValue: number;
	termMonths: number;
	totalParticipants: number;
	availableSlots: number;
	adminFeePercent: number;
	reserveFundPercent: number;
	monthlyPayment: number;
	contemplationHistory: ContemplationEntry[];
	nextAssembly: string; // ISO date
	startDate: string; // ISO date
	status: "forming" | "active" | "closing";
}

// ---- Input types (used by tools, defined here to avoid circular deps) ----

export interface SearchGroupsParams {
	category: ConsorcioCategory;
	creditMin?: number;
	creditMax?: number;
	/** FIX-70: quando true, a descoberta varre 3-5 faixas de valor ao redor do
	 * alvo (sweep sequencial), acumulando alternativas reais no índice pra montar
	 * comparação. Default/omitido = busca rápida de 1 faixa. Adapters que não
	 * suportam sweep (ex.: fechamento Trilho A) ignoram o campo. */
	sweep?: boolean;
	// FIX-219 (Ata 2026-07-04): não é um campo — comportamento sempre-ligado do
	// BeviSelfContractAdapter. Toda busca por valor (com ou sem `sweep`) roda a
	// Bevi 2x pro valor-alvo (sem embutido + ~30% embutido) e une por quotaId —
	// a Bevi não informa se a cota aceita, e a conversa de lance é pós-reveal
	// (FIX-215), então não há como perguntar antes. Sem opt-out: não há cenário
	// hoje em que a descoberta deva ignorar o eixo embutido.
}

export interface SimulateQuotaParams {
	groupId: string;
	creditValue: number;
}

export interface GetRatesParams {
	administradora?: string;
	category?: ConsorcioCategory;
}

export interface GetGroupDetailsParams {
	groupId: string;
}

// ---- Adapter interface ----

export interface AdministradoraAdapter {
	searchGroups(params: SearchGroupsParams): Promise<GroupSummary[]>;
	simulateQuota(params: SimulateQuotaParams): Promise<QuotaSimulation>;
	getRates(params: GetRatesParams): Promise<RateInfo[]>;
	getGroupDetails(params: GetGroupDetailsParams): Promise<GroupDetails>;
}
