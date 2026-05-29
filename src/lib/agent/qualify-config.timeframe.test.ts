import { describe, expect, it } from "vitest";
import { TIMEFRAME_OPTIONS } from "./qualify-config";

// Camada 1 (estrutural) — jornada canônica do .docx (2026-05-29).
// O doc define EXATAMENTE 5 opções de prazo, e cada uma mapeia pro eixo
// `objetivo` da Bevi (investimento × contemplacao_rapida).
describe("TIMEFRAME_OPTIONS — jornada do doc + objetivo Bevi", () => {
	it("tem as 5 opções do doc, na ordem", () => {
		expect(TIMEFRAME_OPTIONS.map((t) => t.title)).toEqual([
			"O mais rápido possível",
			"Até 6 meses",
			"1 ano",
			"2 anos ou mais",
			"Sem pressa, quero menor parcela",
		]);
	});

	it("mapeia prazoMeses corretamente", () => {
		const byTitle = Object.fromEntries(TIMEFRAME_OPTIONS.map((t) => [t.title, t.prazoMeses]));
		expect(byTitle["O mais rápido possível"]).toBe(0);
		expect(byTitle["Até 6 meses"]).toBe(6);
		expect(byTitle["1 ano"]).toBe(12);
		expect(byTitle["2 anos ou mais"]).toBe(24);
		expect(byTitle["Sem pressa, quero menor parcela"]).toBe(120);
	});

	it("deriva objetivo Bevi: pressa => contemplacao_rapida; sem pressa => investimento", () => {
		const byTitle = Object.fromEntries(TIMEFRAME_OPTIONS.map((t) => [t.title, t.objetivo]));
		expect(byTitle["O mais rápido possível"]).toBe("contemplacao_rapida");
		expect(byTitle["Até 6 meses"]).toBe("contemplacao_rapida");
		expect(byTitle["1 ano"]).toBe("contemplacao_rapida");
		expect(byTitle["2 anos ou mais"]).toBe("contemplacao_rapida");
		expect(byTitle["Sem pressa, quero menor parcela"]).toBe("investimento");
	});

	it("tokens são únicos e estáveis (replyId WhatsApp depende disso)", () => {
		const tokens = TIMEFRAME_OPTIONS.map((t) => t.token);
		expect(new Set(tokens).size).toBe(tokens.length);
	});
});
