import { describe, expect, it } from "vitest";
import type { ConversionsConfig } from "./config";
import { type EventoParaEnvio, expirouParaMeta, montarPayload } from "./meta-capi";

const CFG: ConversionsConfig = {
	enabled: true,
	pixelId: "111222333",
	accessToken: "TOKEN",
	apiVersion: "v21.0",
	testEventCode: null,
};

const OCORREU_EM = new Date("2026-08-01T15:30:00Z");

function evento(parcial: Partial<EventoParaEnvio> = {}): EventoParaEnvio {
	return {
		id: "row-1",
		eventName: "contrato_fechado",
		eventKey: "lead-1:contrato_fechado",
		occurredAt: OCORREU_EM,
		value: "85000.00",
		currency: "BRL",
		hashedEmail: "a".repeat(64),
		hashedPhone: "b".repeat(64),
		fbc: "fb.1.1770000000000.IwAR0abc",
		fbp: null,
		ctwaClid: null,
		actionSource: "website",
		...parcial,
	};
}

describe("montarPayload", () => {
	it("traduz o marco interno pro nome que a Meta entende", () => {
		const nomes = ["lead_qualificado", "proposta_criada", "contrato_fechado"].map(
			(eventName) => montarPayload([evento({ eventName })], CFG).data[0].event_name,
		);

		expect(nomes).toEqual(["Lead", "InitiateCheckout", "Purchase"]);
	});

	it("manda event_time em SEGUNDOS", () => {
		// Em milissegundos a Meta lê como um ano absurdo e recusa o evento inteiro.
		const payload = montarPayload([evento()], CFG);

		expect(payload.data[0].event_time).toBe(Math.floor(OCORREU_EM.getTime() / 1000));
		expect(String(payload.data[0].event_time)).toHaveLength(10);
	});

	it("usa a chave do marco como event_id, pra deduplicar com o pixel do navegador", () => {
		expect(montarPayload([evento()], CFG).data[0].event_id).toBe("lead-1:contrato_fechado");
	});

	it("manda e-mail e telefone hasheados dentro de array", () => {
		const userData = montarPayload([evento()], CFG).data[0].user_data;

		expect(userData.em).toEqual(["a".repeat(64)]);
		expect(userData.ph).toEqual(["b".repeat(64)]);
	});

	it("omite identificador ausente em vez de mandar nulo", () => {
		const userData = montarPayload(
			[evento({ hashedEmail: null, hashedPhone: null, fbc: null })],
			CFG,
		).data[0].user_data;

		expect(userData).toEqual({});
	});

	it("manda fbc sem hash — é identificador de clique, não PII", () => {
		const userData = montarPayload([evento()], CFG).data[0].user_data;

		expect(userData.fbc).toBe("fb.1.1770000000000.IwAR0abc");
	});

	describe("Click-to-WhatsApp", () => {
		const ctwa = evento({
			actionSource: "business_messaging",
			ctwaClid: "AfXyZ123",
			fbc: null,
		});

		it("declara o canal de mensageria junto do action_source", () => {
			// Sem os dois, a Meta não liga a conversão ao anúncio de CTWA.
			const linha = montarPayload([ctwa], CFG).data[0];

			expect(linha.action_source).toBe("business_messaging");
			expect(linha).toMatchObject({ messaging_channel: "whatsapp" });
		});

		it("manda o ctwa_clid sem hash", () => {
			expect(montarPayload([ctwa], CFG).data[0].user_data.ctwa_clid).toBe("AfXyZ123");
		});

		it("não declara canal de mensageria numa conversão de site", () => {
			expect(montarPayload([evento()], CFG).data[0]).not.toHaveProperty("messaging_channel");
		});
	});

	describe("valor", () => {
		it("manda o valor como número, não string", () => {
			const customData = montarPayload([evento()], CFG).data[0].custom_data;

			expect(customData).toEqual({ currency: "BRL", value: 85000 });
		});

		it("omite o valor quando o lead não tem crédito definido", () => {
			const customData = montarPayload([evento({ value: null })], CFG).data[0].custom_data;

			expect(customData).toEqual({ currency: "BRL" });
		});

		it("omite valor não numérico em vez de mandar NaN", () => {
			const customData = montarPayload([evento({ value: "n/a" })], CFG).data[0].custom_data;

			expect(customData).toEqual({ currency: "BRL" });
		});
	});

	it("inclui o código de teste só quando ele está configurado", () => {
		expect(montarPayload([evento()], CFG)).not.toHaveProperty("test_event_code");
		expect(montarPayload([evento()], { ...CFG, testEventCode: "TEST123" })).toMatchObject({
			test_event_code: "TEST123",
		});
	});

	it("monta lote com vários eventos numa chamada só", () => {
		const payload = montarPayload([evento(), evento({ eventKey: "lead-2:x" })], CFG);

		expect(payload.data).toHaveLength(2);
	});
});

describe("expirouParaMeta", () => {
	const agora = new Date("2026-08-10T12:00:00Z").getTime();

	it("aceita evento dentro da janela de 7 dias", () => {
		const seisDias = new Date(agora - 6 * 24 * 60 * 60 * 1000);

		expect(expirouParaMeta(evento({ occurredAt: seisDias }), agora)).toBe(false);
	});

	it("recusa evento com mais de 7 dias — a Meta não aceita e insistir é gastar chamada", () => {
		const oitoDias = new Date(agora - 8 * 24 * 60 * 60 * 1000);

		expect(expirouParaMeta(evento({ occurredAt: oitoDias }), agora)).toBe(true);
	});
});
