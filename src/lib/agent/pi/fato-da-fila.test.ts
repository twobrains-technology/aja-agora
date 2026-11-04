import { describe, expect, it } from "vitest";
import { montarFatoDaFila } from "./fato-da-fila";

const base = {
	agora: new Date("2026-11-05T04:12:00Z"),
	atendentesAtivos: 2,
	chamadaEm: null,
	assumidaPor: null,
};

describe("montarFatoDaFila", () => {
	it("mostra a hora em America/Sao_Paulo", () => {
		const t = montarFatoDaFila(base);
		expect(t).toContain("01:12");
		expect(t).toContain("05/11/2026");
	});

	it("respeita o fuso na virada de dia", () => {
		const t = montarFatoDaFila({ ...base, agora: new Date("2026-11-05T02:30:00Z") });
		expect(t).toContain("04/11/2026, 23:30");
	});

	it("informa 0 atendentes sem política nem promessa", () => {
		const t = montarFatoDaFila({ ...base, atendentesAtivos: 0 });
		expect(t).toContain("Vendedores ativos cadastrados: 0");
		expect(t).not.toMatch(/expediente|madrugada|ninguém atende|prazo|em instantes|em breve/i);
	});

	it("diz se a fila foi chamada e há quanto tempo", () => {
		expect(montarFatoDaFila(base)).toContain("não chamada");
		const t = montarFatoDaFila({
			...base,
			chamadaEm: new Date(base.agora.getTime() - 7 * 60_000),
		});
		expect(t).toContain("chamada há 7 min");
		expect(t).toContain("01:05");
	});

	it("diz quem assumiu", () => {
		expect(montarFatoDaFila({ ...base, assumidaPor: "Ana" })).toContain("assumida por Ana");
	});

	it("é pura", () => {
		expect(montarFatoDaFila(base)).toBe(montarFatoDaFila({ ...base }));
	});
});
