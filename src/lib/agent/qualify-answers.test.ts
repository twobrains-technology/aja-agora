// Os invariantes de `qualifyAnswers` — o dado que vai para a Bevi.
//
// Produção, conversa `fa0533a0-…` (13/08/2026, WhatsApp): o cliente trocou de
// casa para moto e o estado terminou assim —
//
//     { creditMin: 18000, creditMax: 6424, desiredItem: "uma casa",
//       creditMentionedAtDesire: 1500000 }   // currentCategory: "moto"
//
// Dois defeitos, ambos de ESTADO (dossiê de 14/08, ponto 2):
//
//   1. a troca de categoria não invalidou nada — e o R$ 1,5 milhão da casa não
//      ficou de enfeite: voltou como pergunta enlatada ("Uns R$ 1.500.000
//      então, é isso?") e como promoção do escape de gate preso, numa conversa
//      sobre uma moto de R$ 20 mil;
//   2. os reverts mexem só no `creditMax` enquanto quem escreve grava o PAR
//      (`creditMin = creditMax × 0,9`) — o piso fica órfão. Na conversa o
//      `creditMin` valeu 18000 → 8208 → 180000 → 5782 → 1.350.000 → 18000, e o
//      par final ficou invertido.
//
// Faixa invertida não é questão de estilo: ela vai para `searchGroups`, que
// exige `creditMax`/`creditMin` > 0, e uma busca com piso acima do teto não tem
// resposta possível — a Bevi devolve vazio, o `bevi-offer-guard` descarta o que
// vier, e o agente fica sem oferta nenhuma para mostrar (é o sintoma da OC-35,
// "cotas indisponíveis").
//
// Por que um módulo só: hoje há CINCO escritores de faixa espalhados por três
// arquivos. A classe do defeito é a dispersão, não cada escrita — por isso o
// invariante mora aqui, e os write-sites passam por aqui.
import { describe, expect, it } from "vitest";
import type { QualifyAnswers } from "@/lib/agent/personas";
import {
	aplicarFaixaDeCredito,
	aplicarTrocaDeCategoria,
	faixaIncoerente,
	invalidarPorTrocaDeCategoria,
	reverterFaixaDeCredito,
} from "./qualify-answers";

describe("aplicarFaixaDeCredito — o par nunca sai invertido", () => {
	it("grava o par quando só o teto é informado", () => {
		const q = aplicarFaixaDeCredito({}, { creditMax: 20_000 });
		expect(q.creditMax).toBe(20_000);
		expect(q.creditMin).toBe(18_000); // 90% do teto, como sempre foi
	});

	it("teto novo MENOR não deixa o piso antigo para trás (o caso da conversa)", () => {
		// Estado depois de "200" ter virado R$ 200 mil.
		const antes: QualifyAnswers = { creditMax: 200_000, creditMin: 180_000 };
		// A correção: "200 reais a parcela nao 200 mill" → volta para R$ 20 mil.
		const depois = aplicarFaixaDeCredito(antes, { creditMax: 20_000 });

		expect(depois.creditMax).toBe(20_000);
		expect(depois.creditMin).toBeLessThanOrEqual(20_000);
		expect(faixaIncoerente(depois)).toBe(false);
	});

	it("piso explícito acima do teto é rebaixado, nunca gravado como está", () => {
		const q = aplicarFaixaDeCredito({}, { creditMax: 20_000, creditMin: 180_000 });
		expect(q.creditMin ?? 0).toBeLessThanOrEqual(q.creditMax ?? 0);
	});

	it("a sequência real da conversa nunca produz par invertido", () => {
		// Os valores que o `creditMax` de fato assumiu em `fa0533a0-…`.
		let q: QualifyAnswers = {};
		for (const teto of [1_500_000, 20_000, 200_000, 9_120, 6_424, 20_000]) {
			q = aplicarFaixaDeCredito(q, { creditMax: teto });
			expect(faixaIncoerente(q), `invertida ao aplicar ${teto}: ${JSON.stringify(q)}`).toBe(false);
		}
		expect(q.creditMax).toBe(20_000);
	});

	it("não inventa faixa quando não há teto nenhum", () => {
		const q = aplicarFaixaDeCredito({ prazoMeses: 60 }, {});
		expect(q.creditMax).toBeUndefined();
		expect(q.creditMin).toBeUndefined();
		expect(q.prazoMeses).toBe(60); // o resto do estado passa intacto
	});
});

describe("reverterFaixaDeCredito — revert é do PAR", () => {
	it("volta piso e teto juntos", () => {
		const anterior: QualifyAnswers = { creditMax: 20_000, creditMin: 18_000 };
		const atual: QualifyAnswers = { ...anterior, creditMax: 200_000, creditMin: 180_000 };

		const revertido = reverterFaixaDeCredito(atual, anterior);
		expect(revertido.creditMax).toBe(20_000);
		expect(revertido.creditMin).toBe(18_000);
		expect(faixaIncoerente(revertido)).toBe(false);
	});

	it("reverter para um estado sem faixa limpa os dois", () => {
		const atual: QualifyAnswers = { creditMax: 200_000, creditMin: 180_000, prazoMeses: 60 };
		const revertido = reverterFaixaDeCredito(atual, {});

		expect(revertido.creditMax).toBeUndefined();
		expect(revertido.creditMin).toBeUndefined();
		expect(revertido.prazoMeses).toBe(60); // só a faixa é revertida
	});
});

describe("invalidarPorTrocaDeCategoria — o bem antigo morre, a pessoa fica", () => {
	const casa: QualifyAnswers = {
		creditMax: 1_500_000,
		creditMin: 1_350_000,
		creditMentionedAtDesire: 1_500_000,
		creditClampedFrom: 1_600_000,
		valorDoBemAlvo: 1_500_000,
		desiredItem: "uma casa",
		// Estes são da PESSOA, não do bem — sobrevivem à troca.
		prazoMeses: 120,
		hasLance: "no",
		lanceValue: 5_000,
		monthlySavings: 800,
		fgtsValue: 30_000,
		motivation: "sair do aluguel",
	};

	it("apaga o que era do bem anterior", () => {
		const moto = invalidarPorTrocaDeCategoria(casa);

		expect(moto.creditMax).toBeUndefined();
		expect(moto.creditMin).toBeUndefined();
		expect(moto.creditMentionedAtDesire).toBeUndefined();
		expect(moto.creditClampedFrom).toBeUndefined();
		expect(moto.valorDoBemAlvo).toBeUndefined();
		expect(moto.desiredItem).toBeUndefined();
	});

	it("preserva o que é da pessoa", () => {
		const moto = invalidarPorTrocaDeCategoria(casa);

		expect(moto.prazoMeses).toBe(120);
		expect(moto.hasLance).toBe("no");
		expect(moto.lanceValue).toBe(5_000);
		expect(moto.monthlySavings).toBe(800);
		expect(moto.fgtsValue).toBe(30_000);
		expect(moto.motivation).toBe("sair do aluguel");
	});

	it("o R$ 1,5 milhão da casa não pode voltar como pergunta na conversa da moto", () => {
		// `gate-questions.ts` e o escape de gate preso leem `creditMentionedAtDesire`.
		// Enquanto ele sobreviver à troca, o valor da casa reaparece — foi o que
		// produziu "Uns R$ 1.500.000 então, é isso?" numa moto de R$ 20 mil.
		const moto = invalidarPorTrocaDeCategoria(casa);
		expect(moto.creditMentionedAtDesire).toBeUndefined();
	});

	it("é idempotente e não quebra num estado vazio", () => {
		expect(invalidarPorTrocaDeCategoria({})).toEqual({});
	});
});

describe("aplicarTrocaDeCategoria — invalida o bem antigo sem perder o que foi dito AGORA", () => {
	const casa: QualifyAnswers = {
		creditMax: 1_500_000,
		creditMin: 1_350_000,
		creditMentionedAtDesire: 1_500_000,
		desiredItem: "uma casa",
		prazoMeses: 120,
	};

	it("troca sem valor no turno: o bem antigo some inteiro", () => {
		// "na verdade quero ver uma moto" — o turno não traz valor nenhum.
		const q = aplicarTrocaDeCategoria(casa, {}, "moto");

		expect(q.creditMax).toBeUndefined();
		expect(q.creditMentionedAtDesire).toBeUndefined();
		expect(q.desiredItem).toBeUndefined();
		expect(q.prazoMeses).toBe(120);
	});

	it("troca COM valor no mesmo turno: o valor novo sobrevive", () => {
		// "na verdade quero uma moto de 20 mil" — invalidar sem reaplicar apagaria
		// o valor que o cliente acabou de dizer, e o funil perguntaria de novo.
		const q = aplicarTrocaDeCategoria(casa, { creditMax: 20_000, desiredItem: "uma moto" }, "moto");

		expect(q.creditMax).toBe(20_000);
		expect(q.creditMin ?? 0).toBeLessThanOrEqual(20_000);
		expect(q.desiredItem).toBe("uma moto");
		expect(q.creditMentionedAtDesire).toBeUndefined(); // o da CASA não volta
		expect(faixaIncoerente(q)).toBe(false);
	});
});

describe("faixaIncoerente — o predicado que o sinal determinístico usa", () => {
	it("acusa o par exato que produção gravou", () => {
		expect(faixaIncoerente({ creditMin: 18_000, creditMax: 6_424 })).toBe(true);
	});

	it("par válido, faixa só com teto e estado sem faixa não acusam", () => {
		expect(faixaIncoerente({ creditMin: 18_000, creditMax: 20_000 })).toBe(false);
		expect(faixaIncoerente({ creditMax: 20_000 })).toBe(false);
		expect(faixaIncoerente({})).toBe(false);
	});

	it("piso igual ao teto é válido (faixa de um ponto só)", () => {
		expect(faixaIncoerente({ creditMin: 20_000, creditMax: 20_000 })).toBe(false);
	});
});
