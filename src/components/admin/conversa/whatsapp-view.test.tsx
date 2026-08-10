// @vitest-environment happy-dom
// A visão de atendimento: a conversa como o CLIENTE a viu.
//
// O que se assere aqui é trajetória e lado — quem falou, o que apareceu, o anexo
// existe e aponta pro lugar certo. Nada de prosa do agente: o texto é dele.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { type MensagemDaConversa, WhatsAppView } from "./whatsapp-view";

afterEach(cleanup);

function msg(over: Partial<MensagemDaConversa> = {}): MensagemDaConversa {
	return {
		id: "m1",
		role: "user",
		content: "Oi",
		createdAt: new Date("2026-08-10T12:00:00Z").toISOString(),
		...over,
	};
}

describe("visão de conversa no estilo WhatsApp", () => {
	it("mostra o que cliente e empresa disseram", () => {
		render(
			<WhatsAppView
				mensagens={[
					msg({ id: "m1", role: "user", content: "Quero um carro" }),
					msg({ id: "m2", role: "assistant", content: "Que carro você tem em mente?" }),
				]}
			/>,
		);

		expect(screen.getByText("Quero um carro")).toBeDefined();
		expect(screen.getByText("Que carro você tem em mente?")).toBeDefined();
	});

	it("não mostra mensagem de sistema — o cliente nunca viu isso", () => {
		render(
			<WhatsAppView
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
		render(<WhatsAppView mensagens={[msg({ role: "system", content: "trace interno" })]} />);

		expect(screen.getByText(/nenhuma mensagem/i)).toBeDefined();
	});

	it("imagem recebida vira <img> apontando pro endpoint que assina na hora", () => {
		render(
			<WhatsAppView
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
			<WhatsAppView
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
		render(<WhatsAppView mensagens={[msg({ id: "a1", mediaType: "audio", content: "" })]} />);

		expect(screen.getByText("Áudio")).toBeDefined();
	});

	it("mensagem sem anexo não inventa link", () => {
		render(<WhatsAppView mensagens={[msg({ content: "só texto" })]} />);

		expect(screen.queryByRole("link")).toBeNull();
		expect(screen.queryByRole("img")).toBeNull();
	});
});
