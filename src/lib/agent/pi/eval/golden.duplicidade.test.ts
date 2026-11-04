import { describe, expect, it } from "vitest";
import { avaliarConversa, respondeuSlot, slotsPedidos, type TurnoDeConversa } from "./golden";

const so = (achados: ReturnType<typeof avaliarConversa>, regra: string) =>
	achados.filter((a) => a.regra === regra);

describe("duplicidade de conteúdo — pedido-repetido por slot (D-01)", () => {
	// O caso medido: a pessoa já disse a parcela e o agente pede a MESMA parcela quatro vezes,
	// com fraseado diferente. O medidor por string (regra `pergunta-repetida`) não vê nada aqui.
	const conversa: TurnoDeConversa[] = [
		{ role: "user", content: "quero um carro de 60 mil, parcela até 800", cards: [] },
		{
			role: "assistant",
			content:
				"Boa, carro é o que mais fecha. Antes de eu puxar as cartas: qual parcela cabe no seu mês?",
			cards: [],
		},
		{ role: "user", content: "800", cards: [] },
		{ role: "assistant", content: "Qual parcela fica boa pra você?", cards: [] },
		{ role: "user", content: "800", cards: [] },
		{ role: "assistant", content: "E de parcela, quanto você aguenta?", cards: [] },
		{ role: "user", content: "uns 800 mesmo", cards: [] },
		{ role: "assistant", content: "Me diz a parcela que cabe no seu bolso.", cards: [] },
		{ role: "user", content: "já falei, 800", cards: [] },
		{ role: "assistant", content: "Pra fechar: qual valor de parcela você quer?", cards: [] },
	];

	it("pede a parcela cinco vezes, com resposta entre os pedidos: quatro achados, todos de parcela", () => {
		const achados = so(avaliarConversa(conversa), "pedido-repetido");
		expect(achados).toHaveLength(4);
		for (const a of achados) expect(a.evidencia.startsWith("parcela: ")).toBe(true);
	});

	it("pede a parcela uma vez e segue: nenhum achado", () => {
		const semDefeito: TurnoDeConversa[] = [
			{ role: "user", content: "quero um carro de 60 mil, parcela até 800", cards: [] },
			{ role: "assistant", content: "Boa. Qual parcela cabe no seu mês?", cards: [] },
			{ role: "user", content: "800", cards: [] },
			{
				role: "assistant",
				content: "Achei as cartas que caem nesse orçamento.",
				cards: ["comparison_table"],
				valores: ["60000", "800"],
			},
		];
		expect(so(avaliarConversa(semDefeito), "pedido-repetido")).toEqual([]);
	});

	it("pedir de novo sem o cliente ter respondido não é o defeito: insistir é outra conversa", () => {
		const insistiu: TurnoDeConversa[] = [
			{ role: "assistant", content: "Qual parcela cabe no seu mês?", cards: [] },
			{ role: "user", content: "deixa eu ver", cards: [] },
			{ role: "assistant", content: "Me diz a parcela que fica boa pra você.", cards: [] },
		];
		expect(so(avaliarConversa(insistiu), "pedido-repetido")).toEqual([]);
	});

	it("o slot é lido do que o balão pede, não do texto do cliente", () => {
		expect(slotsPedidos("quero um carro de 60 mil")).toEqual([]);
		expect(slotsPedidos("Qual o seu nome?")).toContain("nome");
		expect(respondeuSlot("parcela", "800")).toBe(true);
		expect(respondeuSlot("parcela", "deixa eu ver")).toBe(false);
	});
});

describe("duplicidade de conteúdo — dado-repetido (D-02 e D-03)", () => {
	it("o mesmo número no texto e no card do MESMO turno", () => {
		const achados = avaliarConversa([
			{
				role: "assistant",
				content: "A parcela fica em R$ 733 por mês.",
				cards: ["group_card"],
				valores: ["733"],
			},
		]);
		const repetidos = so(achados, "dado-repetido");
		expect(repetidos).toHaveLength(1);
		expect(repetidos[0].evidencia).toBe("texto×card: 733");
	});

	it("o mesmo número em dois turnos do agente", () => {
		const achados = avaliarConversa([
			{ role: "assistant", content: "A carta sai por 733 reais.", cards: [] },
			{ role: "user", content: "entendi", cards: [] },
			{ role: "assistant", content: "Lembrando: 733 reais por mês.", cards: [] },
		]);
		const repetidos = so(achados, "dado-repetido");
		expect(repetidos).toHaveLength(1);
		expect(repetidos[0].turno).toBe(2);
		expect(repetidos[0].evidencia).toBe("dois turnos: 733");
	});

	it("número pequeno (id, data, '3 meses') não é dado de conversa", () => {
		const achados = avaliarConversa([
			{ role: "assistant", content: "Em 3 meses o grupo fecha.", cards: [] },
			{ role: "user", content: "ok", cards: [] },
			{ role: "assistant", content: "Em 3 meses, como eu disse.", cards: [] },
		]);
		expect(so(achados, "dado-repetido")).toEqual([]);
	});
});
