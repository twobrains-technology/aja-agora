// FIX-401 — a resolução por CRITÉRIO não pode ignorar uma recusa.
//
// 6ª revisão independente, reproduzido em unidade pura e no grafo real:
//
//   resolveOfertaPorCriterio(ofertas, "de jeito nenhum quero essa carta maior")
//     → devolve A CARTA MAIOR
//   resolveOfertaPorCriterio(ofertas, "não quero a carta maior, prefiro a menor")
//     → devolve A CARTA MAIOR
//
// A função casa "carta maior" em qualquer lugar da frase e ignora tudo em volta.
// `resolveAdministradoraMention`, na mesma arquivo, JÁ trata negação
// (`extractNegatedAdministradoras`) — o caminho por critério nunca ganhou o
// mesmo cuidado.
//
// Por que isso importa depois do FIX-400: aquele fix removeu as origens
// `afirmacao` e `criterio` do `advance.ts`, mas `resolveOfertaPorCriterio`
// continua alcançável DENTRO de `origem: "mencao"` — que é o caminho que o
// FIX-400 manteve por ser "verificável". Verificável ele é; imune a negação,
// não era. É a mesma classe de bug das cinco rodadas anteriores, só renomeada.
//
// A regra: a mesma assimetria de sempre. Na dúvida, não ancora — o funil
// pergunta de novo. Errar pra menos custa uma pergunta; errar pra mais
// compromete o cliente com uma cota que ele acabou de recusar.
import { describe, expect, it } from "vitest";
import { resolveOfertaPorCriterio } from "./choose-offer";

type Oferta = Parameters<typeof resolveOfertaPorCriterio>[0][number];

const OFERTAS = [
	{
		groupId: "maior",
		administradora: "ITAÚ",
		creditValue: 721_000,
		monthlyPayment: 4_430,
		termMonths: 221,
	},
	{
		groupId: "menor",
		administradora: "BANCO DO BRASIL",
		creditValue: 128_100,
		monthlyPayment: 2_178,
		termMonths: 100,
	},
] as unknown as Oferta[];

describe("FIX-401 — critério respeita negação", () => {
	it.each([
		"de jeito nenhum quero essa carta maior",
		"não quero a carta maior, prefiro a menor mesmo",
		"nem pensar na carta maior",
		"a carta maior não serve pra mim",
		"não é a menor parcela que eu quero",
	])("recusa não resolve pro critério recusado: %s", (fala) => {
		expect(resolveOfertaPorCriterio(OFERTAS, fala)).toBeNull();
	});

	it("pedido afirmativo continua resolvendo (o fix não pode matar o caminho bom)", () => {
		expect(resolveOfertaPorCriterio(OFERTAS, "quero a carta maior")?.groupId).toBe("maior");
		expect(resolveOfertaPorCriterio(OFERTAS, "prefiro a menor parcela")?.groupId).toBe("menor");
		expect(resolveOfertaPorCriterio(OFERTAS, "me mostra a de maior prazo")?.groupId).toBe("maior");
	});

	it("frase sem critério nenhum segue devolvendo null", () => {
		expect(resolveOfertaPorCriterio(OFERTAS, "e aí, como funciona?")).toBeNull();
		expect(resolveOfertaPorCriterio(OFERTAS, "")).toBeNull();
	});
});
