// @vitest-environment happy-dom
/**
 * O botão que liga os avisos, do ponto de vista de quem está travado nele.
 *
 * O defeito que originou estes testes: a atendente dizia "não consigo ativar a
 * notificação" e não havia o que olhar. O botão RETORNAVA NULL quando o
 * navegador não tinha a API — some da tela, sem uma palavra, e do lado de cá sem
 * nenhum registro. Aqui se prende o contrário: todo estado se explica na tela e
 * deixa rastro no log.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ registrar: vi.fn() }));
vi.mock("@/lib/telemetry/diagnostico-notificacoes", async (original) => ({
	...(await original<Record<string, unknown>>()),
	registrarDiagnostico: mocks.registrar,
}));

import { BotaoNotificacoes } from "./botao-notificacoes";

class NotificationFake {
	static permission: NotificationPermission = "default";
	static requestPermission = vi.fn(async () => NotificationFake.permission);
	close() {}
}

function instalarNotification(permissao: NotificationPermission) {
	NotificationFake.permission = permissao;
	NotificationFake.requestPermission = vi.fn(async () => NotificationFake.permission);
	(globalThis as { Notification?: unknown }).Notification = NotificationFake;
}

function contextoSeguro(valor: boolean) {
	Object.defineProperty(window, "isSecureContext", { configurable: true, get: () => valor });
}

function etapas() {
	return mocks.registrar.mock.calls.map((c) => c[0]);
}

beforeEach(() => {
	mocks.registrar.mockClear();
	contextoSeguro(true);
	instalarNotification("default");
});

afterEach(() => {
	cleanup();
	(globalThis as { Notification?: unknown }).Notification = undefined;
	// Sem isto, um teste que falha ANTES de restaurar os timers deixa os fake
	// timers ligados e o teste seguinte estoura por timeout — erro que aponta pro
	// lugar errado.
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("BotaoNotificacoes", () => {
	it("registra o ambiente ao montar — é o retrato de quem está com o problema", async () => {
		render(<BotaoNotificacoes />);
		await waitFor(() => expect(etapas()).toContain("montagem"));
	});

	it("navegador sem a API DIZ o motivo em vez de sumir da tela", async () => {
		(globalThis as { Notification?: unknown }).Notification = undefined;
		contextoSeguro(false);

		render(<BotaoNotificacoes />);

		const aviso = await screen.findByTestId("notificacoes-indisponiveis");
		expect(aviso.textContent ?? "").toMatch(/HTTPS|endereço seguro/i);
	});

	it("permissão já concedida mostra que está ligado", async () => {
		instalarNotification("granted");
		render(<BotaoNotificacoes />);
		expect(await screen.findByTestId("notificacoes-ativas")).toBeTruthy();
	});

	it("bloqueado pelo navegador explica o caminho do cadeado", async () => {
		instalarNotification("denied");
		render(<BotaoNotificacoes />);
		const aviso = await screen.findByTestId("notificacoes-bloqueadas");
		expect(aviso.getAttribute("title") ?? "").toMatch(/cadeado/i);
	});

	it("o clique registra o pedido e o que o navegador respondeu", async () => {
		render(<BotaoNotificacoes />);
		const botao = await screen.findByTestId("ativar-notificacoes");

		fireEvent.click(botao);

		await waitFor(() => expect(etapas()).toContain("clique"));
	});

	/**
	 * Achado da pilotagem em ambiente real: clicado o botão, o Chrome pode
	 * SUPRIMIR o pedido (o "quiet UI", que ele liga justamente pra quem costuma
	 * bloquear notificações). A promise nunca resolve, e o botão ficava
	 * desabilitado em "Pedindo permissão…" pro resto da sessão — a descrição
	 * literal do "cliquei e não consigo ativar".
	 */
	it("navegador que engole o pedido não deixa o botão travado pra sempre", async () => {
		vi.useFakeTimers();
		NotificationFake.requestPermission = vi.fn(
			() => new Promise(() => {}),
		) as unknown as typeof NotificationFake.requestPermission;

		render(<BotaoNotificacoes />);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});

		const botao = screen.getByTestId("ativar-notificacoes") as HTMLButtonElement;
		fireEvent.click(botao);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(botao.disabled).toBe(true);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(25_000);
		});

		expect((screen.getByTestId("ativar-notificacoes") as HTMLButtonElement).disabled).toBe(false);
		expect(screen.getByTestId("notificacoes-sem-resposta")).toBeTruthy();
		const registros = mocks.registrar.mock.calls.filter((c) => c[0] === "permissao");
		expect(
			registros.some((c) => (c[1] as Record<string, unknown>)?.resultado === "sem-resposta"),
		).toBe(true);
		vi.useRealTimers();
	});

	it("bloqueio em página sem HTTPS não manda a pessoa pro cadeado à toa", async () => {
		instalarNotification("denied");
		contextoSeguro(false);

		render(<BotaoNotificacoes />);

		const aviso = await screen.findByTestId("notificacoes-bloqueadas");
		expect(aviso.textContent ?? "").toMatch(/HTTPS|endereço seguro/i);
	});

	it("pedido que estoura não derruba o painel — o botão continua na tela", async () => {
		NotificationFake.requestPermission = vi.fn(() => {
			throw new Error("bloqueado por política");
		}) as unknown as typeof NotificationFake.requestPermission;

		render(<BotaoNotificacoes />);
		const botao = await screen.findByTestId("ativar-notificacoes");
		fireEvent.click(botao);

		await waitFor(() => expect(screen.queryByTestId("notificacoes-bloqueadas")).toBeTruthy());
	});
});
