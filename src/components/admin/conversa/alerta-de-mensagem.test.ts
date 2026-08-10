// @vitest-environment happy-dom
/**
 * Regras do aviso de mensagem nova.
 *
 * O som é sintetizado (Web Audio), não o arquivo do WhatsApp — aquele bipe é
 * obra da Meta e não vai no nosso bundle. O que se copia é a função, não o áudio.
 *
 * O que estes testes prendem são as decisões que, erradas, transformam um
 * conforto em incômodo: notificar com a conversa aberta na frente do atendente,
 * ou disparar sem o usuário ter autorizado.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { estadoDaNotificacao, notificarMensagem } from "./alerta-de-mensagem";

class NotificationFake {
	static permission: NotificationPermission = "default";
	static instancias: { titulo: string; opcoes?: NotificationOptions }[] = [];
	onclick: (() => void) | null = null;
	constructor(titulo: string, opcoes?: NotificationOptions) {
		NotificationFake.instancias.push({ titulo, opcoes });
	}
	close() {}
	static requestPermission = vi.fn(async () => NotificationFake.permission);
}

function instalarNotification(permissao: NotificationPermission) {
	NotificationFake.permission = permissao;
	NotificationFake.instancias = [];
	(globalThis as { Notification?: unknown }).Notification = NotificationFake;
}

function visibilidade(estado: DocumentVisibilityState) {
	Object.defineProperty(document, "visibilityState", {
		configurable: true,
		get: () => estado,
	});
}

beforeEach(() => {
	instalarNotification("granted");
	visibilidade("hidden");
});

afterEach(() => {
	(globalThis as { Notification?: unknown }).Notification = undefined;
	vi.restoreAllMocks();
});

describe("notificação de mensagem", () => {
	it("notifica quando a aba está em segundo plano", () => {
		notificarMensagem("Neto", "Opa, tudo certo?");
		expect(NotificationFake.instancias).toHaveLength(1);
		expect(NotificationFake.instancias[0].titulo).toBe("Mensagem de Neto");
		expect(NotificationFake.instancias[0].opcoes?.body).toBe("Opa, tudo certo?");
	});

	it("NÃO notifica com a aba à vista — o atendente já está lendo a conversa", () => {
		visibilidade("visible");
		notificarMensagem("Neto", "Opa");
		expect(NotificationFake.instancias).toHaveLength(0);
	});

	it("não notifica sem permissão concedida", () => {
		instalarNotification("default");
		notificarMensagem("Neto", "Opa");
		expect(NotificationFake.instancias).toHaveLength(0);

		instalarNotification("denied");
		notificarMensagem("Neto", "Opa");
		expect(NotificationFake.instancias).toHaveLength(0);
	});

	it("mensagens do mesmo cliente substituem o balão em vez de empilhar", () => {
		notificarMensagem("Neto", "primeira");
		notificarMensagem("Neto", "segunda");
		const tags = NotificationFake.instancias.map((n) => n.opcoes?.tag);
		expect(tags[0]).toBe(tags[1]);
	});

	it("corpo longo é cortado — balão do sistema não é lugar de texto inteiro", () => {
		notificarMensagem("Neto", "x".repeat(500));
		expect((NotificationFake.instancias[0].opcoes?.body ?? "").length).toBe(140);
	});

	it("o balão é silencioso: o som é o nosso, dois toques soariam quebrado", () => {
		notificarMensagem("Neto", "Opa");
		expect(NotificationFake.instancias[0].opcoes?.silent).toBe(true);
	});

	it("navegador sem Notification não quebra a tela", () => {
		(globalThis as { Notification?: unknown }).Notification = undefined;
		expect(() => notificarMensagem("Neto", "Opa")).not.toThrow();
		expect(estadoDaNotificacao()).toBe("indisponivel");
	});
});
