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
		necessaryBidToContemplate: number; // estimativa de lance pra contemplar (R$) — não garantia
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
