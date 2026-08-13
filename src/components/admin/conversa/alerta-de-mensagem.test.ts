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

const mocks = vi.hoisted(() => ({ registrar: vi.fn() }));
vi.mock("@/lib/telemetry/diagnostico-notificacoes", async (original) => ({
	...(await original<Record<string, unknown>>()),
	registrarDiagnostico: mocks.registrar,
}));

import { estadoDaNotificacao, notificarMensagem, pedirPermissao } from "./alerta-de-mensagem";

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
	mocks.registrar.mockClear();
	instalarNotification("granted");
	visibilidade("hidden");
});

/** Etapas registradas com um dado motivo/resultado — o que a gente lê no log. */
function diagnosticos(etapa: string) {
	return mocks.registrar.mock.calls
		.filter((c) => c[0] === etapa)
		.map((c) => (c[1] ?? {}) as Record<string, unknown>);
}

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

/**
 * O aviso pode não sair por meia dúzia de motivos, e TODOS eram mudos: o
 * atendente jurava que ligou, e do nosso lado não havia rastro nenhum. Cada
 * teste aqui prende um desses silêncios virando linha de log.
 */
describe("rastro de por que o aviso não saiu", () => {
	it("aba à vista: a supressão é intencional, mas fica registrada", () => {
		visibilidade("visible");
		notificarMensagem("Neto", "Opa");
		expect(diagnosticos("aviso").some((d) => d.motivo === "aba-visivel")).toBe(true);
	});

	it("sem permissão concedida o motivo aparece — é o caso da atendente travada", () => {
		instalarNotification("denied");
		notificarMensagem("Neto", "Opa");
		expect(diagnosticos("aviso").some((d) => d.motivo === "sem-permissao")).toBe(true);
	});

	it("navegador sem a API registra em vez de sumir calado", () => {
		(globalThis as { Notification?: unknown }).Notification = undefined;
		notificarMensagem("Neto", "Opa");
		expect(diagnosticos("aviso").some((d) => d.motivo === "sem-api")).toBe(true);
	});

	it("construtor que lança (Chrome no Android) vira falha registrada, não tela quebrada", () => {
		class NotificationQueLanca {
			static permission: NotificationPermission = "granted";
			static requestPermission = vi.fn(async () => "granted" as NotificationPermission);
			constructor() {
				throw new TypeError("Illegal constructor");
			}
		}
		(globalThis as { Notification?: unknown }).Notification = NotificationQueLanca;

		expect(() => notificarMensagem("Neto", "Opa")).not.toThrow();
		const falhas = diagnosticos("falha");
		expect(falhas.length).toBeGreaterThan(0);
		expect(String(falhas[0].erro)).toContain("Illegal constructor");
	});
});

describe("pedido de permissão", () => {
	it("devolve o que o navegador respondeu e registra o resultado", async () => {
		instalarNotification("default");
		NotificationFake.requestPermission = vi.fn(async () => "granted" as NotificationPermission);

		await expect(pedirPermissao()).resolves.toBe("granted");
		expect(diagnosticos("permissao").some((d) => d.resultado === "granted")).toBe(true);
	});

	it("Safari antigo responde por CALLBACK, não por promise — e ali ficava travado", async () => {
		instalarNotification("default");
		// A assinatura legada: `requestPermission(cb)` devolve `undefined` e chama o
		// callback. Com `await` direto, o resultado virava `undefined` e o botão
		// ficava num limbo — nem concedido, nem negado.
		NotificationFake.requestPermission = vi.fn((cb?: (p: NotificationPermission) => void) => {
			cb?.("granted");
			return undefined as unknown as Promise<NotificationPermission>;
		}) as unknown as typeof NotificationFake.requestPermission;

		await expect(pedirPermissao()).resolves.toBe("granted");
	});

	it("erro no pedido não estoura na cara do atendente", async () => {
		instalarNotification("default");
		NotificationFake.requestPermission = vi.fn(async () => {
			throw new Error("bloqueado por política");
		}) as unknown as typeof NotificationFake.requestPermission;

		await expect(pedirPermissao()).resolves.toBe("denied");
		expect(diagnosticos("falha").length).toBeGreaterThan(0);
	});
});
