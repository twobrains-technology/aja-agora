// A tabela comparativa mostra EXATAMENTE as cartas do índice, na ordem do índice.
// Sem teto e sem dedup em código: quantas e quais é decisão do agente (P10, P11).
import { describe, expect, it } from "vitest";
import {
	buildComparisonTableFromRevealGroups,
	type RevealGroupIndex,
	type RevealGroupLike,
} from "./recommendation-payload";

function carta(id: string, over: Partial<RevealGroupLike> = {}): RevealGroupLike {
	return {
		id,
		administradora: "Canopus",
		category: "auto",
		creditValue: 80_000,
		monthlyPayment: 900 + Number(id.replace(/\D/g, "")),
		termMonths: 96,
		adminFeePercent: 17,
		availableSlots: 5,
		...over,
	};
}

function indice(cartas: RevealGroupLike[]): RevealGroupIndex {
	return new Map(cartas.map((c) => [c.id, c]));
}

function idsDe(payload: Record<string, unknown>): string[] {
	return (payload.groups as Array<{ id: string }>).map((g) => g.id);
}

describe("buildComparisonTableFromRevealGroups — sem corte", () => {
	it("30 cartas no índice viram 30 linhas, na ordem do índice", () => {
		const cartas = Array.from({ length: 30 }, (_, i) => carta(`g${i + 1}`));

		const payload = buildComparisonTableFromRevealGroups(indice(cartas));

		expect(idsDe(payload)).toEqual(cartas.map((c) => c.id));
	});

	it("duas cartas de ids diferentes com a mesma condição visível ficam as duas", () => {
		const a = carta("q1", { monthlyPayment: 977.12 });
		const b = carta("q2", { monthlyPayment: 977.12 });

		const payload = buildComparisonTableFromRevealGroups(indice([a, b]));

		expect(idsDe(payload)).toEqual(["q1", "q2"]);
	});
});
