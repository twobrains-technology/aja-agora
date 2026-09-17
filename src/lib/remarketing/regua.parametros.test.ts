// A régua com o cadastro no lugar das constantes — o comportamento não muda
// quando ninguém ajusta, e muda direito quando alguém ajusta.
//
// A régua continua PURA: os parâmetros entram por argumento (é assim que o
// cadastro chega ao motor, via `EntradaDoMotor.parametros`). O que este arquivo
// prova é que a ausência do argumento é o comportamento de sempre, e que um
// ajuste de cadastro move a decisão — sem nunca afrouxar a guarda.

import { describe, expect, it } from "vitest";
import {
	contarToquesNaJanela,
	dentroDaJanelaDeHorario,
	type EstadoRegua,
	estadoInicial,
	normalizarParametros,
	PARAMETROS_DE_FABRICA,
	podeDisparar,
	proximoToque,
	registrarToque,
} from "./regua";

const MIN = 60 * 1000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

/** Segunda 14/09/2026, 11h em Brasília (14h UTC) — silêncio inicia aqui. */
const INBOUND = new Date("2026-09-14T14:00:00Z");

function ativo(extra: Partial<Omit<EstadoRegua, "objetivo">> = {}): EstadoRegua {
	return estadoInicial({ objetivo: "carro", ultimoInboundEm: INBOUND, ...extra });
}

describe("sem ajuste, a régua é exatamente a de antes", () => {
	it("a fábrica é o conjunto nomeado das constantes", () => {
		expect(normalizarParametros({})).toEqual(PARAMETROS_DE_FABRICA);
	});

	it("o silêncio continua 90 minutos quando ninguém passa parâmetro", () => {
		expect(podeDisparar(ativo(), new Date(INBOUND.getTime() + 89 * MIN))).toEqual({
			pode: false,
			motivo: "aguardando_data",
		});
		expect(podeDisparar(ativo(), new Date(INBOUND.getTime() + 90 * MIN))).toMatchObject({
			pode: true,
			step: 1,
		});
	});
});

describe("o ajuste do cadastro move a decisão", () => {
	it("silêncio menor libera o toque 01 mais cedo", () => {
		const parametros = normalizarParametros({ esperaSilencioMs: 15 * MIN });

		expect(podeDisparar(ativo(), new Date(INBOUND.getTime() + 20 * MIN), parametros)).toMatchObject(
			{
				pode: true,
				step: 1,
			},
		);
		expect(podeDisparar(ativo(), new Date(INBOUND.getTime() + 10 * MIN), parametros)).toEqual({
			pode: false,
			motivo: "aguardando_data",
		});
	});

	it("o intervalo do toque 02 vira o cadastrado, no agendamento e no próximo toque", () => {
		const parametros = normalizarParametros({ diasAteSegundoToque: 1 });

		const primeiro = registrarToque(ativo(), INBOUND, parametros);
		expect(primeiro.status).toBe("ATIVO");
		expect(primeiro.nextTouchAt?.toISOString()).toBe(
			new Date(INBOUND.getTime() + 1 * DIA).toISOString(),
		);
		expect(proximoToque(primeiro, INBOUND, parametros)?.toISOString()).toBe(
			new Date(INBOUND.getTime() + 1 * DIA).toISOString(),
		);

		// Um dia depois, o segundo toque sai; antes, não.
		expect(podeDisparar(primeiro, new Date(INBOUND.getTime() + 1 * DIA), parametros)).toMatchObject(
			{ pode: true, step: 2 },
		);
		expect(podeDisparar(primeiro, new Date(INBOUND.getTime() + 20 * HORA), parametros)).toEqual({
			pode: false,
			motivo: "aguardando_data",
		});
	});

	it("max_toques menor esgota a sequência mais cedo", () => {
		const parametros = normalizarParametros({ maxToques: 1 });

		const depois = registrarToque(ativo(), INBOUND, parametros);
		expect(depois.status).toBe("ESGOTADO");
		expect(depois.motivoSaida).toBe("tres_toques_sem_resposta");
		expect(depois.nextTouchAt).toBeNull();
	});

	it("teto menor bloqueia antes de gastar mais toque", () => {
		const parametros = normalizarParametros({ tetoToques30Dias: 1 });
		const comToqueNaJanela = ativo({ toquesNaJanela: [new Date(INBOUND.getTime() - 1 * DIA)] });

		expect(
			podeDisparar(comToqueNaJanela, new Date(INBOUND.getTime() + 2 * HORA), parametros),
		).toEqual({ pode: false, motivo: "teto_30_dias" });
		expect(
			contarToquesNaJanela(comToqueNaJanela, new Date(INBOUND.getTime() + 2 * HORA), parametros),
		).toBe(1);

		// Com a fábrica, o mesmo estado ainda tem cota — a diferença é o cadastro.
		expect(podeDisparar(comToqueNaJanela, new Date(INBOUND.getTime() + 2 * HORA))).toMatchObject({
			pode: true,
		});
	});

	it("a janela do teto cadastrada decide quando a cota reabre", () => {
		const parametros = normalizarParametros({ janelaDoTetoMs: 1 * DIA });
		const toqueAntigo = new Date(INBOUND.getTime() - 2 * DIA);
		const estado = ativo({ toquesNaJanela: [toqueAntigo] });

		// Passados dois dias, com janela de um dia, o toque já saiu da conta.
		expect(contarToquesNaJanela(estado, INBOUND, parametros)).toBe(0);
		expect(contarToquesNaJanela(estado, INBOUND)).toBe(1);
	});

	it("a janela de horário cadastrada é a que vale", () => {
		// 23h em Brasília (02h UTC do dia seguinte).
		const tardeDaNoite = new Date("2026-09-15T02:00:00Z");
		expect(dentroDaJanelaDeHorario(tardeDaNoite)).toBe(false);
		expect(
			dentroDaJanelaDeHorario(
				tardeDaNoite,
				normalizarParametros({ horaAbertura: 0, horaFechamento: 24 }),
			),
		).toBe(true);
	});
});

describe("o ajuste nunca afrouxa a guarda", () => {
	it("teto absurdo no cadastro não vira teto absurdo no motor", () => {
		const parametros = normalizarParametros({ tetoToques30Dias: 100, maxToques: 99 });
		expect(parametros).toEqual(PARAMETROS_DE_FABRICA);
	});

	it("valor fracionário é recusado — não existe 'meio toque'", () => {
		expect(normalizarParametros({ maxToques: 2.5 }).maxToques).toBe(
			PARAMETROS_DE_FABRICA.maxToques,
		);
	});

	it("janela invertida volta para a fábrica, não fica válida pela metade", () => {
		expect(normalizarParametros({ horaAbertura: 22, horaFechamento: 6 })).toEqual(
			PARAMETROS_DE_FABRICA,
		);
	});
});
