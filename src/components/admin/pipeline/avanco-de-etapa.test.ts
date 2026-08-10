// Arrastar não pode ser o ÚNICO jeito de mover um card.
//
// O drag-and-drop do kanban é bonito no mouse e falha em todo o resto: teclado,
// leitor de tela, tela pequena, touch impreciso. Para o admin isso era um
// incômodo; para a `mesa_externa` é bloqueio de trabalho — fechar o caso como
// ganho é literalmente a única coisa que ela precisa fazer no painel.
//
// Daí um botão explícito de avanço, com os destinos calculados aqui: quais
// etapas ficam À FRENTE da atual, dentro do que aquela pessoa enxerga.

import { describe, expect, it } from "vitest";
import { destinosDeAvanco } from "./avanco-de-etapa";

const RAIAS_DA_MESA = ["em_atendimento", "aguardando_pagamento", "fechado_ganho"];

describe("destinos de avanço oferecidos num card", () => {
	it("da primeira etapa, oferece todas as seguintes", () => {
		expect(destinosDeAvanco(RAIAS_DA_MESA, "em_atendimento")).toEqual([
			"aguardando_pagamento",
			"fechado_ganho",
		]);
	});

	it("do meio, oferece só o que falta", () => {
		expect(destinosDeAvanco(RAIAS_DA_MESA, "aguardando_pagamento")).toEqual(["fechado_ganho"]);
	});

	it("na última etapa não há para onde avançar", () => {
		expect(destinosDeAvanco(RAIAS_DA_MESA, "fechado_ganho")).toEqual([]);
	});

	it("nunca oferece voltar", () => {
		const destinos = destinosDeAvanco(RAIAS_DA_MESA, "aguardando_pagamento");
		expect(destinos).not.toContain("em_atendimento");
	});

	it("etapa fora da lista visível não oferece nada — não inventa caminho", () => {
		expect(destinosDeAvanco(RAIAS_DA_MESA, "novo")).toEqual([]);
	});

	it("respeita a lista recebida, seja ela qual for (o servidor é quem manda)", () => {
		// Admin recebe o funil inteiro: o avanço acompanha.
		const funilInteiro = ["novo", "engajado", "qualificado"];
		expect(destinosDeAvanco(funilInteiro, "novo")).toEqual(["engajado", "qualificado"]);
	});

	it("lista vazia não quebra", () => {
		expect(destinosDeAvanco([], "em_atendimento")).toEqual([]);
	});
});
