import { describe, expect, it } from "vitest";
import { criarFilaDuble } from "./fila-duble";

describe("criarFilaDuble", () => {
	it("0 atendentes → semAtendentes", () => {
		const f = criarFilaDuble({ atendentes: 0 });
		expect(f.chamar({ conversationId: "c1", resumo: "r" })).toEqual({
			notificados: 0,
			semAtendentes: true,
		});
	});
	it("2 atendentes → notifica 2", () => {
		const f = criarFilaDuble({ atendentes: 2 });
		expect(f.chamar({ conversationId: "c1", resumo: "r" })).toEqual({
			notificados: 2,
			semAtendentes: false,
		});
		expect(f.atendentes()).toBe(2);
	});
	it("registra chamadas na ordem com o relógio injetado", () => {
		const f = criarFilaDuble({ atendentes: 1, agora: () => new Date("2026-11-04T03:00:00Z") });
		f.chamar({ conversationId: "a", resumo: "1" });
		f.chamar({ conversationId: "b", resumo: "2" });
		expect(f.chamadas().map((c) => c.conversationId)).toEqual(["a", "b"]);
		expect(f.chamadas()[0]?.quando).toBe("2026-11-04T03:00:00.000Z");
	});
	it("horaLocal devolve horaFixa ou null", () => {
		expect(criarFilaDuble({ atendentes: 0, horaFixa: "03:00" }).horaLocal()).toBe("03:00");
		expect(criarFilaDuble({ atendentes: 0 }).horaLocal()).toBeNull();
	});
});
