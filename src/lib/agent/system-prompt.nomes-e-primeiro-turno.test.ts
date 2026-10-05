// P1 + A1 — a regra de fala que chega ao modelo, e nenhum nome próprio copiável.
//
// Duas coisas que o teste prova, as duas sobre o texto que o modelo de fato
// recebe (`leanSystemPrompt`, o artefato que sobrevive ao recorte do "## Fluxo
// de Vendas"):
//
//   1. a regra do primeiro turno deixou de mandar perguntar o modelo antes do
//      valor — o valor é o que faz a comparação aparecer;
//   2. nenhum exemplo de nome do CLIENTE é copiável. "Ana" era o nome de exemplo
//      da tool `save_contact_name`, e o modelo o entregou como se fosse o dado
//      ("Bruna" virou "Ana", conversa `9b09c3c7`, 05/10). Aqui o marcador é
//      `<nome>`, que não pode ser confundido com o que o cliente disse.
import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT, SPECIALIST_BASE_PROMPT } from "@/lib/agent/system-prompt";
import { leanSystemPrompt } from "@/lib/agent/langgraph/nodes/converse";

describe("primeiro turno — a regra leva ao que está na tela, não interroga antes", () => {
	it("a regra nova sobrevive ao recorte e aponta para o card do valor", () => {
		const lean = leanSystemPrompt(SYSTEM_PROMPT);
		expect(lean).toContain("leve ao que está na tela");
		expect(lean).toContain("VALOR do bem");
	});

	it("a ordem antiga de perguntar o modelo antes do valor saiu do prompt", () => {
		const lean = leanSystemPrompt(SYSTEM_PROMPT);
		expect(lean).not.toContain("Entre no assunto DELE antes de falar de dinheiro");
		expect(SYSTEM_PROMPT).not.toContain("modelo em mente");
	});
});

describe("nenhum nome próprio de exemplo copiável", () => {
	it("o SYSTEM_PROMPT não usa nomes de cliente como dado", () => {
		expect(SYSTEM_PROMPT).not.toMatch(/me chamo (Ana|Paulo|Carlos|Monique|Kairo|Alan)/);
		expect(SYSTEM_PROMPT).not.toMatch(/Oi, (Ana|Paulo|Carlos|Monique|Kairo|Alan)!/);
		expect(SYSTEM_PROMPT).toContain("<nome>");
	});

	it("as regras de nome do especialista usam o marcador neutro", () => {
		expect(SPECIALIST_BASE_PROMPT).not.toMatch(
			/Sou Kairo|Me chamo Alan|Prazer, Kairo|User: "(Paulo|Kairo|Monique|Carlos)"/,
		);
		expect(SPECIALIST_BASE_PROMPT).toContain("<nome>");
	});
});