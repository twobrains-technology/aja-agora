import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type CardGerado, garantirChip, opcoesDePerguntaFechada } from "./chips";

/** Os toques do card — `quick_reply` é o único que carrega rótulos (o `value_picker` é slider). */
const toques = (chip: CardGerado | null) =>
	chip?.type === "quick_reply" ? chip.payload.options : [];
const rotulos = (chip: CardGerado | null) => toques(chip).map((o) => o.label);

describe("pergunta fechada vira chip, não lista escrita no texto", () => {
	it("lista no texto: as opções viram botão e o balão guarda só a pergunta", () => {
		const r = garantirChip({
			texto: "Para quando você está pensando nessa troca?\n1) Agora\n2) Nos próximos meses",
			cardsDoTurno: [],
		});
		expect(r.chip).not.toBeNull();
		expect(rotulos(r.chip)).toEqual(["Agora", "Nos próximos meses"]);
		expect(r.texto).toBe("Para quando você está pensando nessa troca?");
	});

	it("alternativa escrita na frase também vira chip", () => {
		const r = garantirChip({
			texto: "Você prefere parcela menor ou prazo mais curto?",
			cardsDoTurno: [],
		});
		expect(rotulos(r.chip)).toHaveLength(2);
		expect(rotulos(r.chip)[0]).toBe("parcela menor");
	});

	it("a vírgula antes do «ou» não cega o detector (forma real medida no dev)", () => {
		const texto =
			"Qual dessas faz mais sentido pra você: parcela menor por mais tempo, ou prazo mais curto mesmo que a parcela suba?";
		const r = garantirChip({ texto, cardsDoTurno: [] });
		expect(rotulos(r.chip)).toHaveLength(2);
		expect(rotulos(r.chip)[0]).toBe("parcela menor por mais tempo");
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
		expect(rotulos(r.chip)).toEqual(["Tem mais alguma dúvida", "quer seguir em frente"]);

		const comParentese = garantirChip({
			texto:
				"A contemplação (quando você recebe o dinheiro) vem por sorteio. Tem dúvida, ou quer seguir?",
			cardsDoTurno: [],
		});
		expect(rotulos(comParentese.chip)).toEqual(["Tem dúvida", "quer seguir"]);
	});

	it("parêntese dentro da pergunta não entra no botão", () => {
		const r = garantirChip({
			texto: "Prefere o lance (que entra com dinheiro agora) ou a sorteio?",
			cardsDoTurno: [],
		});
		expect(rotulos(r.chip)).toEqual(["Prefere o lance", "a sorteio"]);
	});

	it("prosa curta com pergunta no fim NÃO vira menu do texto — o balão fica inteiro (N05/L33)", () => {
		// Duas linhas curtas são FRASES, não opções: sem marcador de lista, nada é
		// extraído do texto. Desde a ordem do dono de 27/10 (13:50) o turno AINDA
		// oferece toque, mas ele vem do MOMENTO (`sugestoes.ts`), não do texto — o que
		// este teste protege é que a fala não é picada em botões.
		const texto =
			"Claro, Marcos!\nVou te explicar como funciona a contemplação\nFaz sentido pra você?";
		const r = garantirChip({ texto, cardsDoTurno: [] });
		expect(r.texto).toBe(texto);
		expect(opcoesDePerguntaFechada("Claro!\nFaz sentido pra você?")).toEqual([]);
		// Inversão de critério (ordem do dono, 27/10 17:15): pergunta de sim/não agora
		// responde sim/não casado com o verbo do pedido — antes eram os toques de tema.
		expect(rotulos(r.chip)).toEqual(["Sim, pode", "Agora não"]);
	});

	it("a lista marcada sai do balão, o resto da fala fica (N05)", () => {
		const r = garantirChip({
			texto: "Ótimo, Marcos!\nPara quando você está pensando?\n1) Agora\n2) Nos próximos meses",
			cardsDoTurno: [],
		});
		expect(rotulos(r.chip)).toEqual(["Agora", "Nos próximos meses"]);
		// O texto guarda a FALA; a lista virou botão.
		expect(r.texto).toBe("Ótimo, Marcos!\nPara quando você está pensando?");
	});

	it("cada opção nasce com replyId — é por ele que o clique é consumido (L26)", () => {
		const r = garantirChip({
			texto: "Para quando?\n- Agora\n- Nos próximos meses",
			cardsDoTurno: [],
		});
		const ids = toques(r.chip).map((o) => o.replyId);
		expect(ids).toHaveLength(2);
		for (const id of ids) expect(id).toMatch(/^[0-9a-f-]{36}$/);
		// Um id por opção: dois botões nunca disputam a mesma chave de consumo.
		expect(new Set(ids).size).toBe(2);
	});

	it("pergunta aberta não vira chip DO TEXTO, mas o turno ainda oferece toque", () => {
		// Inversão de critério registrada em `.orientacao/diario.md` (t13): a ordem do dono
		// de 27/10 13:50 é que todo turno que espera resposta tenha opções de um toque. O
		// texto continua não sendo picado — o chip vem do momento.
		const r = garantirChip({
			texto: "Como você está vendo isso hoje?",
			cardsDoTurno: [],
		});
		expect(r.texto).toBe("Como você está vendo isso hoje?");
		expect(opcoesDePerguntaFechada("Como você está vendo isso hoje?")).toEqual([]);
		expect(rotulos(r.chip)).toEqual(["Pode seguir", "Tenho uma dúvida"]);
	});

	it("teto de 4 opções e rótulo curto", () => {
		const r = garantirChip({
			texto: "Qual destas?\n1) a\n2) b\n3) c\n4) d\n5) e",
			cardsDoTurno: [],
		});
		expect(rotulos(r.chip)).toHaveLength(4);
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
