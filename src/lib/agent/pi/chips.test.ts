import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { garantirChip, opcoesDePerguntaFechada } from "./chips";

describe("pergunta fechada vira chip, não lista escrita no texto", () => {
	it("lista no texto: as opções viram botão e o balão guarda só a pergunta", () => {
		const r = garantirChip({
			texto: "Para quando você está pensando nessa troca?\n1) Agora\n2) Nos próximos meses",
			cardsDoTurno: [],
		});
		expect(r.chip).not.toBeNull();
		expect(r.chip?.payload.options.map((o) => o.label)).toEqual(["Agora", "Nos próximos meses"]);
		expect(r.texto).toBe("Para quando você está pensando nessa troca?");
	});

	it("alternativa escrita na frase também vira chip", () => {
		const r = garantirChip({
			texto: "Você prefere parcela menor ou prazo mais curto?",
			cardsDoTurno: [],
		});
		expect(r.chip?.payload.options).toHaveLength(2);
		expect(r.chip?.payload.options[0]?.label).toBe("parcela menor");
	});

	it("a vírgula antes do «ou» não cega o detector (forma real medida no dev)", () => {
		const texto =
			"Qual dessas faz mais sentido pra você: parcela menor por mais tempo, ou prazo mais curto mesmo que a parcela suba?";
		const r = garantirChip({ texto, cardsDoTurno: [] });
		expect(r.chip?.payload.options).toHaveLength(2);
		expect(r.chip?.payload.options[0]?.label).toBe("parcela menor por mais tempo");
	});

	it("card de escolha já mostrado no turno: nada se duplica", () => {
		const r = garantirChip({
			texto: "Para quando você está pensando? 1) Agora 2) Depois",
			cardsDoTurno: [{ type: "quick_reply" }],
		});
		expect(r.chip).toBeNull();
	});

	it("a sentença afirmativa antes da pergunta não vira botão (medido no dev)", () => {
		const r = garantirChip({
			texto:
				"Tem mais alguma dúvida antes de a gente prosseguir com a proposta, ou quer seguir em frente?",
			cardsDoTurno: [],
		});
		expect(r.chip?.payload.options.map((o) => o.label)).toEqual([
			"Tem mais alguma dúvida",
			"quer seguir em frente",
		]);

		const comParentese = garantirChip({
			texto:
				"A contemplação (quando você recebe o dinheiro) vem por sorteio. Tem dúvida, ou quer seguir?",
			cardsDoTurno: [],
		});
		expect(comParentese.chip?.payload.options.map((o) => o.label)).toEqual([
			"Tem dúvida",
			"quer seguir",
		]);
	});

	it("pergunta aberta não vira chip", () => {
		const r = garantirChip({
			texto: "Como você está vendo isso hoje?",
			cardsDoTurno: [],
		});
		expect(r.chip).toBeNull();
		expect(opcoesDePerguntaFechada("Como você está vendo isso hoje?")).toEqual([]);
	});

	it("teto de 4 opções e rótulo curto", () => {
		const r = garantirChip({
			texto: "Qual destas?\n1) a\n2) b\n3) c\n4) d\n5) e",
			cardsDoTurno: [],
		});
		expect(r.chip?.payload.options).toHaveLength(4);
	});

	// O detector não vale de nada se o turno não aplicar: esta guarda fica vermelha
	// se `soltarTrecho` voltar a emitir só o texto.
	it("o turno aplica o chip em cada trecho", () => {
		const fonte = readFileSync(new URL("./turno-livre.ts", import.meta.url).pathname, "utf8");
		const corpo = fonte.slice(fonte.indexOf("const soltarTrecho"), fonte.indexOf("const executar"));
		expect(corpo).toContain("cardsDoTurno: ctx.cards");
		expect(corpo).toContain("ctx.cards.push(saida.chip");
	});
});
