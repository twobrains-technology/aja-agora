import { describe, expect, it } from "vitest";
import { avaliarConversa, placar, type TurnoDeConversa } from "./golden";

const AVISO =
	"Para gerar a sua proposta, a administradora consulta seu CPF nos birôs de crédito e usa seus dados só para isso, conforme a LGPD. Posso seguir?";

describe("o jogo de regra do conduta, rodado na transcription", () => {
	it("conversa limpa não acha nada", () => {
		const turnos: TurnoDeConversa[] = [
			{ role: "user", content: "Quero um carro de 60 mil.", cards: [] },
			{
				role: "assistant",
				content: "Para quando você está pensando nessa troca?",
				cards: ["quick_reply"],
			},
			{ role: "user", content: "Agora.", cards: [] },
			{ role: "assistant", content: AVISO, cards: [] },
			{ role: "user", content: "pode usar", cards: [] },
			{ role: "assistant", content: "Combinado. Qual o seu nome?", cards: [] },
		];
		expect(avaliarConversa(turnos)).toEqual([]);
	});

	it("pergunta repetida em dois turnos", () => {
		const turnos: TurnoDeConversa[] = [
			{ role: "assistant", content: "Para quando você está pensando?", cards: ["quick_reply"] },
			{ role: "user", content: "agora", cards: [] },
			{ role: "assistant", content: "Para quando você está pensando?", cards: ["quick_reply"] },
		];
		const achados = avaliarConversa(turnos);
		expect(achados.some((a) => a.regra === "pergunta-repetida")).toBe(true);
	});

	it("pergunta fechada sem chip", () => {
		const achados = avaliarConversa([
			{ role: "assistant", content: "Você prefere parcela menor ou prazo mais curto?", cards: [] },
		]);
		expect(achados.some((a) => a.regra === "pergunta-fechada-sem-chip")).toBe(true);
	});

	it("pergunta fechada com card clicável na tela é resposta possível, não lista escrita", () => {
		const comTabela = avaliarConversa([
			{
				role: "assistant",
				content:
					"Qual dessas faz mais sentido pra você: parcela menor por mais tempo, ou prazo mais curto mesmo que a parcela suba?",
				cards: ["comparison_table"],
			},
		]);
		expect(comTabela.filter((a) => a.regra === "pergunta-fechada-sem-chip")).toEqual([]);

		const soTexto = avaliarConversa([
			{
				role: "assistant",
				content:
					"Qual dessas faz mais sentido pra você: parcela menor por mais tempo, ou prazo mais curto mesmo que a parcela suba?",
				cards: [],
			},
		]);
		expect(soTexto.some((a) => a.regra === "pergunta-fechada-sem-chip")).toBe(true);
	});

	it("dado pedido antes do aviso", () => {
		const achados = avaliarConversa([
			{ role: "assistant", content: "Me passa seu CPF?", cards: [] },
			{ role: "user", content: "111.444.777-35", cards: [] },
			{ role: "assistant", content: AVISO, cards: [] },
		]);
		expect(achados.filter((a) => a.regra === "dado-sem-aviso")).toHaveLength(1);
	});

	it("número que o cliente nunca disse e nenhum card sustenta", () => {
		const achados = avaliarConversa([
			{ role: "user", content: "quero um carro", cards: [] },
			{ role: "assistant", content: "A carta da Canopus sai por R$ 890 de parcela.", cards: [] },
		]);
		expect(achados.some((a) => a.regra === "contexto-nao-dito")).toBe(true);
		// O mesmo número vindo de um card de FATO é dado real, não invenção.
		const comCard = avaliarConversa([
			{ role: "assistant", content: "Aí está a carta da Canopus.", cards: ["group_card"] },
		]);
		expect(comCard.some((a) => a.regra === "contexto-nao-dito")).toBe(false);
	});

	it("número que um card já mostrou é dado real, não invenção", () => {
		const mostrada = avaliarConversa([
			{ role: "user", content: "quero um carro", cards: [] },
			{
				role: "assistant",
				content: "Achei as cartas, a menor parcela é 787,64.",
				cards: ["comparison_table"],
				valores: ["787.64"],
			},
			{ role: "user", content: "quero a da canopus", cards: [] },
			{ role: "assistant", content: "A Canopus fica em R$ 787.", cards: [], valores: [] },
		]);
		expect(mostrada.filter((a) => a.regra === "contexto-nao-dito")).toEqual([]);

		const inventada = avaliarConversa([
			{ role: "user", content: "quero um carro", cards: [] },
			{
				role: "assistant",
				content: "Achei as cartas.",
				cards: ["comparison_table"],
				valores: ["787.64"],
			},
			{ role: "user", content: "quero a da canopus", cards: [] },
			{ role: "assistant", content: "A Canopus fica em R$ 890.", cards: [], valores: [] },
		]);
		expect(inventada.some((a) => a.regra === "contexto-nao-dito")).toBe(true);
	});

	it("card relistado em texto", () => {
		const achados = avaliarConversa([
			{
				role: "assistant",
				content: "As opções:\n1) Canopus R$ 784\n2) Bresser R$ 700\n3) Âncora R$ 733",
				cards: ["comparison_table"],
			},
		]);
		expect(achados.some((a) => a.regra === "card-relistado")).toBe(true);
	});

	it("o placar soma por regra", () => {
		const p = placar([
			{ regra: "pergunta-repetida", turno: 1, evidencia: "x" },
			{ regra: "pergunta-repetida", turno: 3, evidencia: "y" },
			{ regra: "dado-sem-aviso", turno: 2, evidencia: "z" },
		]);
		expect(p["pergunta-repetida"]).toBe(2);
		expect(p["dado-sem-aviso"]).toBe(1);
	});
});
