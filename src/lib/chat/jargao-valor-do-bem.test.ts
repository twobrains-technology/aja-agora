/**
 * Camada 1 — FIX-2 (teste manual Kairo 2026-06-05): linguagem amigável.
 *
 * Pedido do cliente (e do docx, que fala "valor do bem"): o usuário comum não
 * entende "crédito"/"carta de crédito" seco. Toda copy USER-FACING troca:
 *   - "crédito" (= valor que o usuário quer/recebe) → "valor do bem"
 *   - "Crédito líquido recebido" → "Valor que você recebe"
 *   - "carta de crédito" só aparece COM explicação acoplada (1ª menção) ou
 *     com aposto "(valor do bem)" em resumo oficial.
 *
 * NÃO muda: identificadores internos (creditValue, creditMin/Max), payloads
 * Bevi, colunas de DB — só o que o usuário lê.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { gateQuestion } from "@/lib/agent/orchestrator/gate-questions";

function readSource(rel: string): string {
	return readFileSync(resolve(process.cwd(), rel), "utf-8");
}

describe("FIX-2 — gate credit pergunta pelo valor do bem, não por 'faixa de crédito'", () => {
	it("gateQuestion('credit') usa 'valor do bem' e não o jargão seco", () => {
		const q = (gateQuestion("credit") ?? "").toLowerCase();
		expect(q).toMatch(/valor do bem/);
		expect(q).not.toMatch(/faixa de crédito|faixa de credito/);
	});

	it("slider do gate credit tem label 'Valor do bem' (web/adapter)", () => {
		const src = readSource("src/lib/web/adapter.ts");
		expect(src).toMatch(/label: "Valor do bem"/);
		expect(src).not.toMatch(/label: "Crédito"/);
	});
});

describe("FIX-2 — cards de artifact sem jargão seco", () => {
	const cardsComLabelValorDoBem = [
		"src/components/chat/artifacts/recommendation-card.tsx",
		"src/components/chat/artifacts/group-card.tsx",
		"src/components/chat/artifacts/comparison-table.tsx",
	];

	// 2026-07: os cards passaram a usar "Carta de crédito" — é o termo que a
	// administradora imprime na proposta e o que o cliente vai ler no contrato,
	// então falar diferente aqui e igual lá confundia mais do que ajudava. O que
	// segue PROIBIDO é o jargão seco "Crédito" sozinho, sem substantivo.
	for (const file of cardsComLabelValorDoBem) {
		it(`${file.split("/").pop()}: nomeia o valor ("Valor do bem" ou "Carta de crédito"), nunca "Crédito" seco`, () => {
			const src = readSource(file);
			expect(src).toMatch(/Valor do bem|Carta de crédito/);
			expect(src).not.toMatch(/>Crédito</);
		});
	}

	it("simulation-result: 'Valor do bem' + 'Valor que você recebe' (não 'crédito' seco)", () => {
		const src = readSource("src/components/chat/artifacts/simulation-result.tsx");
		expect(src).toMatch(/Valor do bem/);
		expect(src).not.toMatch(/Valor do crédito/);
		expect(src).toMatch(/Valor que você recebe/);
		expect(src).not.toMatch(/Crédito líquido recebido/);
		// cenário com lance: % é "do valor do bem", não "do crédito"
		expect(src).not.toMatch(/% do crédito/);
	});

	it("contemplation-dial: 'Valor que você recebe' (não 'Crédito que você recebe')", () => {
		const src = readSource("src/components/chat/artifacts/contemplation-dial.tsx");
		expect(src).toMatch(/Valor que você recebe/);
		expect(src).not.toMatch(/Crédito que você recebe/);
	});

	it("real-offer (fechamento): 'Valor do bem' (não 'Carta de crédito' seca)", () => {
		const src = readSource("src/components/chat/artifacts/real-offer.tsx");
		expect(src).toMatch(/Valor do bem/);
		expect(src).not.toMatch(/label="Carta de crédito"/);
	});
});

describe("FIX-2 — WhatsApp formatter sem jargão seco", () => {
	it("formatter não usa 'Crédito:'/'Crédito líquido:'/'Faixas de crédito' nas mensagens", () => {
		const src = readSource("src/lib/whatsapp/formatter.ts");
		expect(src).not.toMatch(/Crédito: \$\{/);
		expect(src).not.toMatch(/\*Crédito:\*/);
		expect(src).not.toMatch(/Crédito líquido/);
		expect(src).not.toMatch(/Faixas de crédito/);
		expect(src).not.toMatch(/o crédito que você recebe/);
		// presença das versões amigáveis
		expect(src).toMatch(/Valor do bem/);
		expect(src).toMatch(/Valor que você recebe|valor que você recebe/);
	});

	it("comparativo com financiamento usa 'Valor do bem' no header", () => {
		const src = readSource("src/lib/whatsapp/formatter.ts");
		expect(src).not.toMatch(/Carta de crédito: \$\{formatBRL\(creditValue\)\}/);
	});
});

describe("FIX-2 — resumo oficial mantém o termo técnico COM aposto explicativo", () => {
	it("contract-summary: 'Carta de crédito (valor do bem)'", () => {
		const src = readSource("src/lib/bevi/contract-summary.ts");
		expect(src).toMatch(/Carta de crédito \(valor do bem\)/);
	});
});

describe("FIX-2 — system prompt orienta vocabulário amigável", () => {
	it("usa 'valor do bem' (nunca 'carta de crédito') no vocabulário com o usuário", () => {
		// DESAMARRA (2026-07-13): o assert exigia a frase canônica literal ("Quer
		// ajustar o valor do bem?"). O invariante do FIX-2 nunca foi a FRASE — é o
		// VOCABULÁRIO: falar "valor do bem" com o usuário, não o jargão "carta de
		// crédito". A frase agora é do modelo; o vocabulário continua sendo regra.
		const src = readSource("src/lib/agent/system-prompt.ts");
		expect(src).toMatch(/valor do bem/i);
		expect(src).not.toMatch(/Quer ajustar a carta de credito\?/);
	});

	it("prompt tem regra de vocabulário: 'valor do bem' com o usuário", () => {
		const src = readSource("src/lib/agent/system-prompt.ts").toLowerCase();
		expect(src).toMatch(/valor do bem/);
	});
});

describe("FIX-2 — o que NÃO muda (guard-rails)", () => {
	// A copy determinística que EXPLICAVA o lance embutido (`lanceEmbutidoEdu`)
	// foi removida em 2026-07-21: ela ensinava o conselho ERRADO (usar uma fatia
	// da carta já escolhida, quando o certo é mirar uma carta MAIOR) e, no
	// WhatsApp, saía no lugar da fala do modelo. Explicação é conversa — é do
	// modelo, com os números que o código apura. O gate hoje só faz a pergunta.
	it("gate lance-embutido faz a PERGUNTA, sem carregar a explicação enlatada", () => {
		const q = (gateQuestion("lance-embutido") ?? "").toLowerCase();
		expect(q.length).toBeGreaterThan(0);
		expect(q).not.toMatch(/uma fatia|parte desse valor/);
	});

	it("identificadores internos continuam creditValue/creditMin/creditMax", () => {
		const types = readSource("src/lib/chat/types.ts");
		expect(types).toMatch(/creditValue/);
		const adapter = readSource("src/lib/web/adapter.ts");
		expect(adapter).toMatch(/id: "credit"/);
	});
});
