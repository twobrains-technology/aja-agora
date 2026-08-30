/**
 * A primeira resposta tem NÚMERO, não pergunta.
 *
 * ── O que o banco de produção mostrou (medido em 30/08/2026) ────────────────
 *
 * Janela limpa de 16 a 30/08 — depois do fix de prefetch, então são chegadas de
 * gente. 71 conversas web reais:
 *
 *   71 conversas → 70 falaram → 22 informaram o valor → 19 deram o CPF →
 *   19 viram carta → 2 propostas.
 *
 * Lido nos dois sentidos, o funil conta uma história diferente da que a
 * auditoria supôs:
 *
 *   • **34 das 71 (49%) morrem com UMA fala do cliente.** A mediana de quem
 *     não chega ao valor é de 1 fala. 46 (65%) não passam do começo.
 *   • **De quem chega ao valor, 86% entrega o CPF** (19 de 22), e os 19 veem carta.
 *
 * Ou seja: o CPF não é o pedágio. A auditoria viu "69% somem" e atribuiu ao
 * pedido de CPF; os 69% somem ANTES, entre a primeira fala e o valor do bem.
 *
 * E as 34 falas mortas são quase todas a mesma cena, literal do banco:
 *
 *   👤 Quero comprar um imóvel.
 *   🤖 Que ótimo! Imóvel é um investimento que muda a vida. Já tem um em mente,
 *      ou está explorando opções?                                    — fim —
 *
 *   👤 Imóvel
 *   🤖 Que legal, imóvel é um dos melhores investimentos! Antes de eu te ajudar
 *      a encontrar o consórcio perfeito, como posso te chamar?        — fim —
 *
 * A pessoa clicou num chip dizendo exatamente o que queria e recebeu de volta
 * um elogio e uma pergunta. Nenhum número na tela.
 *
 * ── O que muda ──────────────────────────────────────────────────────────────
 *
 * A CATEGORIA passa a valer o mesmo que o alvo completo para dispensar a
 * abertura: quem já disse o que quer não é recebido com `name` nem `desire` —
 * vai direto para o `credit`, que é o card da agulha, e que desde 30/08 mostra
 * a parcela estimada ao vivo. A primeira resposta passa a ter número.
 *
 * É a mesma decisão de 27/08 (que tirou `name` e `desire` da frente de quem
 * trazia alvo de busca completo), aplicada ao caso que sobrou — e que a
 * medição mostra ser 90% das entradas.
 *
 * ── O que NÃO muda, e por que ───────────────────────────────────────────────
 *
 * O nome continua sendo perguntado. Ele apenas desce para depois do valor.
 * Medido no mesmo recorte: **22 de 22** conversas que informaram o valor têm
 * nome, e 19 de 19 que deram CPF também. Deixar de perguntar entregaria à mesa
 * um lead com CPF e telefone e sem nome — trocaria um problema por outro.
 * O que se corrige é a POSIÇÃO da pergunta, não a existência dela: ela sai do
 * turno em que 49% vai embora e vai para depois do primeiro número entregue.
 *
 * E quem chega sem dizer nada ("oi") continua sendo recebido pelo nome. Ali a
 * pergunta é a conversa começando, não um pedágio.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ConversationMetadata } from "./personas";
import { nextGate } from "./qualify-state";

const ENV_ORIGINAL = { ...process.env };

beforeEach(() => {
	// Sem vitrine — que é o estado REAL de produção em 30/08/2026 (nem
	// `tb/prod/aja-agora/env` nem `tb/dev/aja-agora/env` têm VITRINE_CPF). O
	// caminho que este arquivo protege é justamente o que roda hoje.
	process.env.VITRINE_CPF = "";
	process.env.VITRINE_CELULAR = "";
});

afterEach(() => {
	process.env = { ...ENV_ORIGINAL };
});

const SEM_NOME = { hasContactName: false };
const COM_NOME = { hasContactName: true };

/** Quem clicou num chip da landing: categoria escolhida, nada mais. */
function soACategoria(category: "auto" | "imovel" | "moto" = "imovel"): ConversationMetadata {
	return { currentCategory: category, qualifyAnswers: {} } as ConversationMetadata;
}

/** Quem abriu o chat e disse "oi". */
function semNadaAinda(): ConversationMetadata {
	return { qualifyAnswers: {} } as ConversationMetadata;
}

describe("quem chega com a categoria vai direto para o valor", () => {
	it('"Quero comprar um imóvel." não é recebido com "como posso te chamar?"', () => {
		expect(nextGate(soACategoria("imovel"), SEM_NOME)).toBe("credit");
	});

	it('nem com "já tem um em mente?" (o gate `desire`)', () => {
		const meta = soACategoria("auto");
		expect(meta.desireAsked).toBeUndefined();
		expect(nextGate(meta, COM_NOME)).toBe("credit");
	});

	it("vale para as três categorias — as três são chips da landing", () => {
		for (const categoria of ["auto", "imovel", "moto"] as const) {
			expect(nextGate(soACategoria(categoria), SEM_NOME)).toBe("credit");
		}
	});

	it("quem chega com alvo COMPLETO não recebe pergunta vazia — recebe o nome", () => {
		const comAlvo = {
			currentCategory: "auto",
			qualifyAnswers: { creditMax: 80_000 },
		} as ConversationMetadata;

		// ⚠️ O ÚNICO CASO EM QUE ESTA MUDANÇA CUSTA ALGO, e ele está registrado
		// aqui de propósito.
		//
		// Quem escreve "Quero um carro até R$ 80 mil" pula o gate `credit` (já
		// tem valor) e cai direto no `name` — ou seja, para ele o nome volta a
		// ser a primeira pergunta, que é o que a decisão de 27/08 tirou.
		//
		// Por que ainda assim é o comportamento certo:
		//
		//  • o que 27/08 combateu foi a pergunta VAZIA ("já tem um modelo em
		//    mente?") no lugar de uma resposta. Aqui o agente já tem categoria e
		//    valor: o turno é "Perfeito, R$ 80 mil em carro. Como posso te
		//    chamar?" — conversa que avança, não pedágio;
		//  • a alternativa seria pedir CPF a alguém que não se apresentou, que é
		//    a ordem errada em qualquer balcão;
		//  • medido em produção (16–30/08), este caso é **1 das 22** conversas
		//    que chegam ao valor (4,5%). As outras 21 entraram pela categoria e
		//    são exatamente quem esta mudança beneficia.
		//
		// Distinguir os dois casos exigiria um marcador novo de "já viu um card
		// com número", e um flag de estado a mais na meta do funil custa mais do
		// que os 4,5% que ele protegeria.
		expect(nextGate(comAlvo, SEM_NOME)).toBe("name");
	});

	it("e com o nome conhecido, o alvo completo segue direto — 27/08 intacto", () => {
		const comAlvo = {
			currentCategory: "auto",
			qualifyAnswers: { creditMax: 80_000 },
		} as ConversationMetadata;
		expect(nextGate(comAlvo, COM_NOME)).toBe("identify");
	});
});

describe("o nome não some — desce", () => {
	it("depois do valor, quem ainda não tem nome é perguntado", () => {
		const jaDeuOValor = {
			currentCategory: "imovel",
			qualifyAnswers: { creditMax: 300_000 },
		} as ConversationMetadata;
		// Passou a agulha; agora sim o nome, antes de qualquer pedido de documento.
		expect(nextGate(jaDeuOValor, SEM_NOME)).toBe("name");
	});

	it("com o nome conhecido, o funil segue direto para a identidade", () => {
		const jaDeuOValor = {
			currentCategory: "imovel",
			qualifyAnswers: { creditMax: 300_000 },
		} as ConversationMetadata;
		expect(nextGate(jaDeuOValor, COM_NOME)).toBe("identify");
	});

	it("o nome vem ANTES do CPF — pedir documento a um desconhecido é pior", () => {
		const jaDeuOValor = {
			currentCategory: "auto",
			qualifyAnswers: { creditMax: 90_000 },
		} as ConversationMetadata;
		expect(nextGate(jaDeuOValor, SEM_NOME)).not.toBe("identify");
	});

	it("quem já entregou a identidade não é interrompido pelo nome", () => {
		// Trava de segurança: um gate de nome reaberto depois do CPF faria o funil
		// andar para trás no ponto mais caro.
		const adiantado = {
			currentCategory: "auto",
			qualifyAnswers: { creditMax: 90_000 },
			identityCollected: true,
		} as ConversationMetadata;
		expect(nextGate(adiantado, SEM_NOME)).toBe("search");
	});
});

describe("quem chega sem dizer nada continua sendo recebido pelo nome", () => {
	it('"oi" abre pelo nome', () => {
		expect(nextGate(semNadaAinda(), SEM_NOME)).toBe("name");
	});

	it("com nome e sem categoria, o `desire` continua construindo o desejo", () => {
		expect(nextGate(semNadaAinda(), COM_NOME)).toBe("desire");
	});
});

describe("o que a mudança não pode quebrar", () => {
	it("contrato fechado continua sendo terminal", () => {
		const fechado = { contractClosed: true, qualifyAnswers: {} } as ConversationMetadata;
		expect(nextGate(fechado, SEM_NOME)).toBe("search");
	});

	it("a identidade continua obrigatória antes da busca (sem vitrine)", () => {
		const pronto = {
			currentCategory: "auto",
			qualifyAnswers: { creditMax: 90_000 },
		} as ConversationMetadata;
		expect(nextGate(pronto, COM_NOME)).toBe("identify");
	});

	it("com vitrine, a identidade desce para o fecho como em 27/08", () => {
		process.env.VITRINE_CPF = "11144477735";
		process.env.VITRINE_CELULAR = "62992496793";
		const pronto = {
			currentCategory: "auto",
			qualifyAnswers: { creditMax: 90_000 },
		} as ConversationMetadata;
		expect(nextGate(pronto, COM_NOME)).toBe("search");
	});
});
