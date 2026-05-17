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
import { computeQuota, resolveInsurancePercent } from "./compute-quota";

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

		return filtered.map((g) => {
			const insurancePercent = resolveInsurancePercent(rates, g.administradora, g.category);
			const { monthlyPayment } = computeQuota({
				creditValue: g.creditValue,
				termMonths: g.termMonths,
				adminFeePercent: g.adminFeePercent,
				reserveFundPercent: g.reserveFundPercent,
				insurancePercent,
			});
			return {
				id: g.id,
				administradora: g.administradora,
				category: g.category,
				creditValue: g.creditValue,
				monthlyPayment: Math.round(monthlyPayment * 100) / 100,
				adminFeePercent: g.adminFeePercent,
				termMonths: g.termMonths,
				totalParticipants: g.totalParticipants,
				availableSlots: g.availableSlots,
				contemplationRate: this.calculateContemplationRate(g.id),
			};
		});
	}

	async simulateQuota(params: SimulateQuotaParams): Promise<QuotaSimulation> {
		const group = groups.find((g) => g.id === params.groupId);
		if (!group) {
			throw new Error(`Group not found: ${params.groupId}`);
		}

		const insurancePercent = resolveInsurancePercent(rates, group.administradora, group.category);
		const quota = computeQuota({
			creditValue: params.creditValue,
			termMonths: group.termMonths,
			adminFeePercent: group.adminFeePercent,
			reserveFundPercent: group.reserveFundPercent,
			insurancePercent,
		});

		return {
			groupId: params.groupId,
			creditValue: params.creditValue,
			monthlyPayment: Math.round(quota.monthlyPayment * 100) / 100,
			adminFee: Math.round(quota.adminFeeTotal * 100) / 100,
			reserveFund: Math.round(quota.reserveFundTotal * 100) / 100,
			insurance: Math.round(quota.insuranceTotal * 100) / 100,
			totalCost: Math.round(quota.totalCost * 100) / 100,
			termMonths: group.termMonths,
			effectiveRate: Math.round(quota.effectiveRate * 100) / 100,
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
