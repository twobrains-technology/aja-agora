/**
 * D6 NO WHATSAPP — O TAP TEM QUE VALER COMO CLIQUE, NÃO COMO TEXTO.
 *
 * Na web, o atalho de escolha virou ação estruturada (`choose_offer`). No
 * WhatsApp o botão devolvia só o TÍTULO como mensagem de texto — e o título é
 * truncado em 20 caracteres pela API. "A de prazo mais curto" tem 21: chega ao
 * servidor como "A de prazo mais curt", o resolvedor não entende, e a porta que
 * o PRD abriu se fecha exatamente no canal de maior volume (revisão de
 * 19/08/2026, P1-2).
 *
 * O `qr_${i}` já identifica QUAL opção foi tocada. Resolvendo o índice contra o
 * `quick_reply` que o servidor emitiu — cujo `groupId` ele mesmo conferiu —, o
 * tap passa a ancorar a cota como o clique da web, sem depender de texto nenhum.
 */

import { describe, expect, it } from "vitest";
import { quickReplyToWhatsApp } from "./formatter";
import { cotaDoTapDeAtalho, idDoAtalho } from "./quick-reply-tap";

const PAYLOAD_COAGIDO = {
	options: [
		{ label: "A de menor parcela", groupId: "itau-158" },
		{ label: "A de prazo mais curto", groupId: "itau-147" },
	],
};

describe("o índice do botão é o do PAYLOAD, não o da lista filtrada", () => {
	it("opção com rótulo vazio não desloca as cotas dos botões seguintes", () => {
		// O formatter descarta rótulos vazios antes de montar os botões — e o
		// índice do id era contado sobre a lista JÁ FILTRADA, enquanto o servidor
		// o resolve contra o payload ORIGINAL. Uma opção vazia no começo (o schema
		// permite string vazia) deslocava tudo: o cliente tocava em "A de menor
		// parcela" e o servidor ancorava a cota da opção anterior. O defeito D7
		// dentro do próprio conserto do D7.
		const payload = {
			options: [
				{ label: "   ", groupId: "itau-158" },
				{ label: "A de menor parcela", groupId: "itau-147" },
				{ label: "A de prazo curto", groupId: "bb-217" },
			],
		};
		const resposta = quickReplyToWhatsApp(payload as never);
		const botoes = (
			resposta as unknown as {
				interactive: { action: { buttons: Array<{ reply: { id: string; title: string } }> } };
			}
		).interactive.action.buttons;

		expect(botoes.map((b) => b.reply.title)).toEqual(["A de menor parcela", "A de prazo curto"]);
		// Cada botão resolve para a cota do rótulo que ele mostra.
		expect(cotaDoTapDeAtalho(botoes[0].reply.id, payload)).toBe("itau-147");
		expect(cotaDoTapDeAtalho(botoes[1].reply.id, payload)).toBe("bb-217");
	});

	it("o formatter usa o MESMO formato de id que o resolvedor (fonte única)", () => {
		const payload = {
			options: [
				{ label: "A de menor parcela", groupId: "itau-158" },
				{ label: "A de prazo curto", groupId: "itau-147" },
			],
		};
		const resposta = quickReplyToWhatsApp(payload as never);
		const botoes = (
			resposta as unknown as {
				interactive: { action: { buttons: Array<{ reply: { id: string } }> } };
			}
		).interactive.action.buttons;
		expect(botoes.map((b) => b.reply.id)).toEqual([idDoAtalho(0, payload), idDoAtalho(1, payload)]);
	});
});

describe("cotaDoTapDeAtalho — o índice do botão resolve a cota", () => {
	it("o tap do atalho ATUAL devolve a cota daquela opção", () => {
		const id = idDoAtalho(1, PAYLOAD_COAGIDO);
		expect(cotaDoTapDeAtalho(id, PAYLOAD_COAGIDO)).toBe("itau-147");
		expect(cotaDoTapDeAtalho(idDoAtalho(0, PAYLOAD_COAGIDO), PAYLOAD_COAGIDO)).toBe("itau-158");
	});

	it("TAP EM ATALHO ANTIGO não resolve contra o atalho novo", () => {
		// Medido pela revisão: turno A oferece [itau-158, itau-147]; a cliente não
		// responde; turno B (busca nova) oferece [bb, porto]; ela rola a conversa e
		// toca no botão do turno A. Com o id carregando só o índice, o servidor
		// resolvia contra o payload de B e ancorava PORTO — o clique virando outra
		// coisa, que é exatamente o defeito D7 do PRD.
		//
		// Conferir o rótulo não salva: dois atalhos de escolha costumam ter os
		// MESMOS rótulos ("A de menor parcela"). O id carrega a assinatura do
		// atalho que o gerou.
		const idDoTurnoA = idDoAtalho(1, PAYLOAD_COAGIDO);
		const atalhoNovo = {
			options: [
				{ label: "A de menor parcela", groupId: "bb-217" },
				{ label: "A de prazo mais curto", groupId: "porto-90" },
			],
		};
		expect(cotaDoTapDeAtalho(idDoTurnoA, atalhoNovo)).toBeNull();
	});

	it("atalho sem cota (texto puro) não ancora nada", () => {
		const semCota = { options: [{ label: "Pode buscar" }, { label: "Me explica" }] };
		expect(cotaDoTapDeAtalho(idDoAtalho(0, semCota), semCota)).toBeNull();
	});

	it("índice fora da lista não inventa cota", () => {
		expect(cotaDoTapDeAtalho(idDoAtalho(7, PAYLOAD_COAGIDO), PAYLOAD_COAGIDO)).toBeNull();
	});

	it("id no formato antigo (sem assinatura) não ancora — só o atalho novo vale", () => {
		expect(cotaDoTapDeAtalho("qr_1", PAYLOAD_COAGIDO)).toBeNull();
	});

	it("id de outro botão do produto não é tap de atalho", () => {
		expect(cotaDoTapDeAtalho("interest_abc", PAYLOAD_COAGIDO)).toBeNull();
		expect(cotaDoTapDeAtalho("decision_contratar", PAYLOAD_COAGIDO)).toBeNull();
	});

	it("sem quick_reply emitido, não há o que resolver", () => {
		expect(cotaDoTapDeAtalho(idDoAtalho(0, PAYLOAD_COAGIDO), null)).toBeNull();
	});
});
