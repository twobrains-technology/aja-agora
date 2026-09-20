// Integração (banco real) — AJA-15: o áudio do cliente vira FALA.
//
// O invariante que este teste fixa: com `TRANSCRICAO_AUDIO_ATIVA=true`, o áudio
// não vira mais a string "Áudio recebido" — vira o texto transcrito, grava
// `metadata.transcricao` e roda um turno do agente pelo MESMO caminho do texto.
// Sem a env, nada muda. O transcritor e os dois turnos entram por `deps`: aqui
// não há rede, nem modelo, nem gateway.
//
// A linha da fala é gravada pelo TURNO (como em produção, onde `persist` grava o
// `userText`), e é o módulo de mídia que anexa o arquivo nela (mediaKey +
// metadata). Por isso o teste conta as linhas de usuário: se o módulo também
// gravasse, o cliente apareceria falando duas vezes.

import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const enviados: Array<{ tipo: string; para: string; texto?: string }> = [];

vi.mock("./api", async (original) => {
	const real = (await original()) as Record<string, unknown>;
	return {
		...real,
		sendTextMessage: vi.fn(async (para: string, texto: string) => {
			enviados.push({ tipo: "text", para, texto });
			return { messageId: `mock-${crypto.randomUUID()}` };
		}),
		sendAudioMessage: vi.fn(async (para: string) => {
			enviados.push({ tipo: "audio", para });
			return { messageId: `mock-${crypto.randomUUID()}` };
		}),
	};
});

describeIfDb("áudio do cliente vira fala (AJA-15)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let midia: typeof import("./midia-do-cliente");

	const convIds: string[] = [];
	const userIds: string[] = [];
	const ATENDENTE_ID = `audio-atendente-${crypto.randomUUID()}`;
	const ATENDENTE_FONE = "5562990007788";

	const BYTES = new Uint8Array([1, 2, 3, 4]);
	const TEXTO = "quero uma cota de moto, uns 80 mil";

	/** Fake de todas as pontas externas — transcritor e os dois turnos. */
	function deps(over: Record<string, unknown> = {}) {
		return {
			baixar: async () => ({ bytes: BYTES, mimeType: "audio/ogg" }),
			guardar: async () => {},
			assinarLink: async (key: string) => `https://storage.local/${key}`,
			transcrever: vi.fn<
				(
					bytes: Uint8Array,
					mimeType: string,
				) => Promise<{ texto: string; modelo: string; duracaoMs: number }>
			>(async () => ({ texto: TEXTO, modelo: "whisper-1", duracaoMs: 12 })),
			responderTexto: vi.fn<(from: string, texto: string) => Promise<void>>(async () => {}),
			responderDiretiva: vi.fn<
				(args: { from: string; conversationId: string; directive: string }) => Promise<void>
			>(async () => {}),
			...over,
		};
	}

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		midia = await import("./midia-do-cliente");
		const proxy = await import("./proxy");

		await db.insert(schema.user).values({
			id: ATENDENTE_ID,
			name: "Atendente de Áudio",
			email: `${ATENDENTE_ID}@teste.local`,
			role: "attendant",
			phone: ATENDENTE_FONE,
			isActive: true,
		});
		userIds.push(ATENDENTE_ID);
		proxy.invalidateAttendantCache();
	});

	afterAll(async () => {
		for (const id of convIds) {
			await db.delete(schema.conversations).where(eq(schema.conversations.id, id));
		}
		for (const id of userIds) {
			await db.delete(schema.user).where(eq(schema.user.id, id));
		}
	});

	beforeEach(() => {
		delete process.env.TRANSCRICAO_AUDIO_ATIVA;
		enviados.length = 0;
	});

	afterEach(() => {
		delete process.env.TRANSCRICAO_AUDIO_ATIVA;
		vi.restoreAllMocks();
	});

	async function semear(waId: string, status: "active" | "handed_off" = "active") {
		const [conv] = await db
			.insert(schema.conversations)
			.values({
				waId,
				status,
				channel: "whatsapp",
				contactName: "Aninha",
				handedOffUserId: status === "handed_off" ? ATENDENTE_ID : null,
			})
			.returning();
		convIds.push(conv.id);
		return conv;
	}

	async function mensagensDe(conversationId: string) {
		return db
			.select()
			.from(schema.messages)
			.where(eq(schema.messages.conversationId, conversationId));
	}

	/** O que o `persist` do grafo faz no fim de um turno: grava a fala do cliente
	 * (sem mídia) e a fala do agente. */
	function turnoQueGrava(convId: string, assistant = "[fake] bora!") {
		return vi.fn(async (_from: string, texto: string) => {
			await db.insert(schema.messages).values({
				conversationId: convId,
				role: "user",
				content: texto,
				channel: "whatsapp",
			});
			await db.insert(schema.messages).values({
				conversationId: convId,
				role: "assistant",
				content: assistant,
				channel: "whatsapp",
			});
		});
	}

	it("flag ligada: transcreve, roda o turno do texto e a fala ganha o áudio", async () => {
		process.env.TRANSCRICAO_AUDIO_ATIVA = "true";
		const conv = await semear("5511991000001");
		const d = deps({ responderTexto: turnoQueGrava(conv.id) });

		await midia.receberMidiaDoCliente(
			{ from: "5511991000001", mediaId: "media-audio-ok", tipo: "audio" },
			d,
		);

		expect(d.transcrever).toHaveBeenCalledWith(BYTES, "audio/ogg");
		expect(d.responderTexto).toHaveBeenCalledTimes(1);
		expect(d.responderTexto).toHaveBeenCalledWith("5511991000001", TEXTO);
		expect(d.responderDiretiva).not.toHaveBeenCalled();

		const msgs = await mensagensDe(conv.id);
		const falasDoCliente = msgs.filter((m) => m.role === "user");
		// UMA linha. Duas significaria o áudio contado em dobro (persist + mídia).
		expect(falasDoCliente).toHaveLength(1);
		expect(falasDoCliente[0].content).toBe(TEXTO);
		expect(falasDoCliente[0].mediaType).toBe("audio");
		expect(falasDoCliente[0].mediaKey).toBeTruthy();
		expect(falasDoCliente[0].mediaMimeType).toBe("audio/ogg");
		expect(falasDoCliente[0].metadata?.transcricao).toMatchObject({
			modelo: "whisper-1",
			duracaoMs: 12,
			bytes: 4,
			mimeType: "audio/ogg",
		});
		// O turno de fato rodou (o efeito do `processTextMessage`).
		expect(msgs.some((m) => m.role === "assistant")).toBe(true);
	});

	it("sem a env, o comportamento é o de antes: 'Áudio recebido' e nenhum turno", async () => {
		const conv = await semear("5511991000002");
		const d = deps();

		await midia.receberMidiaDoCliente(
			{ from: "5511991000002", mediaId: "media-audio-off", tipo: "audio" },
			d,
		);

		expect(d.transcrever).not.toHaveBeenCalled();
		expect(d.responderTexto).not.toHaveBeenCalled();
		expect(d.responderDiretiva).not.toHaveBeenCalled();

		const msgs = await mensagensDe(conv.id);
		expect(msgs).toHaveLength(1);
		expect(msgs[0].role).toBe("user");
		expect(msgs[0].content).toBe("Áudio recebido");
		expect(msgs[0].mediaType).toBe("audio");
		expect(msgs[0].metadata).toBeNull();
	});

	it("transcrição falhou: histórico diz o que houve e o agente recebe o FATO, não a fala", async () => {
		process.env.TRANSCRICAO_AUDIO_ATIVA = "true";
		const conv = await semear("5511991000003");
		const d = deps({
			transcrever: vi.fn(async () => {
				throw new Error("gateway fora do ar");
			}),
		});

		await midia.receberMidiaDoCliente(
			{ from: "5511991000003", mediaId: "media-audio-erro", tipo: "audio" },
			d,
		);

		expect(d.responderTexto).not.toHaveBeenCalled();
		expect(d.responderDiretiva).toHaveBeenCalledTimes(1);
		const nota = d.responderDiretiva.mock.calls[0][0] as { directive: string; from: string };
		expect(nota.from).toBe("5511991000003");
		expect(nota.directive).toMatch(/não pôde ser transcrito/);

		const msgs = await mensagensDe(conv.id);
		expect(msgs).toHaveLength(1);
		expect(msgs[0].content).toBe("Áudio recebido (não foi possível transcrever)");
		expect(msgs[0].mediaType).toBe("audio");
	});

	it("com atendimento humano, transcreve no histórico mas não roda turno", async () => {
		process.env.TRANSCRICAO_AUDIO_ATIVA = "true";
		const conv = await semear("5511991000004", "handed_off");
		const d = deps();

		await midia.receberMidiaDoCliente(
			{ from: "5511991000004", mediaId: "media-audio-humano", tipo: "audio" },
			d,
		);

		expect(d.responderTexto).not.toHaveBeenCalled();
		expect(d.responderDiretiva).not.toHaveBeenCalled();

		const msgs = await mensagensDe(conv.id);
		expect(msgs).toHaveLength(1);
		expect(msgs[0].content).toBe(TEXTO);
		expect(msgs[0].metadata?.transcricao).toBeTruthy();
		// O atendente continua recebendo o arquivo.
		expect(enviados.filter((e) => e.para === ATENDENTE_FONE)).not.toHaveLength(0);
	});

	it("mede bytes e mime do áudio no log — a medição que não existia", async () => {
		const conv = await semear("5511991000005");
		const log = vi.spyOn(console, "log").mockImplementation(() => {});

		await midia.receberMidiaDoCliente(
			{ from: "5511991000005", mediaId: "media-audio-medicao", tipo: "audio" },
			deps(),
		);

		const linhas = log.mock.calls.map((c) => String(c[0]));
		expect(
			linhas.some((l) => l.includes("4 bytes") && l.includes("audio/ogg") && l.includes(conv.id)),
		).toBe(true);
	});
});
