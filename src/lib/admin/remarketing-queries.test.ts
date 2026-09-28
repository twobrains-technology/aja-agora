// A derivação da tela de régua: situação, contadores, próximo toque e rótulos.
//
// Teste PURO — sem banco, sem servidor, sem browser. É a lógica que a lista do
// painel mostra, e é só ela que merece teste aqui: espaçamento e cor não têm
// teste neste projeto. O nome do arquivo é o do módulo de consultas do bloco,
// porque é esta derivação que ele entrega; a leitura do banco em si
// (`listarReguas`) não tem unidade para provar além do SQL.

import { describe, expect, it } from "vitest";
import {
	contadoresDe,
	cotaLegivel,
	filtrarPorPasso,
	filtrarPorSituacao,
	type LinhaBruta,
	linhaDaTela,
	linhasDaTela,
	MOTIVO_SEGURADO,
	passoDa,
	passoDoParametro,
	passoLegivel,
	proximoToqueDe,
	resumoDaRegua,
	rotuloDoFiltroDePasso,
	rotuloDoMotivo,
	situacaoDe,
	situacaoDoParametro,
} from "./remarketing-tela";

/** Um toque antigo e um agora bem depois dele — dentro da janela de horário. */
const TOQUE = new Date("2026-09-10T13:00:00Z"); // 10h em Brasília
const AGORA = new Date("2026-09-17T13:00:00Z");

function linha(parcial: Partial<LinhaBruta> = {}): LinhaBruta {
	return {
		conversationId: "11111111-1111-1111-1111-111111111111",
		contactId: "22222222-2222-2222-2222-222222222222",
		nome: "Marina",
		telefoneMascarado: "(62) 9...-6793",
		objetivo: "carro",
		step: 1,
		status: "ATIVO",
		motivoSaida: null,
		nextTouchAt: new Date("2026-09-13T13:00:00Z"),
		ultimoToqueEm: TOQUE,
		touches30d: 1,
		criadoEm: new Date("2026-09-09T13:00:00Z"),
		ultimoInboundEm: new Date("2026-09-10T11:00:00Z"),
		optoutDaPessoaEm: null,
		converteuEm: null,
		rastro: null,
		evidenciaDaForma: null,
		...parcial,
	};
}

describe("situacaoDe — o que o operador vê na coluna", () => {
	it("ATIVO é ativo", () => {
		expect(situacaoDe({ status: "ATIVO", motivoSaida: null, optoutDaPessoaEm: null })).toBe(
			"ativo",
		);
	});

	it("RESPONDEU com o motivo da tela é SEGURADO, não respondeu", () => {
		expect(
			situacaoDe({ status: "RESPONDEU", motivoSaida: MOTIVO_SEGURADO, optoutDaPessoaEm: null }),
		).toBe("segurado");
	});

	it("RESPONDEU com o motivo do motor é respondeu", () => {
		expect(
			situacaoDe({
				status: "RESPONDEU",
				motivoSaida: "cliente_respondeu",
				optoutDaPessoaEm: null,
			}),
		).toBe("respondeu");
	});

	it("ESGOTADO e CONVERTEU têm situação própria", () => {
		expect(situacaoDe({ status: "ESGOTADO", motivoSaida: null, optoutDaPessoaEm: null })).toBe(
			"esgotado",
		);
		expect(situacaoDe({ status: "CONVERTEU", motivoSaida: null, optoutDaPessoaEm: null })).toBe(
			"converteu",
		);
	});

	// O fato terminal é o campo do CONTATO; o status `OPTOUT` da linha é só o
	// reflexo dele, gravado no ciclo seguinte. Contar pelo status mostraria uma
	// pessoa que já pediu para sair como "ativa" até o motor passar.
	it("o opt-out do contato vence o status da linha, ainda não escrito", () => {
		expect(situacaoDe({ status: "ATIVO", motivoSaida: null, optoutDaPessoaEm: TOQUE })).toBe(
			"optout",
		);
	});

	it("o opt-out vence até o 'segurado' — terminal é terminal", () => {
		expect(
			situacaoDe({ status: "RESPONDEU", motivoSaida: MOTIVO_SEGURADO, optoutDaPessoaEm: TOQUE }),
		).toBe("optout");
	});
});

describe("contadoresDe — o topo da tela", () => {
	it("conta a régua inteira por situação", () => {
		const contadores = contadoresDe([
			linha(),
			linha({ conversationId: "a", status: "ATIVO" }),
			linha({ conversationId: "b", status: "RESPONDEU", motivoSaida: MOTIVO_SEGURADO }),
			linha({ conversationId: "c", status: "RESPONDEU", motivoSaida: "cliente_respondeu" }),
			linha({ conversationId: "d", status: "ESGOTADO" }),
			linha({ conversationId: "e", status: "OPTOUT" }),
			linha({ conversationId: "f", status: "CONVERTEU" }),
		]);

		expect(contadores).toEqual({
			ativo: 2,
			segurado: 1,
			respondeu: 1,
			esgotado: 1,
			optout: 1,
			converteu: 1,
		});
	});

	it("régua vazia conta zero em todas as situações, sem inventar chave", () => {
		expect(contadoresDe([])).toEqual({
			ativo: 0,
			segurado: 0,
			respondeu: 0,
			esgotado: 0,
			optout: 0,
			converteu: 0,
		});
	});
});

describe("filtrarPorSituacao", () => {
	it("situação nula devolve a lista inteira", () => {
		const linhas = [linha(), linha({ conversationId: "b", status: "OPTOUT" })];
		expect(filtrarPorSituacao(linhas, null)).toHaveLength(2);
	});

	it("filtra pela situação derivada", () => {
		const linhas = [
			linha(),
			linha({ conversationId: "b", status: "RESPONDEU", motivoSaida: MOTIVO_SEGURADO }),
		];
		const seguradas = filtrarPorSituacao(linhas, "segurado");

		expect(seguradas).toHaveLength(1);
		expect(seguradas[0].conversationId).toBe("b");
	});
});

describe("proximoToqueDe", () => {
	it("linha ativa tem próximo toque", () => {
		expect(proximoToqueDe(linha())).toEqual(new Date("2026-09-13T13:00:00Z"));
	});

	// A linha segurada guarda o `next_touch_at` (é ele que o "soltar" devolve à
	// vida), mas o motor não vai disparar: mostrar data ali seria mentira.
	it("linha segurada não mostra próximo toque", () => {
		expect(proximoToqueDe(linha({ status: "RESPONDEU", motivoSaida: MOTIVO_SEGURADO }))).toBeNull();
	});
});

describe("linhaDaTela", () => {
	it("traduz passo, cota e objetivo para leitura humana", () => {
		const daTela = linhaDaTela(linha({ step: 2, touches30d: 2, objetivo: "imovel" }), AGORA);

		expect(daTela.passoLegivel).toBe("2 de 3");
		expect(daTela.cotaLegivel).toBe("2 de 3");
		expect(daTela.rotuloDoObjetivo).toBe("Imóvel");
	});

	it("passo 0 é 'nenhum toque ainda', não '0 de 3'", () => {
		expect(linhaDaTela(linha({ step: 0 }), AGORA).passoLegivel).toBe("—");
	});

	it("marca o próximo toque vencido quando a data já passou", () => {
		const atrasada = linhaDaTela(linha({ nextTouchAt: new Date("2026-09-15T13:00:00Z") }), AGORA);
		const futura = linhaDaTela(linha({ nextTouchAt: new Date("2026-09-20T13:00:00Z") }), AGORA);

		expect(atrasada.proximoToqueVencido).toBe(true);
		expect(futura.proximoToqueVencido).toBe(false);
	});

	it("rótulos de situação em português com acento", () => {
		const daTela = linhasDaTela(
			[
				linha(),
				linha({ conversationId: "b", status: "OPTOUT" }),
				linha({ conversationId: "c", status: "RESPONDEU", motivoSaida: MOTIVO_SEGURADO }),
			],
			AGORA,
		);

		expect(daTela.map((l) => l.rotuloDaSituacao)).toEqual([
			"Ativo",
			"Pediu para sair",
			"Segurado pelo atendente",
		]);
	});

	it("só linha ativa oferece segurar; só segurada oferece soltar", () => {
		const ativa = linhaDaTela(linha(), AGORA);
		const segurada = linhaDaTela(
			linha({ status: "RESPONDEU", motivoSaida: MOTIVO_SEGURADO }),
			AGORA,
		);
		const respondeu = linhaDaTela(
			linha({ status: "RESPONDEU", motivoSaida: "cliente_respondeu" }),
			AGORA,
		);

		expect([ativa.podeSegurar, ativa.podeSoltar]).toEqual([true, false]);
		expect([segurada.podeSegurar, segurada.podeSoltar]).toEqual([false, true]);
		expect([respondeu.podeSegurar, respondeu.podeSoltar]).toEqual([false, false]);
	});

	it("leva o rastro de quem segurou para a linha", () => {
		const rastro = {
			tipo: "segurar" as const,
			por: "Kairo",
			porId: "user-1",
			em: "2026-09-16T12:00:00.000Z",
		};
		const daTela = linhaDaTela(
			linha({ status: "RESPONDEU", motivoSaida: MOTIVO_SEGURADO, rastro }),
			AGORA,
		);

		expect(daTela.rastro).toEqual(rastro);
		expect(daTela.motivoLegivel).toBe("Segurou à mão, pelo painel");
	});
});

describe("rotuloDoMotivo", () => {
	it("traduz os motivos conhecidos", () => {
		expect(rotuloDoMotivo("cliente_respondeu")).toBe("O cliente respondeu");
		expect(rotuloDoMotivo("tres_toques_sem_resposta")).toBe("Três toques sem resposta");
		expect(rotuloDoMotivo("optout_do_cliente")).toBe("O cliente pediu para sair");
	});

	it("motivo desconhecido sai cru — rótulo inventado seria pior", () => {
		expect(rotuloDoMotivo("motivo_do_futuro")).toBe("motivo_do_futuro");
		expect(rotuloDoMotivo(null)).toBeNull();
	});
});

describe("situacaoDoParametro", () => {
	it("reconhece as situações e ignora o resto", () => {
		expect(situacaoDoParametro("segurado")).toBe("segurado");
		expect(situacaoDoParametro("qualquer")).toBeNull();
		expect(situacaoDoParametro(null)).toBeNull();
	});
});

describe("filtrarPorPasso — a porta da pergunta 'para quem foi? (FIX-379)", () => {
	// A invariante que faz o funil e o resumo contarem a MESMA coisa: o resumo
	// soma o `step` de cada conversa ("toques enviados") e o funil classifica a
	// conversa por esse mesmo `step`. Se as duas contas divergirem, o operador
	// clica em "8 toques" e a lista filtrada mostra outra coisa.
	it("a soma dos passos bate com os 'toques enviados' do resumo", () => {
		const linhas = [
			linha({ step: 1 }),
			linha({ conversationId: "b", step: 3 }),
			linha({ conversationId: "c", step: 0 }),
			linha({ conversationId: "d", step: 2 }),
		];

		const somaDosPassos = linhas.reduce((soma, l) => soma + passoDa(l), 0);
		expect(somaDosPassos).toBe(resumoDaRegua(linhas).toquesEnviados);
	});

	it("o recorte por passo devolve exatamente quem está naquele passo", () => {
		const linhas = [
			linha({ conversationId: "a", step: 0 }),
			linha({ conversationId: "b", step: 2 }),
			linha({ conversationId: "c", step: 2 }),
			linha({ conversationId: "d", step: 3 }),
		];

		expect(filtrarPorPasso(linhas, 2).map((l) => l.conversationId)).toEqual(["b", "c"]);
		expect(filtrarPorPasso(linhas, 0).map((l) => l.conversationId)).toEqual(["a"]);
		expect(filtrarPorPasso(linhas, 1)).toEqual([]);
	});

	it("'com toque' traz quem recebeu pelo menos um toque, e nenhum a mais", () => {
		const linhas = [
			linha({ conversationId: "a", step: 0 }),
			linha({ conversationId: "b", step: 1 }),
			linha({ conversationId: "c", step: 3 }),
		];

		expect(filtrarPorPasso(linhas, "com_toque").map((l) => l.conversationId)).toEqual(["b", "c"]);
	});

	it("sem filtro a lista inteira volta", () => {
		expect(filtrarPorPasso([linha(), linha({ conversationId: "b" })], null)).toHaveLength(2);
	});

	it("passoDoParametro reconhece 0..3 e com_toque, e ignora o resto", () => {
		expect(passoDoParametro("0")).toBe(0);
		expect(passoDoParametro("3")).toBe(3);
		expect(passoDoParametro("com_toque")).toBe("com_toque");
		expect(passoDoParametro("4")).toBeNull();
		expect(passoDoParametro("carro")).toBeNull();
		expect(passoDoParametro(null)).toBeNull();
	});

	it("o rótulo do filtro é o mesmo vocabulário do funil", () => {
		expect(rotuloDoFiltroDePasso(1)).toBe("Depois do toque 01");
		expect(rotuloDoFiltroDePasso("com_toque")).toBe("Com algum toque enviado");
	});
});

describe("o teto exibido vem do cadastro, não da constante (FIX-381)", () => {
	// O ciclo já lê `maxToques` do `remarketing_config` (AJA-20 T1); a TELA ficou
	// presa na constante. Com o cadastro em 2 a tela dizia "1 de 3" e mentia para
	// quem opera. O default continua sendo a fábrica, que é o mesmo valor que o
	// ciclo usa quando não há cadastro.
	it("com o cadastro em 2, a tela diz '1 de 2'", () => {
		expect(passoLegivel(1, 2)).toBe("1 de 2");
		expect(cotaLegivel(1, 2)).toBe("1 de 2");
	});

	it("o passo nunca passa do teto, mesmo com o dado adiantado", () => {
		expect(passoLegivel(3, 2)).toBe("2 de 2");
	});

	it("sem cadastro, cai no valor de fábrica", () => {
		expect(passoLegivel(1)).toBe("1 de 3");
		expect(cotaLegivel(2)).toBe("2 de 3");
	});

	it("a linha da tela carrega o teto recebido", () => {
		const comDois = linhaDaTela(linha({ step: 1, touches30d: 1 }), AGORA, 2);
		expect(comDois.passoLegivel).toBe("1 de 2");
		expect(comDois.cotaLegivel).toBe("1 de 2");

		const semCadastro = linhaDaTela(linha({ step: 1, touches30d: 1 }), AGORA);
		expect(semCadastro.passoLegivel).toBe("1 de 3");
	});
});
