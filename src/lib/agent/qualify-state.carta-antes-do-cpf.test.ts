/**
 * A carta vem antes do CPF.
 *
 * Funil medido em produção entre 10 e 26/08/2026 (87 conversas, banco de prod):
 *
 *   87 conversas → 42 disseram o nome → 37 deram o valor → 30 deram o CPF →
 *   30 viram carta → 13 escolheram → 6 fecharam (4 deles teste interno).
 *
 * Cliente externo real: 70 conversas, 2 contratos. **2,9%.**
 *
 * Onde elas morrem: 49,4% antes de dizer o nome, com 1,3 turno de média. A
 * mediana até a primeira carta aparecer é de **5 perguntas**. E o Langfuse
 * (score `gate`, n=143) põe `name` (32,2%) + `identify` (26,6%) + `credit`
 * (21,7%) em 80,5% dos turnos travados — os três gates de COLETA, todos antes
 * de qualquer oferta.
 *
 * As falas, literais do banco:
 *
 *   👤 Quero um carro ate R$ 80 mil
 *   🤖 Antes de buscar as melhores opções pra você, preciso de uns detalhes.
 *      Já tem um modelo em mente?                                (conv 70a80fca)
 *
 *   👤 Me mostra as opções primeiro
 *   🤖 ...preciso saber qual valor você consegue pagar por mês.
 *   👤 2000
 *   🤖 Agora preciso do seu CPF e celular...                     (conv aebac770)
 *
 * O cliente disse o que queria e o valor que tinha. Recebeu perguntas.
 *
 * A ordem antiga não era um capricho: `ensureOffers` exige uma proposta Bevi, e
 * proposta exige um par CPF+celular. Com a vitrine (identidade DA CASA para
 * montar a prateleira), esse pré-requisito deixa de recair sobre o cliente — e
 * o `identify` desce para onde sempre pertenceu: o fecho, onde o documento é
 * trocado por um contrato.
 *
 * O que estes testes travam:
 *   1. quem tem alvo de busca chega ao `search` SEM ter dado CPF;
 *   2. `name` e `desire` não bloqueiam mais o caminho até a carta;
 *   3. o `identify` continua OBRIGATÓRIO antes de contratar — só mudou de lugar;
 *   4. sem vitrine configurada, o funil antigo volta inteiro.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ConversationMetadata } from "./personas";
import { nextGate } from "./qualify-state";

const ENV_ORIGINAL = { ...process.env };

beforeEach(() => {
	process.env.VITRINE_CPF = "11144477735";
	process.env.VITRINE_CELULAR = "62992496793";
});

afterEach(() => {
	process.env = { ...ENV_ORIGINAL };
});

/** O cliente da conv 70a80fca: abriu dizendo o bem e o valor, sem dar CPF. */
function abriuComValor(): ConversationMetadata {
	return {
		desireAsked: true,
		currentCategory: "auto",
		identityCollected: false,
		searchDispatched: false,
		revealCompleted: false,
		qualifyAnswers: { creditMax: 80_000, alvoDeBusca: "valor" },
	} as ConversationMetadata;
}

describe("nextGate — o caminho até a primeira carta", () => {
	it("manda BUSCAR quem já disse o valor, mesmo sem CPF", () => {
		expect(nextGate(abriuComValor(), { hasContactName: true })).toBe("search");
	});

	it("manda buscar quem só disse a parcela que cabe no bolso", () => {
		// conv aebac770: "Me mostra as opções primeiro" → "2000" → pedido de CPF.
		const meta = {
			...abriuComValor(),
			qualifyAnswers: { parcelaAlvo: 2_000, alvoDeBusca: "parcela" },
		} as ConversationMetadata;

		expect(nextGate(meta, { hasContactName: true })).toBe("search");
	});

	it("NÃO trava no nome: quem chegou com valor vê carta antes de se apresentar", () => {
		// 49,4% das conversas morrem aqui. O nome é bom para vender, não é
		// pré-requisito para mostrar preço — nenhuma vitrine de loja pede o nome
		// do cliente antes de deixar ele olhar a etiqueta.
		expect(nextGate(abriuComValor(), { hasContactName: false })).toBe("search");
	});

	it("ainda pede o valor de quem não disse nenhum — sem alvo não há o que buscar", () => {
		// Este é o único pré-requisito real que sobra: a Bevi simula por valor do
		// bem OU por parcela. Sem um dos dois não existe busca a fazer.
		const semAlvo = { ...abriuComValor(), qualifyAnswers: {} } as ConversationMetadata;

		expect(nextGate(semAlvo, { hasContactName: true })).toBe("credit");
	});

	it("ainda pergunta o nome de quem não trouxe alvo nenhum — a conversa começa igual", () => {
		const soAbriu = {
			currentCategory: "auto",
			qualifyAnswers: {},
		} as ConversationMetadata;

		expect(nextGate(soAbriu, { hasContactName: false })).toBe("name");
	});

	it("VALOR SEM CATEGORIA continua conduzindo — não cai no terminal mudo", () => {
		// O caso real da conv 06163675: o cliente escreveu só "80000", e o agente
		// respondeu "você quer esse crédito para carro, moto ou imóvel?".
		//
		// O atalho de quem "já tem alvo de busca" quase abriu um buraco aqui: valor
		// sem categoria passava direto para `search`, que é TERMINAL e MUDO (sem
		// card, sem pergunta) — enquanto `readyForDiscovery` recusava a busca
		// justamente por falta da categoria. Resultado: nada perguntado, nada
		// buscado, cliente parado olhando para a tela.
		//
		// Alvo de busca é valor + categoria, porque é isso que a Bevi precisa.
		const soValor = { qualifyAnswers: { creditMax: 80_000 } } as ConversationMetadata;

		expect(nextGate(soValor, { hasContactName: false })).not.toBe("search");
	});

	it("com a categoria descoberta, o atalho volta a valer", () => {
		const comCategoria = {
			currentCategory: "auto",
			desireAsked: true,
			qualifyAnswers: { creditMax: 80_000 },
		} as ConversationMetadata;

		expect(nextGate(comCategoria, { hasContactName: false })).toBe("search");
	});
});

describe("nextGate — o CPF continua obrigatório, só que no fecho", () => {
	/** Cliente que já viu as cartas pela vitrine e escolheu uma. */
	function escolheuSemDarCpf(): ConversationMetadata {
		return {
			desireAsked: true,
			currentCategory: "auto",
			identityCollected: false,
			searchDispatched: true,
			revealCompleted: true,
			decisionAccepted: true,
			experienceDispatched: true,
			simulacaoApresentada: true,
			escolha: { groupId: "g-1", administradora: "ITAÚ", origem: "mencao" },
			recommendedOffer: {
				creditValue: 81_973,
				termMonths: 60,
				monthlyPayment: 1_600,
				administradora: "ITAÚ",
			},
			qualifyAnswers: { creditMax: 80_000, alvoDeBusca: "valor", prazoMeses: 60 },
		} as unknown as ConversationMetadata;
	}

	it("pede a IDENTIDADE de quem escolheu a cota e ainda não se identificou", () => {
		// A troca justa: documento por contrato. Aqui o cliente já sabe o que
		// está comprando, então o CPF deixa de ser pedágio e vira parte do fecho.
		expect(nextGate(escolheuSemDarCpf(), { hasContactName: true })).toBe("identify");
	});

	it("NÃO manda para o formulário de contrato antes da identidade", () => {
		// O invariante da administradora continua de pé: sem CPF+celular reais
		// não há proposta. O que mudou foi o MOMENTO, não a exigência.
		expect(nextGate(escolheuSemDarCpf(), { hasContactName: true })).not.toBe("contract");
	});

	it("libera o contrato assim que a identidade real chega", () => {
		const meta = { ...escolheuSemDarCpf(), identityCollected: true } as ConversationMetadata;

		expect(nextGate(meta, { hasContactName: true })).toBe("contract");
	});
});

describe("nextGate — sem vitrine, o funil antigo volta inteiro", () => {
	it("volta a exigir CPF antes da busca quando a vitrine não está configurada", () => {
		// Desligar a vitrine é apagar uma env, não reverter um commit. Se a conta
		// da casa cair, sair de homologação ou a Bevi pedir para parar, o produto
		// degrada para o comportamento conhecido em vez de quebrar.
		process.env.VITRINE_CPF = "";
		process.env.VITRINE_CELULAR = "";

		expect(nextGate(abriuComValor(), { hasContactName: true })).toBe("identify");
	});

	it("volta a exigir CPF quando a env traz um CPF inválido", () => {
		process.env.VITRINE_CPF = "11144477734"; // um dígito fora: não passa no módulo 11

		expect(nextGate(abriuComValor(), { hasContactName: true })).toBe("identify");
	});
});
