// @vitest-environment happy-dom
// O visualizador ÚNICO de conversa do admin (B6 / A2+A3+A4).
//
// Três invariantes que antes não existiam:
//   • o marcador cru `[card: tipo]` NUNCA chega à tela — vira card (payload) ou
//     rótulo humano em português;
//   • a ordem é `createdAt`, com desempate estável por ordem de chegada;
//   • a conversa é lida como o cliente viu (bolhas, lado, anexo, template).

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Conversa, type MensagemDaConversa, ordenarMensagens, tipoDeCard } from "./conversa";

afterEach(cleanup);

function msg(over: Partial<MensagemDaConversa> = {}): MensagemDaConversa {
	return {
		id: "m1",
		role: "user",
		content: "Oi",
		createdAt: new Date("2026-10-05T12:00:00Z").toISOString(),
		...over,
	};
}

describe("marcador de card", () => {
	it("tipoDeCard reconhece o marcador e ignora fala comum", () => {
		expect(tipoDeCard("[card: telefone_do_desbloqueio]")).toBe("telefone_do_desbloqueio");
		expect(tipoDeCard("  [card: comparison_table]  ")).toBe("comparison_table");
		expect(tipoDeCard("quero um carro")).toBeNull();
		// Só o marcador inteiro conta: texto junto não é card.
		expect(tipoDeCard("olha o [card: x] aqui")).toBeNull();
	});

	it("SEM payload: mostra o rótulo humano e NUNCA o identificador cru", () => {
		render(
			<Conversa
				mensagens={[msg({ role: "assistant", content: "[card: telefone_do_desbloqueio]" })]}
			/>,
		);

		expect(screen.getByText("Pediu o WhatsApp para liberar a comparação")).toBeDefined();
		expect(screen.queryByText(/\[card:/)).toBeNull();
		expect(screen.queryByText(/telefone_do_desbloqueio/)).toBeNull();
	});

	it("COM payload: reconstrói o card a partir dos fatos do artifact", () => {
		render(
			<Conversa
				mensagens={[
					msg({
						role: "assistant",
						content: "[card: recommendation_card]",
						artifacts: [
							{
								id: "a1",
								type: "recommendation_card",
								payload: {
									administradora: "Itaú",
									creditValue: 400000,
									monthlyPayment: 2000,
									termMonths: 200,
								},
							},
						],
					}),
				]}
			/>,
		);

		const card = screen.getByTestId("card-legivel");
		expect(card.getAttribute("data-tipo")).toBe("recommendation_card");
		expect(screen.getByText("Mostrou a recomendação de grupo")).toBeDefined();
		// Os números do payload aparecem — o card é legível, não só um rótulo.
		expect(card.textContent).toContain("Itaú");
		expect(screen.queryByText(/\[card:/)).toBeNull();
	});

	it("tipo desconhecido cai em rótulo genérico, nunca no `type`", () => {
		render(<Conversa mensagens={[msg({ role: "assistant", content: "[card: invencao_nova]" })]} />);
		expect(screen.getByText("Card enviado ao cliente")).toBeDefined();
		expect(screen.queryByText(/invencao_nova/)).toBeNull();
	});
});

describe("ordem determinística", () => {
	it("ordena por createdAt mesmo com o lote fora de ordem", () => {
		const lote = [
			msg({ id: "c", content: "terceira", createdAt: "2026-10-05T12:00:02.000Z" }),
			msg({ id: "a", content: "primeira", createdAt: "2026-10-05T12:00:00.000Z" }),
			msg({ id: "b", content: "segunda", createdAt: "2026-10-05T12:00:01.000Z" }),
		];
		render(<Conversa mensagens={lote} />);
		const texto = screen.getByTestId("conversa").textContent ?? "";
		expect(texto.indexOf("primeira")).toBeLessThan(texto.indexOf("segunda"));
		expect(texto.indexOf("segunda")).toBeLessThan(texto.indexOf("terceira"));
	});

	it("no empate, mantém a ordem de chegada do servidor (desempate estável)", () => {
		const lote = [
			msg({ id: "z", content: "antes", createdAt: "2026-10-05T12:00:00.000Z" }),
			msg({ id: "y", content: "depois", createdAt: "2026-10-05T12:00:00.000Z" }),
		];
		expect(ordenarMensagens(lote).map((m) => m.id)).toEqual(["z", "y"]);
		// Estável e não-mutável: o lote original fica intacto.
		expect(lote.map((m) => m.id)).toEqual(["z", "y"]);
	});

	it("não usa `id` (uuid aleatório) como desempate", () => {
		const lote = [
			msg({ id: "zzz", content: "x", createdAt: "2026-10-05T12:00:00.000Z" }),
			msg({ id: "aaa", content: "y", createdAt: "2026-10-05T12:00:00.000Z" }),
		];
		// `id` ordenaria "aaa" antes de "zzz" — a ordem de chegada é que manda.
		expect(ordenarMensagens(lote).map((m) => m.id)).toEqual(["zzz", "aaa"]);
	});
});

describe("visão de conversa no estilo WhatsApp", () => {
	it("mostra o que cliente e empresa disseram", () => {
		render(
			<Conversa
				modo="whatsapp"
				mensagens={[
					msg({ id: "m1", role: "user", content: "Quero um carro" }),
					msg({ id: "m2", role: "assistant", content: "Que carro você tem em mente?" }),
				]}
			/>,
		);

		expect(screen.getByText("Quero um carro")).toBeDefined();
		expect(screen.getByText("Que carro você tem em mente?")).toBeDefined();
		expect(screen.getByTestId("conversa").getAttribute("data-modo")).toBe("whatsapp");
	});

	it("card no WhatsApp aparece como rótulo, não como `[card: …]`", () => {
		render(
			<Conversa
				modo="whatsapp"
				mensagens={[msg({ role: "assistant", content: "[card: telefone_do_desbloqueio]" })]}
			/>,
		);
		expect(screen.getByText("Pediu o WhatsApp para liberar a comparação")).toBeDefined();
		expect(screen.queryByText(/\[card:/)).toBeNull();
	});

	it("não mostra mensagem de sistema — o cliente nunca viu isso", () => {
		render(
			<Conversa
				modo="whatsapp"
				mensagens={[
					msg({ id: "m1", role: "system", content: "gate=desire modelAsked=false" }),
					msg({ id: "m2", role: "user", content: "Oi" }),
				]}
			/>,
		);

		expect(screen.queryByText(/gate=desire/)).toBeNull();
		expect(screen.getByText("Oi")).toBeDefined();
	});

	it("conversa só de mensagens de sistema aparece como vazia, não como quebrada", () => {
		render(<Conversa modo="whatsapp" mensagens={[msg({ role: "system", content: "trace" })]} />);

		expect(screen.getByText(/nenhuma mensagem/i)).toBeDefined();
	});

	it("imagem recebida vira <img> apontando pro endpoint que assina na hora", () => {
		render(
			<Conversa
				modo="whatsapp"
				mensagens={[
					msg({ id: "abc", role: "user", content: "segue o documento", mediaType: "image" }),
				]}
			/>,
		);

		const img = screen.getByRole("img") as HTMLImageElement;
		// Nunca uma URL assinada guardada: sempre o endpoint, que assina no clique.
		expect(img.getAttribute("src")).toBe("/api/admin/messages/abc/media");
	});

	it("documento vira link com o nome do arquivo", () => {
		render(
			<Conversa
				modo="whatsapp"
				mensagens={[
					msg({
						id: "doc1",
						role: "assistant",
						content: "Segue o boleto",
						mediaType: "document",
						mediaFilename: "boleto-agosto.pdf",
					}),
				]}
			/>,
		);

		expect(screen.getByText("boleto-agosto.pdf")).toBeDefined();
		const link = screen.getByRole("link") as HTMLAnchorElement;
		expect(link.getAttribute("href")).toBe("/api/admin/messages/doc1/media");
	});

	it("áudio sem nome de arquivo ainda é identificável", () => {
		render(
			<Conversa modo="whatsapp" mensagens={[msg({ id: "a1", mediaType: "audio", content: "" })]} />,
		);

		expect(screen.getByText("Áudio")).toBeDefined();
	});

	it("mensagem sem anexo não inventa link", () => {
		render(<Conversa modo="whatsapp" mensagens={[msg({ content: "só texto" })]} />);

		expect(screen.queryByRole("link")).toBeNull();
		expect(screen.queryByRole("img")).toBeNull();
	});
});
