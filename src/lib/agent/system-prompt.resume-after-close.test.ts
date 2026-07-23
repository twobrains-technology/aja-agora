import { describe, expect, it } from "vitest";
import {
	buildSpecialistPrompt,
	type ContractClosedInfo,
	type PersonaRow,
	resumeAfterCloseSection,
} from "./system-prompt";

const CONTRACT_CLOSED_INFO: ContractClosedInfo = {
	administradora: "Canopus",
	grupo: "4400",
	creditValue: 46000,
	monthlyPayment: 469.95,
	proposalStatus: "documentos",
};

function fakePersonaRow(): PersonaRow {
	return {
		id: "auto-helena",
		displayName: "Helena",
		role: "specialist",
		category: "auto",
		expertise: null,
		voiceTone: "Consultiva, direta, calorosa.",
		examples: [],
		temperature: 0.7,
		activeCampaigns: [],
		handoffTriggers: [],
		forbiddenTopics: [],
		activeTools: [],
		isActive: true,
		version: 1,
		createdAt: new Date("2026-01-01T00:00:00Z"),
		updatedAt: new Date("2026-01-01T00:00:00Z"),
	};
}

describe("resumeAfterCloseSection (FIX-368)", () => {
	it("não emite nada sem contractClosedInfo, mesmo em turno de retomada", () => {
		expect(resumeAfterCloseSection(null, true)).toBe("");
	});

	it("não emite nada com contractClosedInfo mas fora de turno de retomada (ex.: pergunta de status)", () => {
		expect(resumeAfterCloseSection(CONTRACT_CLOSED_INFO, false)).toBe("");
	});

	it("emite a seção quando contractClosedInfo existe E é turno de retomada", () => {
		const section = resumeAfterCloseSection(CONTRACT_CLOSED_INFO, true);
		expect(section).not.toBe("");
		expect(section).toContain("PRIMEIRA frase");
		expect(section).toContain("Canopus");
		expect(section).toContain("WhatsApp");
	});
});

describe("buildSpecialistPrompt — bloco dynamic (FIX-368)", () => {
	it("inclui a seção de retomada no bloco dynamic quando contractClosed + isResumeGreeting batem", () => {
		const { dynamic } = buildSpecialistPrompt(
			fakePersonaRow(),
			"neutro",
			new Date("2026-07-22T12:00:00Z"),
			"locked",
			CONTRACT_CLOSED_INFO,
			null,
			null,
			false,
			"terminal",
			true, // isResumeGreeting
		);
		expect(dynamic).toContain("Retomada pós-fechamento");
	});

	it("NÃO inclui a seção quando contractClosed existe mas NÃO é turno de retomada (turno normal pós-fechamento)", () => {
		const { dynamic } = buildSpecialistPrompt(
			fakePersonaRow(),
			"neutro",
			new Date("2026-07-22T12:00:00Z"),
			"locked",
			CONTRACT_CLOSED_INFO,
			null,
			null,
			false,
			"terminal",
			false, // isResumeGreeting
		);
		expect(dynamic).not.toContain("Retomada pós-fechamento");
		// A seção "estado terminal" (contractClosedSection, FIX-11) continua ativa —
		// este fix não deve suprimi-la.
		expect(dynamic).toContain("RESERVA CONFIRMADA");
	});

	it("NÃO inclui a seção em turno de retomada sem contrato fechado (retomada normal, meio do funil)", () => {
		const { dynamic } = buildSpecialistPrompt(
			fakePersonaRow(),
			"neutro",
			new Date("2026-07-22T12:00:00Z"),
			"locked",
			null,
			null,
			null,
			false,
			"terminal",
			true, // isResumeGreeting
		);
		expect(dynamic).not.toContain("Retomada pós-fechamento");
	});
});
