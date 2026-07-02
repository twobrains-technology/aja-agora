import { describe, expect, it } from "vitest";
import {
	buildAdjustValueDirective,
	buildAdvanceToContractDirective,
	buildDiscoveryFailedFallback,
	buildTransitionFirstContactDirective,
} from "./directives";

// FIX-186 (Kairo 2026-07-01) — a mensagem determinística de fallback quando a
// descoberta na Bevi falha após retry. É a copy FIXA que substitui a narração
// crua do modelo ("dificuldade técnica pontual"). NÃO é directive pro modelo — é
// o texto que chega DIRETO ao usuário (Lei 1: código dispõe). Por isso: PT-BR
// correto (acentos) e ZERO palavra de erro técnico cru.
describe("buildDiscoveryFailedFallback — mensagem determinística de descoberta falhada", () => {
	// As MESMAS palavras que o detector do cassette (Camada 2) reprova na narração
	// crua do modelo. A mensagem determinística tem que passar limpa por elas.
	const PALAVRAS_PROIBIDAS = [
		/problema/i,
		/dificuldade t[ée]cnica/i,
		/instabilidade/i,
		/inst[áa]vel/i,
		/tent[ea]\s+de\s+novo/i,
		/erro/i,
	];

	it("não usa NENHUMA palavra de erro técnico cru", () => {
		const msg = buildDiscoveryFailedFallback({ name: "Maria" });
		for (const rx of PALAVRAS_PROIBIDAS) {
			expect(rx.test(msg), `fallback não pode casar ${rx} — vira narração de erro cru`).toBe(
				false,
			);
		}
	});

	it("é PT-BR correto (acentos/cedilha) — 'opções' com acento, nunca ASCII-fication", () => {
		const msg = buildDiscoveryFailedFallback({ name: "Maria" });
		expect(msg).toContain("opções");
		expect(msg).not.toMatch(/\bopcoes\b|\bnao\b|\bvoce\b/);
	});

	it("oferece as duas saídas acionáveis: re-tentar + especialista da Aja", () => {
		const msg = buildDiscoveryFailedFallback({ name: "Maria" });
		expect(msg.toLowerCase()).toContain("especialista");
		// convite a re-tentar SEM a frase proibida "tente de novo"
		expect(msg.toLowerCase()).toMatch(/daqui a pouco|em instantes|mais tarde|de novo/);
	});

	it("usa o nome do usuário quando conhecido e funciona sem nome", () => {
		expect(buildDiscoveryFailedFallback({ name: "Maria" })).toContain("Maria");
		const semNome = buildDiscoveryFailedFallback({ name: null });
		expect(semNome.length).toBeGreaterThan(0);
		expect(semNome).not.toContain("null");
		expect(semNome).not.toContain("undefined");
	});
});

describe("buildTransitionFirstContactDirective — nome capture", () => {
	it("inclui nameHint quando sistema sabe o nome do user", () => {
		const directive = buildTransitionFirstContactDirective(
			"Automóvel",
			"O usuario se chama Kairo, voce pode usar o primeiro nome.",
		);
		expect(directive).toContain("Kairo");
		expect(directive.toLowerCase()).not.toContain("pergunte o nome");
	});

	it("instrui agent a pedir nome quando nameHint vazio (PF-08)", () => {
		const directive = buildTransitionFirstContactDirective("Automóvel", "");
		expect(directive.toLowerCase()).toContain("nome");
		expect(directive.toLowerCase()).toMatch(/pergunte|peca|como.*chamar/i);
	});

	it("menciona categoria no directive", () => {
		const directive = buildTransitionFirstContactDirective("Imóvel", "");
		expect(directive).toContain("Imóvel");
	});
});

// FIX-29 — directives do clique pós-reveal: "Ajustar valor" reabre o what-if e
// NUNCA inicia fechamento; reafirmar interesse pós-decisão avança pro passo 5.
describe("buildAdjustValueDirective — reabre o ajuste, sem fechamento", () => {
	it("instrui perguntar o novo valor e NÃO simular ainda", () => {
		const d = buildAdjustValueDirective({ administradora: "Itaú", currentCreditValue: 200_000 });
		expect(d).toMatch(/ajustar|novo valor|mudar/i);
		expect(d).toContain("Itaú");
	});

	it("PROÍBE iniciar fechamento (sem lead_form, contract_form ou decision_prompt)", () => {
		const d = buildAdjustValueDirective({ administradora: "Itaú", currentCreditValue: 200_000 });
		expect(d).not.toContain("present_lead_form");
		expect(d).not.toContain("present_contract_form");
		expect(d).not.toContain("present_decision_prompt");
	});
});

describe("buildAdvanceToContractDirective — reafirmou interesse pós-decisão → passo 5", () => {
	it("dirige present_contract_form, NUNCA present_lead_form/consultor", () => {
		const d = buildAdvanceToContractDirective({ administradora: "Itaú" });
		expect(d).toContain("present_contract_form");
		expect(d).not.toContain("present_lead_form");
		expect(d.toLowerCase()).not.toContain("consultor");
	});
});
