/**
 * Camada 1 — FIX-11 (rodada 2026-06-05 tarde): estado TERMINAL do fechamento
 * não entrava no system prompt.
 *
 * Bug real (prints 27-30): pós-fechamento REAL com a CANOPUS (grupo 4400,
 * R$ 46.000, docs enviados), o usuário perguntou "qual status da proposta?" e
 * o agent negou o fechamento, re-rodou a descoberta e ofereceu OUTRA
 * administradora (BANCO DO BRASIL). `meta.contractClosed` era setado no
 * offer-confirm (route.ts) mas NENHUMA seção do prompt o consumia — o modelo
 * não tinha como saber que existia contrato fechado.
 *
 * Fix: seção DINÂMICA `contractClosedSection(info)` (mesmo padrão do
 * whatsappOptinSection/FIX-5) — derivada do meta + bevi_proposals pela
 * resolveAgent, injetada no bloco dinâmico pelo builder.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { contractClosedSection } from "./system-prompt";

function readSource(rel: string): string {
	return readFileSync(resolve(process.cwd(), rel), "utf-8");
}

const CLOSED_INFO = {
	administradora: "CANOPUS",
	grupo: "4400",
	creditValue: 46000,
	monthlyPayment: 469.95,
	proposalStatus: "documentos",
};

describe("FIX-11 — contractClosedSection (estado terminal no prompt)", () => {
	it("com contrato fechado: seção carrega administradora/grupo e o estado", () => {
		const s = contractClosedSection(CLOSED_INFO);
		expect(s).toMatch(/CANOPUS/);
		expect(s).toMatch(/4400/);
		expect(s.toLowerCase()).toMatch(/contrat|fechad/);
	});

	it("proíbe explicitamente re-descoberta e segunda administradora", () => {
		const s = contractClosedSection(CLOSED_INFO);
		expect(s).toMatch(/PROIBIDO|NUNCA|N[ÃA]O/);
		// As violações exatas do bug real: re-buscar grupos e recomendar outra adm.
		expect(s.toLowerCase()).toMatch(/buscar|busca|descoberta|search_groups/);
		expect(s.toLowerCase()).toMatch(/outra administradora/);
	});

	it("proíbe negar o que já aconteceu (a alucinação 'nada chegou no nosso sistema')", () => {
		const s = contractClosedSection(CLOSED_INFO);
		expect(s.toLowerCase()).toMatch(/n[ãa]o negue|nunca negue|jamais negue/);
	});

	it("pergunta de status → responder DESTE estado (sem re-rodar nada)", () => {
		const s = contractClosedSection(CLOSED_INFO);
		expect(s.toLowerCase()).toMatch(/status/);
	});

	it("sem contrato fechado: seção vazia (prompt atual intacto — default seguro)", () => {
		expect(contractClosedSection(null)).toBe("");
	});

	it("info parcial (fallback do meta, sem row em bevi_proposals): não quebra", () => {
		const s = contractClosedSection({ administradora: "CANOPUS" });
		expect(s).toMatch(/CANOPUS/);
		expect(s).not.toMatch(/undefined|null|NaN/);
	});
});

describe("FIX-11 — acoplamento (o estado terminal chega ao modelo de verdade)", () => {
	it("builder repassa contractClosedInfo pro buildSpecialistPrompt", () => {
		const src = readSource("src/lib/agent/agents/builder.ts");
		expect(src).toMatch(/contractClosedInfo/);
	});

	it("resolveAgent deriva o estado do meta (e enriquece com bevi_proposals)", () => {
		const src = readSource("src/lib/agent/agents/index.ts");
		expect(src).toMatch(/contractClosed/);
		expect(src).toMatch(/getLatestBeviProposal/);
	});

	it("buildSpecialistPrompt injeta a seção no bloco dinâmico", () => {
		const src = readSource("src/lib/agent/system-prompt.ts");
		expect(src).toMatch(/contractClosedSection/);
	});
});
