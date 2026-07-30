// FIX-402 — a resolução por NOME da administradora também respeita recusa.
//
// 7ª revisão independente. O FIX-401 blindou `resolveOfertaPorCriterio` contra
// negação e não tocou em `extractNegatedAdministradoras` — que é o caminho de
// NOME, tentado ANTES do critério (`resolveAdministradoraMentionForConversation`).
// Como o nome resolve primeiro, o critério (já corrigido) nunca era alcançado
// nestes casos: a correção anterior ficou irrelevante para eles.
//
// `NEGATION_TRIGGER` era uma lista literal fechada:
//   /\b(PRA LA|DE LADO|ESQUECE|ESQUECA|CANCELA|CANCELE|NAO QUERO)\b/
//
// Reproduzido em unidade pura: seis formas naturais de recusar uma marca
// ancoravam justamente ela.
//
// É a mesma classe das seis rodadas anteriores — inferência textual
// comprometendo dinheiro — agora pelo caminho que o FIX-400/401 declarou
// "verificável e seguro". Verificável ele é (lookup contra ofertas exibidas);
// imune a negação, não era.
//
// ⚠️ O que este fix NÃO faz: transformar a lista de negação numa caçada a
// sinônimos. Reusa `detectYesNoText`, que já lê recusa, adversativa e
// condicional, e é a mesma peça que o FIX-401 usou no critério — uma fonte de
// verdade para "isto é uma negativa", não duas.
import { describe, expect, it } from "vitest";
import { resolveAdministradoraMention } from "./choose-offer";

type Oferta = Parameters<typeof resolveAdministradoraMention>[0][number];

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

describe("FIX-402 — menção por nome respeita recusa", () => {
	it.each([
		"de jeito nenhum quero a Itaú",
		"nem pensar em ficar com a Itaú",
		"jamais escolheria a Itaú",
		"não gostei da Itaú",
		"a Itaú não me atende",
		"de forma alguma vou com a Itaú",
		"nunca ficaria com a Itaú",
	])("recusa não ancora a marca recusada: %s", (fala) => {
		expect(resolveAdministradoraMention(OFERTAS, fala)).toBeNull();
	});

	it("os gatilhos originais continuam funcionando (FIX-252 não regride)", () => {
		expect(resolveAdministradoraMention(OFERTAS, "esquece a Itaú")).toBeNull();
		expect(resolveAdministradoraMention(OFERTAS, "deixa a Itaú pra lá")).toBeNull();
		expect(resolveAdministradoraMention(OFERTAS, "cancela a Itaú")).toBeNull();
	});

	it("pedido afirmativo continua resolvendo — o fix não pode matar a venda", () => {
		expect(resolveAdministradoraMention(OFERTAS, "quero a Itaú")?.administradora).toBe("ITAÚ");
		expect(resolveAdministradoraMention(OFERTAS, "bora fechar com a Canopus")?.administradora).toBe(
			"CANOPUS",
		);
		// FIX-252: "deixa" sem gatilho de negação é afirmativo.
		expect(
			resolveAdministradoraMention(OFERTAS, "deixa a Itaú que você recomendou")?.administradora,
		).toBe("ITAÚ");
	});

	it("recusa numa cláusula + pedido na outra resolve o PEDIDO (melhorou)", () => {
		// Antes deste fix isto devolvia `null`: as duas marcas apareciam na mesma
		// cláusula (a vírgula não separava) e a regra "duas marcas = não crava"
		// vencia — o cliente dizia o que queria e o funil perguntava de novo.
		//
		// Com a vírgula no split, a negativa fica contida na cláusula dela: a Itaú
		// entra em `negated` e só a Canopus sobrevive. Não é efeito colateral
		// acidental — é a mesma regra ficando mais precisa, e o caso é exatamente o
		// que a 7ª revisão citou como o mais grave ("não gostei da Itaú, quero a
		// Canopus" no WhatsApp fechava a Itaú em nome do cliente).
		expect(
			resolveAdministradoraMention(OFERTAS, "não gostei da Itaú, quero a Canopus")?.administradora,
		).toBe("CANOPUS");
	});

	it("duas marcas SEM negação seguem sem cravar (comparação não é escolha)", () => {
		// A regra pré-existente que continua valendo: citar duas marcas sem recusar
		// nenhuma é pergunta, não decisão.
		expect(resolveAdministradoraMention(OFERTAS, "entre a Itaú e a Canopus")).toBeNull();
		expect(resolveAdministradoraMention(OFERTAS, "qual é melhor, Itaú ou Canopus?")).toBeNull();
	});
});
