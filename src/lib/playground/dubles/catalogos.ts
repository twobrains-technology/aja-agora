// Catálogos determinísticos do dublê de descoberta (simulação F4). Derivam das
// capturas reais (`FIXTURE_OFFERS`) só alterando VALORES de campos que o
// `BeviOffer` já tem. Sem Math.random, sem Date.now.
import type { BeviSelfContractAdapter } from "@/lib/adapters/bevi/bevi-self-contract-adapter";
import type { BeviOffer } from "@/lib/adapters/bevi/offer-mapper";
import type { CatalogoId } from "../simulacao/tipos";
import { FIXTURE_OFFERS, fixtureDiscoveryAdapter } from "./fixture-discovery-adapter";

export const CATALOGO_IDS: readonly CatalogoId[] = ["padrao", "grande", "canopus-quase-iguais"];

const ROTULOS: Record<CatalogoId, string> = {
	padrao: "Catálogo padrão (capturas reais)",
	grande: "Catálogo grande (mais de 4 cartas)",
	"canopus-quase-iguais": "Canopus quase iguais (grupo 977, 80 mil)",
};

type Variante = {
	base: number; // índice da captura real clonada
	bank: string;
	bankLabel: string;
	group: string;
	term: number;
	finalValue: number;
};

// Tabela fixa: 4+ administradoras, faixas 50–120 mil.
const VARIANTES: readonly Variante[] = [
	{ base: 0, bank: "ITAU", bankLabel: "ITAÚ", group: "50067", term: 70, finalValue: 54832 },
	{ base: 1, bank: "ANCORA", bankLabel: "ÂNCORA", group: "540", term: 118, finalValue: 62000 },
	{
		base: 2,
		bank: "BANCO DO BRASIL",
		bankLabel: "BANCO DO BRASIL",
		group: "1749",
		term: 88,
		finalValue: 75000,
	},
	{ base: 0, bank: "PORTO", bankLabel: "PORTO", group: "3310", term: 80, finalValue: 90000 },
	{
		base: 1,
		bank: "RODOBENS",
		bankLabel: "RODOBENS",
		group: "2208",
		term: 100,
		finalValue: 100000,
	},
	{ base: 2, bank: "CANOPUS", bankLabel: "CANOPUS", group: "811", term: 84, finalValue: 120000 },
	{ base: 0, bank: "ITAU", bankLabel: "ITAÚ", group: "50112", term: 72, finalValue: 68000 },
	{
		base: 2,
		bank: "BANCO DO BRASIL",
		bankLabel: "BANCO DO BRASIL",
		group: "1802",
		term: 96,
		finalValue: 110000,
	},
];

const CAMPOS_PROPORCIONAIS = [
	"receivedCredit",
	"bidAmount",
	"installmentValue",
	"importedInstallmentValue",
	"totalPaid",
	"totalDue",
	"reserveFundAmount",
	"insuranceTotalAmount",
	"totalBidAmount",
	"creditNetAfterContemplation",
	"averageBid",
	"necessaryBidToContemplate",
	"bidDifference",
	"individualQuotaValue",
	"embeddedBid",
	"quotaLookupValue",
	"lookupCeiling",
	"minContemplationPaymentBrl",
	"minimumValueToBeContemplatedBrl",
	"paidInstallmentsAmountBeforeContemplation",
] as const;

function clonar(v: Variante, i: number): BeviOffer {
	const base = FIXTURE_OFFERS[v.base % FIXTURE_OFFERS.length] as BeviOffer;
	const fator = v.finalValue / base.finalValue;
	const o = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
	for (const campo of CAMPOS_PROPORCIONAIS) {
		const n = o[campo];
		if (typeof n === "number") o[campo] = Math.round(n * fator * 100) / 100;
	}
	// Prazo diferente da captura: ajusta a parcela pelo prazo para manter coerência.
	const razaoPrazo = base.term / v.term;
	for (const campo of ["installmentValue", "importedInstallmentValue"] as const) {
		const n = o[campo];
		if (typeof n === "number") o[campo] = Math.round(n * razaoPrazo * 100) / 100;
	}
	o.bank = v.bank;
	o.bankLabel = v.bankLabel;
	o.group = v.group;
	o.grupo = v.group;
	o.term = v.term;
	o.finalValue = v.finalValue;
	o.quotaId = `sim-quota-${String(i + 1).padStart(3, "0")}`;
	o.ofertaId = `sim-oferta-${String(i + 1).padStart(3, "0")}`;
	return o as unknown as BeviOffer;
}

function ofertaCanopus(
	n: number,
	parcela: number,
	variante: "sem" | "com",
	imported: number,
): BeviOffer {
	const o = clonar(
		{
			base: 2,
			bank: "CANOPUS",
			bankLabel: "CANOPUS",
			group: "977",
			term: 80,
			finalValue: 80000,
		},
		100 + n,
	) as unknown as Record<string, unknown>;
	o.installmentValue = parcela;
	o.importedInstallmentValue = imported;
	o.embeddedVariant = variante;
	return o as unknown as BeviOffer;
}

function montarGrande(): BeviOffer[] {
	return VARIANTES.map(clonar);
}

export function ofertasDoCatalogo(id: CatalogoId): BeviOffer[] {
	if (id === "padrao") return FIXTURE_OFFERS;
	const grande = montarGrande();
	if (id === "grande") return grande;
	return [
		...grande,
		ofertaCanopus(1, 977.12, "sem", 977.12),
		ofertaCanopus(2, 977.4, "com", 977.4),
	];
}

const CAMPOS_NUMERICOS = [
	"finalValue",
	"receivedCredit",
	"installmentValue",
	"importedInstallmentValue",
	"totalPaid",
	"embeddedBid",
	"term",
	"necessaryBidToContemplate",
	"averageBid",
] as const;

export function numerosDoCatalogo(id: CatalogoId): number[] {
	const set = new Set<number>();
	for (const oferta of ofertasDoCatalogo(id)) {
		const o = oferta as unknown as Record<string, unknown>;
		for (const campo of CAMPOS_NUMERICOS) {
			const n = o[campo];
			if (typeof n !== "number" || !Number.isFinite(n)) continue;
			set.add(n);
			set.add(Math.round(n)); // leitura arredondada que a UI mostra
			set.add(Math.round(n * 100) / 100);
		}
	}
	return [...set].sort((a, b) => a - b);
}

export function rotuloDoCatalogo(id: CatalogoId): string {
	return ROTULOS[id];
}

export function adapterDoCatalogo(id: CatalogoId): BeviSelfContractAdapter {
	if (id === "padrao") return fixtureDiscoveryAdapter();
	return fixtureDiscoveryAdapter({ offers: ofertasDoCatalogo(id) });
}
