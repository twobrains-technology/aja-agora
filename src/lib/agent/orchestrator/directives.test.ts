import { describe, expect, it } from "vitest";
import {
	buildAdjustValueDirective,
	buildAdvanceToContractDirective,
	buildQualifyStartYesDirective,
	buildTransitionFirstContactDirective,
} from "./directives";

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

// FIX-194 (qa-dono-produto carro web, defeito E): o agente perguntava "Quanto
// custa o carro?" no MESMO balão do gate que só coleta CPF/celular — o usuário
// não pode responder ali (o valor tem seu próprio passo DEPOIS da identidade,
// FIX-53). O turno consent→identify roda buildQualifyStartYesDirective: ele
// precisa reagir curto e NÃO puxar a pergunta de valor. "Uma coisa por vez."
describe("FIX-194 — turno consent→identify não pergunta o valor/preço do bem", () => {
	it("o directive PROÍBE perguntar o valor/preço (identidade vem antes; o sistema conduz)", () => {
		const d = buildQualifyStartYesDirective();
		// forbid explícito da pergunta de valor.
		expect(d).toMatch(/N[ÃA]O\s+pergunt\w+[^.]*(valor|pre[çc]o)/i);
	});

	it("o directive NÃO contém a pergunta de preço em si (uma coisa por vez)", () => {
		const d = buildQualifyStartYesDirective();
		expect(d.toLowerCase()).not.toMatch(/quanto custa/);
		// não instrui a chamar tool nem a coletar o valor neste turno.
		expect(d).not.toContain("present_value_picker");
	});
});
