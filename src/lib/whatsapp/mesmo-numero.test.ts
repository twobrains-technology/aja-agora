/**
 * O mesmo humano virou dois contatos e duas conversas em prod (2026-08-10)
 * porque o telefone chega em formatos diferentes de cada fonte — e o wa_id da
 * Meta para número brasileiro vem SEM o nono dígito.
 *
 * Consequência prática: o atendente abria o card, o sistema dizia "janela
 * fechada, mande um template", e o cliente estava conversando com o agente
 * naquele minuto pelo WhatsApp.
 */
import { describe, expect, it } from "vitest";
import { chaveTelefoneBR, mesmoNumero } from "./mesmo-numero";

describe("chave de telefone BR", () => {
	it("junta os três formatos do MESMO número — o caso que quebrou em prod", () => {
		// digitado na web / wa_id da Meta / contato criado pelo webhook
		expect(chaveTelefoneBR("62992496793")).toBe("6292496793");
		expect(chaveTelefoneBR("556292496793")).toBe("6292496793");
		expect(chaveTelefoneBR("6292496793")).toBe("6292496793");
	});

	it("ignora pontuação e espaço", () => {
		expect(chaveTelefoneBR("+55 (62) 99249-6793")).toBe("6292496793");
	});

	it("não corta o '55' quando ele é DDD, não código de país", () => {
		// Santa Maria-RS: 55 99999-8888 — cortar o "55" mutilaria o número.
		expect(chaveTelefoneBR("55999998888")).toBe("5599998888");
	});

	it("recusa o que não é telefone BR", () => {
		expect(chaveTelefoneBR("123")).toBeNull();
		expect(chaveTelefoneBR("")).toBeNull();
		expect(chaveTelefoneBR(null)).toBeNull();
	});
});

describe("mesmo número", () => {
	it("reconhece o par que o sistema tratava como duas pessoas", () => {
		expect(mesmoNumero("62992496793", "556292496793")).toBe(true);
	});

	it("números diferentes continuam diferentes", () => {
		expect(mesmoNumero("62992496793", "62992496794")).toBe(false);
	});

	it("sem telefone não há igualdade — nulo não casa com nulo", () => {
		expect(mesmoNumero(null, null)).toBe(false);
	});
});
