// FIX-268 (rodada 7, veredito Fable r6, residual D4): a pergunta do gate
// `lance` ainda dizia "Você teria uma RESERVA pra dar um lance...". A app
// trata "reserva" como termo sensível — em todo outro ponto do fechamento
// (FIX-234/FIX-256) "reserva"/"reservado" foi varrido por implicar compromisso
// fechado ANTES da contratação real (invariante inviolável). A pergunta do
// gate lance usava a palavra num sentido diferente (dinheiro guardado pro
// lance), mas a ambiguidade com o sentido proibido é exatamente o risco que a
// disciplina "sem 'reserva' pré-contratação" existe pra eliminar.
import { describe, expect, it } from "vitest";
import { gateQuestion } from "./gate-questions";

describe("FIX-268 — gate 'lance' não usa mais 'reserva'", () => {
	it("a pergunta do gate lance não contém a palavra 'reserva'", () => {
		const q = gateQuestion("lance");
		expect(q).not.toBeNull();
		expect(q?.toLowerCase()).not.toMatch(/\breserva/);
	});

	it("segue perguntando sobre a capacidade de dar lance pra antecipar a contemplação", () => {
		const q = gateQuestion("lance");
		expect(q?.toLowerCase()).toMatch(/lance/);
		expect(q?.toLowerCase()).toMatch(/antecip|contemplaç/);
	});
});
