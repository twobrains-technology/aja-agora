// FIX-403 — a CLASSE inteira: nenhum resolvedor de oferta ancora o que foi recusado.
//
// Sete revisões independentes acharam sete portas da mesma família, e o padrão do
// meu erro foi sempre o mesmo: fechar a porta apontada sem varrer as irmãs.
//   · FIX-400 fechou `advance.ts` e deixou o `proxy.ts` aberto
//   · FIX-401 fechou `resolveOfertaPorCriterio` e deixou `extractNegatedAdministradoras`
//   · FIX-402 fechou o casamento por NOME e deixou o casamento por VALOR/PARCELA/PRAZO
//
// Achei esta última eu mesmo, varrendo antes de pedir a 8ª revisão:
//   resolveOfferByMention(ofertas, "não quero a de 721 mil") → devolvia a de 721 mil
//
// Então este arquivo NÃO testa mais um caso. Testa o INVARIANTE sobre TODOS os
// resolvedores exportados de `choose-offer.ts`, com a mesma bateria de recusas.
// Resolvedor novo que apareça e não respeite recusa cai aqui — não depende de
// alguém lembrar de escrever o teste dele.
//
// A regra: quem recusa não compra. Na dúvida devolve `null`, o funil pergunta de
// novo. Errar pra menos custa uma pergunta; errar pra mais fecha uma cota que o
// cliente acabou de dispensar.
import { describe, expect, it } from "vitest";
import {
	resolveAdministradoraMention,
	resolveOfertaPorCriterio,
	resolveOfferByMention,
} from "./choose-offer";

type Oferta = Parameters<typeof resolveOfferByMention>[0][number];

const OFERTAS = [
	{
		groupId: "itau",
		administradora: "ITAÚ",
		creditValue: 721_000,
		monthlyPayment: 4_430,
		termMonths: 221,
	},
	{
		groupId: "canopus",
		administradora: "CANOPUS",
		creditValue: 128_100,
		monthlyPayment: 2_178,
		termMonths: 100,
	},
] as unknown as Oferta[];

/** Todo resolvedor que transforma TEXTO em oferta ancorada. Adicionar um novo
 * aqui é de graça; esquecer de adicionar é o bug que se repetiu sete vezes. */
const RESOLVEDORES = [
	{ nome: "resolveOfferByMention", fn: resolveOfferByMention },
	{ nome: "resolveAdministradoraMention", fn: resolveAdministradoraMention },
	{ nome: "resolveOfertaPorCriterio", fn: resolveOfertaPorCriterio },
] as const;

/** Recusas por NOME, por VALOR, por PARCELA, por PRAZO e por CRITÉRIO — as quatro
 * formas de apontar uma cota, cada uma negada de várias maneiras. */
const RECUSAS = [
	// por nome
	"de jeito nenhum quero a Itaú",
	"não gostei da Itaú",
	"nem pensar em ficar com a Itaú",
	// por valor
	"não quero a de 721 mil",
	"de jeito nenhum a de 721 mil",
	// por parcela
	"de jeito nenhum a de 4430 por mês",
	"não quero a de 4430 por mês",
	// por prazo
	"nem pensar na de 221 meses",
	"não quero a de 221 meses",
	// por critério
	"não quero a carta maior",
	"de jeito nenhum quero a de menor parcela",
];

describe("FIX-403 — invariante: nenhum resolvedor ancora oferta recusada", () => {
	for (const { nome, fn } of RESOLVEDORES) {
		it.each(RECUSAS)(`${nome} não ancora recusa: %s`, (fala) => {
			expect(fn(OFERTAS, fala)).toBeNull();
		});
	}

	// ── A outra metade: o fix não pode matar a venda ──
	it("pedidos afirmativos seguem resolvendo em cada resolvedor", () => {
		expect(resolveAdministradoraMention(OFERTAS, "quero a Itaú")?.groupId).toBe("itau");
		expect(resolveOfferByMention(OFERTAS, "quero a de 721 mil")?.groupId).toBe("itau");
		expect(resolveOfertaPorCriterio(OFERTAS, "quero a carta maior")?.groupId).toBe("itau");
		expect(resolveOfertaPorCriterio(OFERTAS, "prefiro a menor parcela")?.groupId).toBe("canopus");
	});

	it("recusar UMA e pedir OUTRA resolve a pedida", () => {
		expect(
			resolveAdministradoraMention(OFERTAS, "não gostei da Itaú, quero a Canopus")?.groupId,
		).toBe("canopus");
	});
});
