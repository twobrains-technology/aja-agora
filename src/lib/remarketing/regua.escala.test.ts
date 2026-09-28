// A CADÊNCIA INTRA-JANELA — os toques 01, 02 e 03 em minutos, enquanto a janela
// de 24 h da Meta está aberta.
//
// O que este arquivo tranca, em ordem:
//
//   1. sem ajuste, a escala é `[10, 20, 30]` min (fábrica) e o comportamento por
//      DIAS continua valendo fora da janela — não regride;
//   2. dentro da janela, quem manda é a escala: o toque 01 sai em 10 min e os
//      intervalos seguintes são 20 e 30 min, não 3 e 5 dias;
//   3. as guardas NÃO afrouxam: teto de 30 dias, `maxToques` e janela de horário
//      continuam valendo com a escala curta;
//   4. valor corrompido no cadastro cai na fábrica (o viés de sempre: na dúvida,
//      menos toque).
//
// A régua é PURA (`agora` entra por parâmetro) e o teste fixa os instantes — sem
// relógio, sem banco, sem envio.

import { describe, expect, it } from "vitest";
import {
	ESPERA_SILENCIO_MS,
	type EstadoRegua,
	elementoDaEscala,
	estadoInicial,
	normalizarParametros,
	PARAMETROS_DE_FABRICA,
	type ParametrosRegua,
	podeDisparar,
	proximoToque,
	registrarToque,
} from "./regua";

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

/** Segunda 14/09/2026, 11h em Brasília (14h UTC) — o silêncio começa aqui. */
const INBOUND = new Date("2026-09-14T14:00:00Z");

/** A escala de fábrica, em ms — o contrato que o dono combinou na reunião. */
const ESCALA_DE_FABRICA = [10 * MIN, 20 * MIN, 30 * MIN];

function noSilencio(extra: Partial<Omit<EstadoRegua, "objetivo">> = {}): EstadoRegua {
	return estadoInicial({ objetivo: "carro", ultimoInboundEm: INBOUND, ...extra });
}

function comEscala(escala: readonly number[]): ParametrosRegua {
	return normalizarParametros({ escalaDeRetomadaMs: escala });
}

describe("a fábrica da escala curta é [10, 20, 30] minutos", () => {
	it("o padrão e o normalizado concordam", () => {
		expect(PARAMETROS_DE_FABRICA.escalaDeRetomadaMs).toEqual(ESCALA_DE_FABRICA);
		expect(normalizarParametros({}).escalaDeRetomadaMs).toEqual(ESCALA_DE_FABRICA);
	});

	it("o elemento do passo N é o N-ésimo da lista", () => {
		expect(elementoDaEscala(ESCALA_DE_FABRICA, 1)).toBe(10 * MIN);
		expect(elementoDaEscala(ESCALA_DE_FABRICA, 2)).toBe(20 * MIN);
		expect(elementoDaEscala(ESCALA_DE_FABRICA, 3)).toBe(30 * MIN);
	});

	it("lista mais curta que o número de toques repete o ÚLTIMO intervalo", () => {
		// "de 30 em 30 até a janela fechar" — Kairo, 22/09.
		expect(elementoDaEscala([10 * MIN], 1)).toBe(10 * MIN);
		expect(elementoDaEscala([10 * MIN], 3)).toBe(10 * MIN);
		expect(elementoDaEscala([10 * MIN, 30 * MIN], 3)).toBe(30 * MIN);
	});
});

describe("dentro da janela de 24 h, a escala curta decide", () => {
	it("o toque 01 sai em 10 minutos de silêncio, não em 90", () => {
		const agora = new Date(INBOUND.getTime() + 12 * MIN);
		expect(podeDisparar(noSilencio(), agora)).toEqual({
			pode: true,
			step: 1,
			entrega: "texto_livre",
		});

		// O contraste: com uma escala de 2 h, o mesmo instante ainda não é hora —
		// a decisão é da ESCALA, não do silêncio de 90 min.
		const escalaLonga = comEscala([120 * MIN]);
		expect(podeDisparar(noSilencio(), agora, escalaLonga)).toEqual({
			pode: false,
			motivo: "aguardando_data",
		});
	});

	it("os intervalos até o toque 02 e o 03 são 20 e 30 minutos", () => {
		const t1 = new Date(INBOUND.getTime() + 90 * MIN);

		const apos1 = registrarToque(noSilencio(), t1);
		expect(apos1.nextTouchAt?.toISOString()).toBe(new Date(t1.getTime() + 20 * MIN).toISOString());

		const t2 = new Date(t1.getTime() + 20 * MIN);
		expect(podeDisparar(apos1, t2)).toEqual({ pode: true, step: 2, entrega: "texto_livre" });

		const apos2 = registrarToque(apos1, t2);
		expect(apos2.nextTouchAt?.toISOString()).toBe(new Date(t2.getTime() + 30 * MIN).toISOString());

		const t3 = new Date(t2.getTime() + 30 * MIN);
		expect(podeDisparar(apos2, t3)).toEqual({ pode: true, step: 3, entrega: "texto_livre" });

		// O terceiro toque esgota a sequência: não há um quarto agendamento.
		const apos3 = registrarToque(apos2, t3);
		expect(apos3.status).toBe("ESGOTADO");
		expect(apos3.nextTouchAt).toBeNull();
	});

	it("o próximo toque (o que a tela mostra) também sai da escala curta", () => {
		const t1 = new Date(INBOUND.getTime() + 90 * MIN);
		const apos1 = registrarToque(noSilencio(), t1);
		expect(proximoToque(apos1, t1)?.toISOString()).toBe(
			new Date(t1.getTime() + 20 * MIN).toISOString(),
		);
	});

	it("o cadastro move a escala — sem deploy", () => {
		const escalaDoCadastro = comEscala([5 * MIN, 7 * MIN, 9 * MIN]);
		const agora = new Date(INBOUND.getTime() + 6 * MIN);
		expect(podeDisparar(noSilencio(), agora, escalaDoCadastro)).toMatchObject({
			pode: true,
			step: 1,
		});

		const apos1 = registrarToque(noSilencio(), agora, escalaDoCadastro);
		expect(apos1.nextTouchAt?.toISOString()).toBe(
			new Date(agora.getTime() + 7 * MIN).toISOString(),
		);
	});
});

describe("fora da janela de 24 h, o desenho por DIAS continua intacto", () => {
	it("o silêncio volta a ser 90 min e o intervalo, 3 dias", () => {
		// 25 h depois do último inbound: fora das 24 h.
		const agora = new Date(INBOUND.getTime() + 25 * HORA);

		expect(podeDisparar(noSilencio(), agora)).toEqual({
			pode: true,
			step: 1,
			entrega: "template",
		});

		const apos1 = registrarToque(noSilencio(), agora);
		expect(apos1.nextTouchAt?.toISOString()).toBe(
			new Date(agora.getTime() + 3 * DIA).toISOString(),
		);
	});

	it("e o cadastro dos dias continua mandando, como sempre", () => {
		const agora = new Date(INBOUND.getTime() + 25 * HORA);
		const parametros = normalizarParametros({ diasAteSegundoToque: 1 });
		const apos1 = registrarToque(noSilencio(), agora, parametros);
		expect(apos1.nextTouchAt?.toISOString()).toBe(
			new Date(agora.getTime() + 1 * DIA).toISOString(),
		);
	});

	it("sem `ultimo_inbound_at` não existe janela — vale o desenho por dias", () => {
		const agora = new Date(INBOUND.getTime() + 12 * MIN);
		const semInbound = estadoInicial({ objetivo: "carro", ultimoInboundEm: null });
		// Sem inbound o agendamento nem existe (não há referência de silêncio).
		expect(podeDisparar(semInbound, agora)).toEqual({ pode: false, motivo: "aguardando_data" });
	});
});

describe("a escala curta NÃO afrouxa nenhuma guarda", () => {
	it("a janela de horário continua barrando (23h em Brasília)", () => {
		// 23h em Brasília = 02h UTC do dia seguinte.
		const tardeDaNoite = new Date("2026-09-15T02:00:00Z");
		const estado = estadoInicial({
			objetivo: "carro",
			ultimoInboundEm: new Date(tardeDaNoite.getTime() - 12 * HORA),
		});
		expect(podeDisparar(estado, tardeDaNoite)).toEqual({
			pode: false,
			motivo: "fora_da_janela_de_horario",
		});
	});

	it("o teto de 30 dias continua vencendo a escala", () => {
		const agora = new Date(INBOUND.getTime() + 12 * MIN);
		const estado = noSilencio({
			toquesNaJanela: [
				new Date(agora.getTime() - 3 * DIA),
				new Date(agora.getTime() - 2 * DIA),
				new Date(agora.getTime() - 1 * DIA),
			],
		});
		expect(podeDisparar(estado, agora)).toEqual({ pode: false, motivo: "teto_30_dias" });
	});

	it("`maxToques` do cadastro continua esgotando a sequência", () => {
		const agora = new Date(INBOUND.getTime() + 12 * MIN);
		const parametros = normalizarParametros({ maxToques: 1 });
		const apos1 = registrarToque(noSilencio(), agora, parametros);
		expect(apos1.status).toBe("ESGOTADO");
		expect(apos1.motivoSaida).toBe("tres_toques_sem_resposta");
	});

	it("o silêncio de fábrica continua sendo 90 min (a escala não o substitui fora da janela)", () => {
		expect(PARAMETROS_DE_FABRICA.esperaSilencioMs).toBe(ESPERA_SILENCIO_MS);
	});
});

describe("escala corrompida no cadastro cai na fábrica — nunca em 'dispara mais'", () => {
	it("lista vazia, fora de faixa, fracionária ou decrescente é recusada", () => {
		for (const invalida of [
			[],
			[0],
			[MIN / 2],
			[30 * MIN, 10 * MIN],
			[25 * HORA],
			[MIN, MIN, MIN, MIN, MIN, MIN],
			[Number.NaN],
		] as const) {
			expect(
				normalizarParametros({ escalaDeRetomadaMs: invalida }).escalaDeRetomadaMs,
				String(invalida),
			).toEqual(ESCALA_DE_FABRICA);
		}
	});

	it("a borda aceita é exatamente 1 min até 24 h", () => {
		expect(comEscala([MIN]).escalaDeRetomadaMs).toEqual([MIN]);
		expect(comEscala([24 * HORA]).escalaDeRetomadaMs).toEqual([24 * HORA]);
	});
});
