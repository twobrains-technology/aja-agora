// P4 — linha ATIVO presa no teto de 30 dias não pode ficar "vencida".
//
// Defeito medido em produção (05/10): 6 linhas `ATIVO` com `next_touch_at`
// vencido há 3 dias porque a pessoa já tem 3 toques na janela de 30 dias. O
// motor devolvia `proximoEstado: null` nesse bloqueio (tratado como
// "transitório") e o ciclo não gravava nada — a data ficava no passado, a linha
// era relida a cada 30 s e o painel dizia "Ativo" com toque vencido, sem
// explicar por quê.
//
// A régua (`proximoToque`) já sabe QUANDO a cota reabre: quando o toque mais
// antigo da janela completa 30 dias. O conserto é o motor DEVOLVER esse
// reagendamento em vez de `null`.

import { describe, expect, it } from "vitest";
import { decidir } from "./motor";
import { estadoInicial } from "./regua";

const DIA = 24 * 60 * 60 * 1000;
// 12h em Brasília — dentro da janela de envio (9h–20h).
const AGORA = new Date("2026-10-05T15:00:00Z");

/** A linha no teto: 3 toques na janela, `next_touch_at` vencido há 3 dias. */
function linhaNoTeto() {
	const maisAntigo = new Date(AGORA.getTime() - 25 * DIA);
	return estadoInicial({
		objetivo: "carro",
		status: "ATIVO",
		step: 3,
		nextTouchAt: new Date(AGORA.getTime() - 3 * DIA),
		ultimoToqueEm: new Date(AGORA.getTime() - 2 * DIA),
		toquesNaJanela: [
			maisAntigo,
			new Date(AGORA.getTime() - 10 * DIA),
			new Date(AGORA.getTime() - 2 * DIA),
		],
	});
}

describe("P4 — linha ATIVO no teto de 30 dias", () => {
	it("reagenda para quando o toque mais antigo sai da janela", () => {
		const estado = linhaNoTeto();
		const maisAntigo = estado.toquesNaJanela[0] as Date;

		const decisao = decidir({
			agora: AGORA,
			estado,
			telefone: "5562999998888",
			fase: "inicio",
		});

		expect(decisao.acao).toEqual({ tipo: "nada", motivo: "teto_30_dias" });
		expect(decisao.proximoEstado).not.toBeNull();
		// O instante exato: o toque mais antigo + 30 dias.
		expect(decisao.proximoEstado?.nextTouchAt?.toISOString()).toBe(
			new Date(maisAntigo.getTime() + 30 * DIA).toISOString(),
		);
	});

	it("nunca deixa o próximo toque no passado", () => {
		const decisao = decidir({
			agora: AGORA,
			estado: linhaNoTeto(),
			telefone: "5562999998888",
			fase: "inicio",
		});

		const proximo = decisao.proximoEstado?.nextTouchAt ?? null;
		expect(proximo).not.toBeNull();
		expect((proximo as Date).getTime()).toBeGreaterThan(AGORA.getTime());
	});

	it("mantém o status ATIVO — a sequência não morreu, só espera a cota", () => {
		const decisao = decidir({
			agora: AGORA,
			estado: linhaNoTeto(),
			telefone: "5562999998888",
			fase: "inicio",
		});

		expect(decisao.proximoEstado?.status).toBe("ATIVO");
		expect(decisao.proximoEstado?.motivoSaida).toBeNull();
	});
});
