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
	filtrarPorSituacao,
	type LinhaBruta,
	linhaDaTela,
	linhasDaTela,
	MOTIVO_SEGURADO,
	proximoToqueDe,
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
