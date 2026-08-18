// Produção, 2026-08-18 — o cliente mandou o documento e o atendente nunca viu.
//
// A conversa estava em atendimento humano e funcionava: cada texto do cliente
// virava `[whatsapp-proxy] User→AllAttendants`. Às 20:10:05 chegou um
// `type: document` e não houve relay nenhum — nem às 20:23:23 (outro documento),
// nem às 20:24:00 (uma imagem). No mesmo instante o log registrava
// `[media-inbound] mídia sem conversa correspondente — ignorada`, enquanto o
// `updateLastInboundAt` do MESMO webhook achava duas conversas para o telefone.
//
// São duas falhas empilhadas, e as duas moram no `case "image"/"document"` do
// webhook:
//
//  1. `registrarMidiaRecebida` e `handleDocumentInbound` procuravam a conversa
//     por igualdade exata de `wa_id`, enquanto o resto do sistema (janela de
//     24h, trava do agente, destino do envio) já resolve por `chaveTelefoneBR`.
//     O wa_id que a Meta devolve para número BR não traz o nono dígito; o que a
//     web gravou traz. A mídia caía no chão e nem o painel a mostrava.
//  2. Nada naquele caminho pergunta QUEM RESPONDE. O texto passa por
//     `relayUserToAgent`; a mídia não passava por lugar nenhum — e ainda deixava
//     o agente responder "manda um oi que eu começo com você" por cima do
//     humano que estava atendendo.
//
// O invariante que este teste fixa: mídia do cliente é uma fala como outra
// qualquer. Ela entra no histórico da conversa da PESSOA e, havendo atendimento
// humano, chega ao atendente — com o arquivo, não com um aviso.

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** Tudo que saiu para a Meta neste teste — cliente e atendente. */
const enviados: Array<{ tipo: string; para: string; texto?: string; link?: string }> = [];

vi.mock("./api", async (original) => {
	const real = (await original()) as Record<string, unknown>;
	return {
		...real,
		sendTextMessage: vi.fn(async (para: string, texto: string) => {
			enviados.push({ tipo: "text", para, texto });
			return { messageId: `mock-${crypto.randomUUID()}` };
		}),
		sendImageMessage: vi.fn(async (para: string, link: string, texto?: string) => {
			enviados.push({ tipo: "image", para, link, texto });
			return { messageId: `mock-${crypto.randomUUID()}` };
		}),
		sendDocumentMessage: vi.fn(
			async (para: string, link: string, filename: string, texto?: string) => {
				enviados.push({ tipo: "document", para, link, texto: texto ?? filename });
				return { messageId: `mock-${crypto.randomUUID()}` };
			},
		),
		sendAudioMessage: vi.fn(async (para: string, link: string) => {
			enviados.push({ tipo: "audio", para, link });
			return { messageId: `mock-${crypto.randomUUID()}` };
		}),
	};
});

describeIfDb("mídia do cliente chega ao atendente (prod 2026-08-18)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let midia: typeof import("./midia-do-cliente");
	let proxy: typeof import("./proxy");

	const convIds: string[] = [];
	const userIds: string[] = [];
	const ATENDENTE_ID = `midia-atendente-${crypto.randomUUID()}`;
	const ATENDENTE_FONE = "5562990001122";

	/** Os bytes nunca vêm da Meta aqui: o que se prova é o roteamento. */
	const guardados: Array<{ key: string; mimeType: string }> = [];
	const deps = {
		baixar: async () => ({ bytes: new Uint8Array([1, 2, 3]), mimeType: "application/pdf" }),
		guardar: async (key: string, _bytes: Uint8Array, mimeType: string) => {
			guardados.push({ key, mimeType });
		},
		assinarLink: async (key: string) => `https://storage.local/${key}?assinado=1`,
	};

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		midia = await import("./midia-do-cliente");
		proxy = await import("./proxy");

		await db.insert(schema.user).values({
			id: ATENDENTE_ID,
			name: "Atendente da Mesa",
			email: `${ATENDENTE_ID}@teste.local`,
			role: "attendant",
			phone: ATENDENTE_FONE,
			isActive: true,
		});
		userIds.push(ATENDENTE_ID);
		// O cache de atendentes é in-process e dura 60s — sem invalidar, o relay
		// mediria uma lista carregada por outro teste.
		proxy.invalidateAttendantCache();
	});

	afterAll(async () => {
		if (convIds.length > 0) {
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
		if (userIds.length > 0) {
			await db.delete(schema.user).where(inArray(schema.user.id, userIds));
		}
	});

	beforeEach(() => {
		enviados.length = 0;
		guardados.length = 0;
	});

	async function semear(waId: string, status: "active" | "handed_off", reivindicada = true) {
		const [conv] = await db
			.insert(schema.conversations)
			.values({
				waId,
				status,
				channel: "whatsapp",
				contactName: "Aninha",
				handedOffUserId: status === "handed_off" && reivindicada ? ATENDENTE_ID : null,
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

	it("o documento enviado durante o atendimento chega ao WhatsApp do atendente", async () => {
		const conv = await semear("5511998164144", "handed_off");

		await midia.receberMidiaDoCliente(
			{
				from: "5511998164144",
				mediaId: "media-doc-1",
				tipo: "document",
				filename: "holerite-julho.pdf",
			},
			deps,
		);

		const paraAtendente = enviados.filter((e) => e.para === ATENDENTE_FONE);
		expect(paraAtendente).toHaveLength(1);
		expect(paraAtendente[0].tipo).toBe("document");
		// O arquivo de verdade, não um aviso de que existe um arquivo.
		expect(paraAtendente[0].link).toContain("https://storage.local/");
		// Sem o nome de quem mandou, o atendente não sabe de qual cliente é.
		expect(paraAtendente[0].texto).toContain("Aninha");

		// E fica no histórico, que é o que o painel mostra.
		const msgs = await mensagensDe(conv.id);
		expect(msgs).toHaveLength(1);
		expect(msgs[0].role).toBe("user");
		expect(msgs[0].mediaType).toBe("document");
		expect(msgs[0].mediaFilename).toBe("holerite-julho.pdf");
		expect(msgs[0].mediaKey).toBeTruthy();
		expect(guardados).toHaveLength(1);
	});

	it("com humano atendendo, o agente não fala com o cliente", async () => {
		await semear("5511997770001", "handed_off");

		await midia.receberMidiaDoCliente(
			{ from: "5511997770001", mediaId: "media-doc-2", tipo: "image" },
			deps,
		);

		const paraOCliente = enviados.filter((e) => e.para === "5511997770001");
		expect(paraOCliente).toHaveLength(0);
	});

	// O cenário do incidente entra pelo ramo do atendimento humano, onde quem casa
	// o telefone é o `quemRespondePara` — que já resolvia por chave ANTES deste
	// fix. Quem passou a resolver por chave é o ramo do AGENTE (`conversaDoNumero`,
	// e o `loadConversation` do KYC), e é ele que este teste tem que exercitar:
	// sem o caso abaixo, restaurar a igualdade exata deixava a suíte verde.
	it("sem handoff, o nono dígito também não pode fazer a mídia sumir", async () => {
		const conv = await semear("62998887711", "active");
		const kyc = vi.fn(async () => {});

		await midia.receberMidiaDoCliente(
			{ from: "556298887711", mediaId: "media-doc-9", tipo: "document", filename: "rg.pdf" },
			{ ...deps, kyc },
		);

		const msgs = await mensagensDe(conv.id);
		expect(msgs).toHaveLength(1);
		expect(msgs[0].mediaFilename).toBe("rg.pdf");
		expect(kyc).toHaveBeenCalledTimes(1);
	});

	it("o nono dígito do wa_id não pode fazer a mídia sumir", async () => {
		// A conversa nasceu pela web, com o número que o cliente digitou…
		const conv = await semear("62992496793", "handed_off");

		// …e a Meta entrega o inbound no formato legado, sem o nono dígito.
		await midia.receberMidiaDoCliente(
			{
				from: "556292496793",
				mediaId: "media-doc-3",
				tipo: "document",
				filename: "cnh.pdf",
				caption: "segue meu documento",
			},
			deps,
		);

		const msgs = await mensagensDe(conv.id);
		expect(msgs).toHaveLength(1);
		expect(msgs[0].content).toBe("segue meu documento");
		expect(enviados.filter((e) => e.para === ATENDENTE_FONE)).toHaveLength(1);
	});

	it("sem atendimento humano, a mídia entra no histórico e o agente segue com o KYC", async () => {
		const conv = await semear("5511995550002", "active");
		const kyc = vi.fn(async () => {});

		await midia.receberMidiaDoCliente(
			{ from: "5511995550002", mediaId: "media-doc-4", tipo: "image" },
			{
				...deps,
				// O mime baixado é a palavra final sobre o tipo — o `type` do webhook
				// é só o que a Meta declarou.
				baixar: async () => ({ bytes: new Uint8Array([1]), mimeType: "image/jpeg" }),
				kyc,
			},
		);

		expect(kyc).toHaveBeenCalledTimes(1);
		const msgs = await mensagensDe(conv.id);
		expect(msgs).toHaveLength(1);
		expect(msgs[0].mediaType).toBe("image");
		// Nenhum atendente recebe nada quando ninguém assumiu o caso.
		expect(enviados.filter((e) => e.para === ATENDENTE_FONE)).toHaveLength(0);
	});

	it("áudio também é fala: entra no histórico e chega ao atendente", async () => {
		const conv = await semear("5511994440003", "handed_off");

		await midia.receberMidiaDoCliente(
			{ from: "5511994440003", mediaId: "media-audio-1", tipo: "audio" },
			{ ...deps, baixar: async () => ({ bytes: new Uint8Array([9]), mimeType: "audio/ogg" }) },
		);

		const msgs = await mensagensDe(conv.id);
		expect(msgs).toHaveLength(1);
		expect(msgs[0].mediaType).toBe("audio");

		const paraAtendente = enviados.filter((e) => e.para === ATENDENTE_FONE);
		// Áudio não aceita legenda na Meta — vai o aviso com o nome e o arquivo.
		expect(paraAtendente.some((e) => e.tipo === "audio")).toBe(true);
		expect(paraAtendente.some((e) => e.tipo === "text" && e.texto?.includes("Aninha"))).toBe(true);
	});

	it("storage fora do ar não pode levar junto o KYC do cliente", async () => {
		await semear("5511992220005", "active");
		const kyc = vi.fn(async () => {});

		await midia.receberMidiaDoCliente(
			{ from: "5511992220005", mediaId: "media-doc-6", tipo: "image" },
			{
				...deps,
				baixar: async () => ({ bytes: new Uint8Array([1]), mimeType: "image/jpeg" }),
				guardar: async () => {
					throw new Error("S3 fora do ar");
				},
				kyc,
			},
		);

		// Antes deste módulo os dois caminhos eram promises independentes: um
		// `putObject` quebrado não impedia a foto do RG de virar slot da proposta.
		expect(kyc).toHaveBeenCalledTimes(1);
	});

	it("storage fora do ar com humano atendendo avisa o atendente", async () => {
		await semear("5511991110006", "handed_off");

		await midia.receberMidiaDoCliente(
			{ from: "5511991110006", mediaId: "media-doc-7", tipo: "document" },
			{
				...deps,
				guardar: async () => {
					throw new Error("S3 fora do ar");
				},
			},
		);

		const paraAtendente = enviados.filter((e) => e.para === ATENDENTE_FONE);
		expect(paraAtendente).toHaveLength(1);
		expect(paraAtendente[0].texto).toContain("não consegui guardar o arquivo");
	});

	it("nome de arquivo quilométrico não derruba o registro nem o relay", async () => {
		const conv = await semear("5511990000007", "handed_off");
		const nomeEnorme = `${"a".repeat(400)}.pdf`;

		await midia.receberMidiaDoCliente(
			{ from: "5511990000007", mediaId: "media-doc-8", tipo: "document", filename: nomeEnorme },
			deps,
		);

		// `mediaFilename` é varchar(255): sem truncar, o insert estoura, a promise
		// rejeita, o webhook engole no catch — e o atendente fica sem nada.
		const msgs = await mensagensDe(conv.id);
		expect(msgs).toHaveLength(1);
		expect(msgs[0].mediaFilename).toHaveLength(255);
		expect(enviados.filter((e) => e.para === ATENDENTE_FONE)).toHaveLength(1);
	});

	it("vídeo entra no histórico como documento e NUNCA no KYC", async () => {
		const conv = await semear("5511989990008", "active");
		const kyc = vi.fn(async () => {});

		await midia.receberMidiaDoCliente(
			{ from: "5511989990008", mediaId: "media-video-1", tipo: "video" },
			{
				...deps,
				baixar: async () => ({ bytes: new Uint8Array([7]), mimeType: "video/mp4" }),
				kyc,
			},
		);

		const msgs = await mensagensDe(conv.id);
		expect(msgs).toHaveLength(1);
		expect(msgs[0].mediaType).toBe("document");
		// Documento de identidade é foto ou PDF — vídeo não vira slot da proposta.
		expect(kyc).not.toHaveBeenCalled();
	});

	it("anexo mandado por um ATENDENTE não é tratado como fala de cliente", async () => {
		const avisar = vi.fn(async (_para: string, _texto: string) => ({}));
		const kyc = vi.fn(async () => {});

		await midia.receberMidiaDoCliente(
			{ from: ATENDENTE_FONE, mediaId: "media-doc-99", tipo: "image" },
			{ ...deps, avisar, kyc },
		);

		expect(kyc).not.toHaveBeenCalled();
		// Ele recebia a copy de cliente: "manda um oi que eu começo com você".
		expect(avisar).toHaveBeenCalledTimes(1);
		expect(avisar.mock.calls[0]?.[1]).toContain("painel");
	});

	it("handoff sem ninguém reivindicando entrega a todos os atendentes ativos", async () => {
		await semear("5511993330004", "handed_off", false);

		await midia.receberMidiaDoCliente(
			{ from: "5511993330004", mediaId: "media-doc-5", tipo: "document", filename: "rg.pdf" },
			deps,
		);

		expect(enviados.filter((e) => e.para === ATENDENTE_FONE)).toHaveLength(1);
	});
});
