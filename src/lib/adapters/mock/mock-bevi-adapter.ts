import type {
	AdministradoraAdapter,
	SearchGroupsParams,
	SimulateQuotaParams,
	GetRatesParams,
	GetGroupDetailsParams,
	GroupSummary,
	QuotaSimulation,
	RateInfo,
	GroupDetails,
} from "../types";

import groupsData from "./data/groups.json";
import ratesData from "./data/rates.json";
import contemplationData from "./data/contemplation.json";

const groups = groupsData as unknown as Omit<GroupDetails, "contemplationHistory">[];
const rates = ratesData as RateInfo[];
const contemplation = contemplationData as unknown as Record<
	string,
	GroupDetails["contemplationHistory"]
>;

export class MockBeviAdapter implements AdministradoraAdapter {
	async searchGroups(params: SearchGroupsParams): Promise<GroupSummary[]> {
		let filtered = groups.filter((g) => g.category === params.category);

		if (params.creditMin !== undefined) {
			filtered = filtered.filter((g) => g.creditValue >= params.creditMin!);
		}
		if (params.creditMax !== undefined) {
			filtered = filtered.filter((g) => g.creditValue <= params.creditMax!);
		}

		return filtered.map((g) => ({
			id: g.id,
			administradora: g.administradora,
			category: g.category,
			creditValue: g.creditValue,
			monthlyPayment: g.monthlyPayment,
			adminFeePercent: g.adminFeePercent,
			termMonths: g.termMonths,
			totalParticipants: g.totalParticipants,
			availableSlots: g.availableSlots,
			contemplationRate: this.calculateContemplationRate(g.id),
		}));
	}

	async simulateQuota(params: SimulateQuotaParams): Promise<QuotaSimulation> {
		const group = groups.find((g) => g.id === params.groupId);
		if (!group) {
			throw new Error(`Group not found: ${params.groupId}`);
		}

		const rate = rates.find(
			(r) => r.administradora === group.administradora && r.category === group.category,
		);

		const adminFeeTotal = params.creditValue * (group.adminFeePercent / 100);
		const reserveFundTotal = params.creditValue * (group.reserveFundPercent / 100);
		const insuranceMonthly = params.creditValue * ((rate?.insurancePercent ?? 0.03) / 100);
		const insuranceTotal = insuranceMonthly * group.termMonths;

		const totalCost = params.creditValue + adminFeeTotal + reserveFundTotal + insuranceTotal;
		const monthlyPayment = totalCost / group.termMonths;
		const effectiveRate = ((totalCost - params.creditValue) / params.creditValue) * 100;

		return {
			groupId: params.groupId,
			creditValue: params.creditValue,
			monthlyPayment: Math.round(monthlyPayment * 100) / 100,
			adminFee: Math.round(adminFeeTotal * 100) / 100,
			reserveFund: Math.round(reserveFundTotal * 100) / 100,
			insurance: Math.round(insuranceTotal * 100) / 100,
			totalCost: Math.round(totalCost * 100) / 100,
			termMonths: group.termMonths,
			effectiveRate: Math.round(effectiveRate * 100) / 100,
		};
	}

	async getRates(params: GetRatesParams): Promise<RateInfo[]> {
		let filtered = [...rates];

		if (params.administradora) {
			filtered = filtered.filter((r) => r.administradora === params.administradora);
		}
		if (params.category) {
			filtered = filtered.filter((r) => r.category === params.category);
		}

		return filtered;
	}

	async getGroupDetails(params: GetGroupDetailsParams): Promise<GroupDetails> {
		const group = groups.find((g) => g.id === params.groupId);
		if (!group) {
			throw new Error(`Group not found: ${params.groupId}`);
		}

		return {
			...group,
			contemplationHistory: contemplation[params.groupId] ?? [],
		};
	}

	private calculateContemplationRate(groupId: string): number {
		const history = contemplation[groupId];
		if (!history || history.length === 0) return 0;
		const totalContemplated = history.reduce((sum, entry) => sum + entry.contemplated, 0);
		return Math.round((totalContemplated / history.length) * 100) / 100;
	}
}
