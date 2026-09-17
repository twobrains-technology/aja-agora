// A régua de remarketing do WhatsApp — o predicado PURO, provado caso a caso.
//
// Cada teste aqui é uma linha do Remarketing_WhatsApp_V3.pdf (13/09), ou uma
// borda que a linha implica. Nenhum deles olha o relógio de verdade: o `agora`
// entra por parâmetro, como manda a disciplina de `src/lib/admin/periodo.ts` —
// um teste que depende do relógio passa de manhã e falha às 21h, exatamente
// quando o defeito é a janela de horário.
//
// Fuso: as datas abaixo estão em UTC e viram o horário de Brasília (UTC−3) ao
// lado de cada uma. 14/09/2026 é uma segunda-feira.

import { describe, expect, it } from "vitest";
import {
	contarToquesNaJanela,
	DIAS_ATE_SEGUNDO_TOQUE,
	DIAS_ATE_TERCEIRO_TOQUE,
	ESPERA_SILENCIO_MS,
	type EstadoRegua,
	estadoInicial,
	HORA_ABERTURA,
	HORA_FECHAMENTO,
	JANELA_DO_TETO_MS,
	MAX_TOQUES,
	podeDisparar,
	proximoToque,
	registrarOptout,
	registrarResposta,
	registrarToque,
	TETO_TOQUES_30_DIAS,
} from "./regua";

/** Segunda 14/09/2026, 12h em Brasília (15h UTC) — dentro da janela de horário. */
const MEIO_DIA = new Date("2026-09-14T15:00:00Z");

/** O cliente falou às 11h de Brasília (14h UTC). O silêncio começa aqui. */
const INBOUND = new Date("2026-09-14T14:00:00Z");

/** 12h30 em Brasília — o instante exato do toque 01 (90 min de silêncio). */
const TOQUE_1 = new Date("2026-09-14T15:30:00Z");

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

/** Um estado ATIVO nascido do silêncio do cliente, com o objetivo preenchido. */
function ativo(opcoes: Partial<Omit<EstadoRegua, "objetivo">>) {
	return estadoInicial({
		objetivo: "carro",
		ultimoInboundEm: INBOUND,
		...opcoes,
	});
}

describe("o toque 01 — 90 minutos de silêncio", () => {
	it("não sai antes do silêncio: 'não respondeu em 1h30' não é 50 minutos", () => {
		const estado = ativo({});
		expect(podeDisparar(estado, new Date("2026-09-14T15:20:00Z"))).toEqual({
			pode: false,
			motivo: "aguardando_data",
		});
	});

	it("sai no minuto do silêncio e é texto livre (janela de 24h aberta)", () => {
		expect(podeDisparar(ativo({}), TOQUE_1)).toEqual({
			pode: true,
			step: 1,
			entrega: "texto_livre",
		});
	});

	it("fora da janela de 24h do último inbound, a entrega é template", () => {
		// O cliente falou três dias antes; a régua venceu e o toque é
		// business-initiated — sem template aprovado a Meta recusa o envio.
		const estado = ativo({ ultimoInboundEm: new Date(TOQUE_1.getTime() - 3 * DIA) });
		expect(podeDisparar(estado, TOQUE_1)).toEqual({
			pode: true,
			step: 1,
			entrega: "template",
		});
	});

	it("a espera de silêncio é a constante única e nomeada", () => {
		expect(ESPERA_SILENCIO_MS).toBe(90 * 60 * 1000);
	});
});

describe("a escada dos 3 toques", () => {
	it("o toque 02 sai 3 dias depois do 01", () => {
		const depoisDoPrimeiro = registrarToque(ativo({}), TOQUE_1);
		expect(depoisDoPrimeiro.step).toBe(1);
		expect(depoisDoPrimeiro.nextTouchAt?.toISOString()).toBe("2026-09-17T15:30:00.000Z");

		// Um segundo antes: ainda não.
		expect(podeDisparar(depoisDoPrimeiro, new Date(TOQUE_1.getTime() + 3 * DIA - 60_000))).toEqual({
			pode: false,
			motivo: "aguardando_data",
		});

		expect(podeDisparar(depoisDoPrimeiro, depoisDoPrimeiro.nextTouchAt as Date)).toEqual({
			pode: true,
			step: 2,
			entrega: "template",
		});
	});

	it("o toque 03 sai 5 dias depois do 02 — 5 é decisão do dono, dentro dos 4 a 7 do PDF", () => {
		const depoisDoPrimeiro = registrarToque(ativo({}), TOQUE_1);
		const depoisDoSegundo = registrarToque(depoisDoPrimeiro, depoisDoPrimeiro.nextTouchAt as Date);
		expect(depoisDoSegundo.step).toBe(2);
		expect(depoisDoSegundo.nextTouchAt?.toISOString()).toBe("2026-09-22T15:30:00.000Z");

		expect(podeDisparar(depoisDoSegundo, new Date(depoisDoSegundo.nextTouchAt as Date))).toEqual({
			pode: true,
			step: 3 as const,
			entrega: "template",
		});
		expect(DIAS_ATE_SEGUNDO_TOQUE).toBe(3);
		expect(DIAS_ATE_TERCEIRO_TOQUE).toBe(5);
	});

	it("três toques: o terceiro é o último e o estado vira ESGOTADO", () => {
		const primeiro = registrarToque(ativo({}), TOQUE_1);
		const segundo = registrarToque(primeiro, primeiro.nextTouchAt as Date);
		const terceiro = registrarToque(segundo, segundo.nextTouchAt as Date);

		expect(terceiro.step).toBe(3);
		expect(terceiro.status).toBe("ESGOTADO");
		expect(terceiro.nextTouchAt).toBeNull();
		expect(terceiro.motivoSaida).toBe("tres_toques_sem_resposta");
		expect(MAX_TOQUES).toBe(3);
	});

	it("esgotado, não sai mais nada — nem com o relógio andando semanas", () => {
		const primeiro = registrarToque(ativo({}), TOQUE_1);
		const segundo = registrarToque(primeiro, primeiro.nextTouchAt as Date);
		const terceiro = registrarToque(segundo, segundo.nextTouchAt as Date);

		const depois = new Date(TOQUE_1.getTime() + 60 * DIA);
		expect(podeDisparar(terceiro, depois)).toEqual({ pode: false, motivo: "esgotado" });
		expect(proximoToque(terceiro, depois)).toBeNull();
	});

	it("o quarto toque nunca sai, mesmo se o estado for forçado a ATIVO com step 3", () => {
		const primeiro = registrarToque(ativo({}), TOQUE_1);
		const segundo = registrarToque(primeiro, primeiro.nextTouchAt as Date);
		const terceiro = registrarToque(segundo, segundo.nextTouchAt as Date);
		const forcado = { ...terceiro, status: "ATIVO" as const };

		expect(
			podeDisparar(forcado, new Date(terceiro.toquesNaJanela[2].getTime() + 40 * DIA)),
		).toEqual({ pode: false, motivo: "esgotado" });
	});
});

describe("qualquer resposta encerra a sequência", () => {
	it("resposta no minuto seguinte ao toque mata a régua, com o toque 02 já agendado", () => {
		const primeiro = registrarToque(ativo({}), TOQUE_1);
		expect(primeiro.nextTouchAt).not.toBeNull();

		const respondeu = registrarResposta(primeiro, new Date(TOQUE_1.getTime() + 60_000));
		expect(respondeu.status).toBe("RESPONDEU");
		expect(respondeu.nextTouchAt).toBeNull();
		expect(respondeu.motivoSaida).toBe("cliente_respondeu");

		// O agendamento do toque 02 já venceu — e mesmo assim não sai nada: a
		// sequência morreu no minuto seguinte ao toque.
		expect(podeDisparar(respondeu, new Date(TOQUE_1.getTime() + 10 * DIA))).toEqual({
			pode: false,
			motivo: "ja_respondeu",
		});
		expect(proximoToque(respondeu, new Date(TOQUE_1.getTime() + 10 * DIA))).toBeNull();
	});

	it("resposta preserva o histórico do teto de 30 dias", () => {
		const primeiro = registrarToque(ativo({}), TOQUE_1);
		const respondeu = registrarResposta(primeiro, new Date(TOQUE_1.getTime() + 60_000));
		expect(respondeu.toquesNaJanela).toHaveLength(1);
		expect(respondeu.ultimoToqueEm?.toISOString()).toBe(TOQUE_1.toISOString());
	});

	it("resposta dentro da própria janela de silêncio (antes do toque 01) também encerra", () => {
		const respondeu = registrarResposta(ativo({}), new Date(INBOUND.getTime() + 5 * 60_000));
		expect(respondeu.status).toBe("RESPONDEU");
		expect(podeDisparar(respondeu, new Date(INBOUND.getTime() + DIA))).toEqual({
			pode: false,
			motivo: "ja_respondeu",
		});
	});
});

describe("opt-out vence tudo", () => {
	it("depois do opt-out nenhum estado posterior volta a permitir disparo", () => {
		const optout = registrarOptout(ativo({}), TOQUE_1);
		expect(optout.status).toBe("OPTOUT");
		expect(optout.nextTouchAt).toBeNull();
		expect(optout.motivoSaida).toBe("optout_do_cliente");

		for (const depois of [
			new Date(TOQUE_1.getTime() + DIA),
			new Date(TOQUE_1.getTime() + 400 * DIA),
		]) {
			expect(podeDisparar(optout, depois)).toEqual({ pode: false, motivo: "optout" });
			expect(proximoToque(optout, depois)).toBeNull();
		}
	});

	it("opt-out depois de resposta continua opt-out — a última palavra é dele", () => {
		const respondeu = registrarResposta(ativo({}), TOQUE_1);
		const optout = registrarOptout(respondeu, new Date(TOQUE_1.getTime() + DIA));
		expect(optout.status).toBe("OPTOUT");

		const respostaDeNovo = registrarResposta(optout, new Date(TOQUE_1.getTime() + 2 * DIA));
		expect(respostaDeNovo.status).toBe("OPTOUT");

		const tentativaDeToque = registrarToque(optout, new Date(TOQUE_1.getTime() + 2 * DIA));
		expect(tentativaDeToque.status).toBe("OPTOUT");
		expect(tentativaDeToque.step).toBe(optout.step);
	});

	it("opt-out vence até a reentrada por nova simulação", () => {
		const optout = registrarOptout(ativo({}), TOQUE_1);
		const comSimulacao = {
			...optout,
			simulacaoEm: new Date(TOQUE_1.getTime() + 100 * DIA),
		};
		expect(podeDisparar(comSimulacao, new Date(TOQUE_1.getTime() + 101 * DIA))).toEqual({
			pode: false,
			motivo: "optout",
		});
		expect(proximoToque(comSimulacao, new Date(TOQUE_1.getTime() + 101 * DIA))).toBeNull();
	});

	it("opt-out nunca é sobrescrito por outro opt-out com motivo diferente", () => {
		const optout = registrarOptout(ativo({}), TOQUE_1);
		expect(optout.motivoSaida).toBe("optout_do_cliente");
		expect(registrarOptout(optout, new Date(TOQUE_1.getTime() + DIA)).status).toBe("OPTOUT");
	});
});

describe("o teto deslizante de 30 dias — global, entre campanhas", () => {
	/** Três toques nos últimos 30 dias: a cota da pessoa está cheia. */
	function cotaCheia() {
		return {
			status: "ESGOTADO" as const,
			step: 3 as const,
			toquesNaJanela: [
				TOQUE_1,
				new Date(TOQUE_1.getTime() + 3 * DIA),
				new Date(TOQUE_1.getTime() + 8 * DIA),
			],
			ultimoToqueEm: new Date(TOQUE_1.getTime() + 8 * DIA),
			nextTouchAt: null,
		};
	}

	it("com 3 toques na janela não sai nada, mesmo com nova simulação", () => {
		const estado = ativo({
			...cotaCheia(),
			simulacaoEm: new Date(TOQUE_1.getTime() + 10 * DIA),
		});
		expect(podeDisparar(estado, new Date(TOQUE_1.getTime() + 11 * DIA))).toEqual({
			pode: false,
			motivo: "teto_30_dias",
		});
	});

	it("a data do próximo toque é a queda do toque MAIS ANTIGO da janela", () => {
		const estado = ativo({
			...cotaCheia(),
			simulacaoEm: new Date(TOQUE_1.getTime() + 10 * DIA),
		});
		const esperado = new Date(TOQUE_1.getTime() + JANELA_DO_TETO_MS);
		expect(proximoToque(estado, new Date(TOQUE_1.getTime() + 11 * DIA))?.toISOString()).toBe(
			esperado.toISOString(),
		);
		expect(esperado.toISOString()).toBe("2026-10-14T15:30:00.000Z");
	});

	it("o contador cai sozinho quando o toque antigo sai da janela", () => {
		const estado = ativo({ ...cotaCheia() });
		const agora = new Date(TOQUE_1.getTime() + 11 * DIA);
		expect(contarToquesNaJanela(estado, agora)).toBe(3);

		// Um minuto depois de o primeiro toque completar 30 dias, ele sai da janela
		// e a cota volta a ter folga.
		const depois = new Date(TOQUE_1.getTime() + JANELA_DO_TETO_MS + 60_000);
		expect(contarToquesNaJanela(estado, depois)).toBe(2);
	});

	it("no instante exato da queda o toque antigo já não conta — a janela é aberta em 30 dias", () => {
		// Mesma régua que `proximoToque` usa para dizer quando a cota reabre: a
		// queda do toque mais antigo é justamente o instante em que ele sai.
		const estado = ativo({ ...cotaCheia() });
		expect(contarToquesNaJanela(estado, new Date(TOQUE_1.getTime() + JANELA_DO_TETO_MS - 1))).toBe(
			3,
		);
		expect(contarToquesNaJanela(estado, new Date(TOQUE_1.getTime() + JANELA_DO_TETO_MS))).toBe(2);
	});

	it("o teto é por PESSOA: a conversa nova herda a cota já gasta", () => {
		// A régua é global entre campanhas — o ciclo começa do zero numa conversa
		// nova, mas o contador da pessoa vem junto. O teto não distingue campanha
		// de propósito: é ele que garante "no máximo 3 toques por pessoa a cada
		// 30 dias, contando entre campanhas".
		const conversaNova = ativo({
			status: "ATIVO",
			step: 0 as const,
			ultimoToqueEm: null,
			nextTouchAt: null,
			simulacaoEm: null,
			toquesNaJanela: cotaCheia().toquesNaJanela,
		});
		const agora = new Date(TOQUE_1.getTime() + 9 * DIA);
		expect(contarToquesNaJanela(conversaNova, agora)).toBe(3);
		expect(podeDisparar(conversaNova, agora)).toEqual({ pode: false, motivo: "teto_30_dias" });
		expect(proximoToque(conversaNova, agora)?.toISOString()).toBe("2026-10-14T15:30:00.000Z");
	});

	it("a constante do teto é 3 toques em 30 dias", () => {
		expect(TETO_TOQUES_30_DIAS).toBe(3);
		expect(JANELA_DO_TETO_MS).toBe(30 * 24 * 60 * 60 * 1000);
	});
});

describe("janela de horário 9h–20h em America/Sao_Paulo", () => {
	/** O estado vencido: o toque 01 já poderia ter saído. */
	const vencido = () => ativo({ ultimoInboundEm: new Date(TOQUE_1.getTime() - 2 * DIA) });

	it("21h de Brasília: fora — a régua não acorda ninguém à noite", () => {
		expect(podeDisparar(vencido(), new Date("2026-09-15T00:00:00Z"))).toEqual({
			pode: false,
			motivo: "fora_da_janela_de_horario",
		});
	});

	it("8h de Brasília: fora, um minuto antes de abrir", () => {
		expect(podeDisparar(vencido(), new Date("2026-09-14T11:59:00Z"))).toEqual({
			pode: false,
			motivo: "fora_da_janela_de_horario",
		});
	});

	it("9h em ponto abre, e 19h59 ainda vale", () => {
		expect(podeDisparar(vencido(), new Date("2026-09-14T12:00:00Z")).pode).toBe(true);
		expect(podeDisparar(vencido(), new Date("2026-09-14T22:59:00Z")).pode).toBe(true);
		expect(HORA_ABERTURA).toBe(9);
		expect(HORA_FECHAMENTO).toBe(20);
	});

	it("20h em ponto fecha", () => {
		expect(podeDisparar(vencido(), new Date("2026-09-14T23:00:00Z"))).toEqual({
			pode: false,
			motivo: "fora_da_janela_de_horario",
		});
	});

	it("o próximo toque é empurrado para as 9h do dia seguinte, não para as 21h", () => {
		const noite = new Date("2026-09-15T00:00:00Z"); // 21h do dia 14
		expect(proximoToque(vencido(), noite)?.toISOString()).toBe("2026-09-15T12:00:00.000Z");
	});

	it("quem venceu de manhã sai às 9h, não fica esperando 24h", () => {
		const madrugada = new Date("2026-09-14T09:00:00Z"); // 6h em Brasília
		expect(proximoToque(vencido(), madrugada)?.toISOString()).toBe("2026-09-14T12:00:00.000Z");
	});
});

describe("reentrada por nova simulação", () => {
	/** Régua esgotada, mas com folga no teto (só um toque na janela). */
	function esgotadoComFolga() {
		return {
			status: "ESGOTADO" as const,
			step: 3 as const,
			toquesNaJanela: [new Date(TOQUE_1.getTime() - 20 * DIA)],
			ultimoToqueEm: TOQUE_1,
			nextTouchAt: null,
		};
	}

	it("sem nova simulação, esgotado continua esgotado", () => {
		const estado = ativo(esgotadoComFolga());
		expect(podeDisparar(estado, new Date(TOQUE_1.getTime() + 5 * DIA))).toEqual({
			pode: false,
			motivo: "esgotado",
		});
		expect(proximoToque(estado, new Date(TOQUE_1.getTime() + 5 * DIA))).toBeNull();
	});

	it("simulação ANTERIOR ao último toque não reabre — tem que ser depois", () => {
		const estado = ativo({
			...esgotadoComFolga(),
			simulacaoEm: new Date(TOQUE_1.getTime() - DIA),
		});
		expect(podeDisparar(estado, new Date(TOQUE_1.getTime() + 5 * DIA))).toEqual({
			pode: false,
			motivo: "esgotado",
		});
	});

	it("simulação posterior ao último toque reabre, com o ciclo no começo (step 1)", () => {
		const simulacaoEm = new Date(TOQUE_1.getTime() + 5 * DIA);
		const estado = ativo({ ...esgotadoComFolga(), simulacaoEm });

		// O silêncio do ciclo novo ainda não fechou.
		expect(podeDisparar(estado, new Date(simulacaoEm.getTime() + 30 * 60_000))).toEqual({
			pode: false,
			motivo: "aguardando_data",
		});

		// A simulação é do site: ela não abre a janela de 24h da Meta (que é
		// inbound de WhatsApp), então o toque sai como template.
		expect(podeDisparar(estado, new Date(simulacaoEm.getTime() + ESPERA_SILENCIO_MS))).toEqual({
			pode: true,
			step: 1,
			entrega: "template",
		});
	});

	it("registrar o toque da reentrada volta o step ao começo: 1, não 4", () => {
		const simulacaoEm = new Date(TOQUE_1.getTime() + 5 * DIA);
		const estado = ativo({ ...esgotadoComFolga(), simulacaoEm });
		const reaberto = registrarToque(estado, new Date(simulacaoEm.getTime() + ESPERA_SILENCIO_MS));

		expect(reaberto.status).toBe("ATIVO");
		expect(reaberto.step).toBe(1);
		expect(reaberto.nextTouchAt?.toISOString()).toBe(
			new Date(simulacaoEm.getTime() + ESPERA_SILENCIO_MS + 3 * DIA).toISOString(),
		);
	});

	it("reentrada não fura o teto: cota cheia, nada sai", () => {
		// A simulação é POSTERIOR ao último toque (o que habilita a reentrada) —
		// e ainda assim o teto barra, porque a régua é global e por pessoa.
		const simulacaoEm = new Date(TOQUE_1.getTime() + 10 * DIA);
		const estado = ativo({
			status: "ESGOTADO",
			step: 3 as const,
			toquesNaJanela: [
				TOQUE_1,
				new Date(TOQUE_1.getTime() + 3 * DIA),
				new Date(TOQUE_1.getTime() + 8 * DIA),
			],
			ultimoToqueEm: new Date(TOQUE_1.getTime() + 8 * DIA),
			simulacaoEm,
		});
		expect(podeDisparar(estado, new Date(simulacaoEm.getTime() + ESPERA_SILENCIO_MS))).toEqual({
			pode: false,
			motivo: "teto_30_dias",
		});
	});

	it("a régua nunca dispara sem data de referência — nem para um estado ATIVO recém-criado", () => {
		const vazio = ativo({ ultimoInboundEm: null });
		expect(podeDisparar(vazio, MEIO_DIA)).toEqual({ pode: false, motivo: "aguardando_data" });
		expect(proximoToque(vazio, MEIO_DIA)).toBeNull();
	});
});
