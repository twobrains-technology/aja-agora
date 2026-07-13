import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { DocumentSlot } from "@/lib/adapters/proposal-gateway";
import type { ConversationMetadata } from "@/lib/agent/personas";
import {
	type DocumentInboundDeps,
	handleDocumentInbound,
	nextDocumentSlot,
} from "./document-inbound";
import { documentUploadToWhatsApp } from "./formatter";

// FIX-122 (D13) — Camada 1 (structural) + comportamento determinístico do
// handler de mídia inbound do WhatsApp. A REGRA de aceite é PARIDADE com o web:
// a foto vai pro MESMO destino (uploadContractDocument), sem redirect.

const readSource = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf-8");

/** Deps-dublê: registra upload/reply/persist sem tocar DB/HTTP. Sobrescrevível. */
function makeDeps(over: Partial<DocumentInboundDeps> = {}): {
	deps: DocumentInboundDeps;
	uploads: Array<{ conversationId: string; input: { slot: DocumentSlot; mimeType: string } }>;
	replies: string[];
	persisted: Array<{ conversationId: string; meta: ConversationMetadata }>;
} {
	const uploads: Array<{
		conversationId: string;
		input: { slot: DocumentSlot; mimeType: string };
	}> = [];
	const replies: string[] = [];
	const persisted: Array<{ conversationId: string; meta: ConversationMetadata }> = [];
	const deps: DocumentInboundDeps = {
		loadConversation: async () => ({ id: "conv-1", meta: {} }),
		persist: async (conversationId, meta) => {
			persisted.push({ conversationId, meta });
		},
		download: async () => ({ bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" }),
		upload: async (conversationId, input) => {
			uploads.push({ conversationId, input: { slot: input.slot, mimeType: input.mimeType } });
			return { ok: true };
		},
		reply: async (_to, text) => {
			replies.push(text);
		},
		...over,
	};
	return { deps, uploads, replies, persisted };
}

describe("FIX-122 structural — webhook trata mídia inbound (não dropa a foto)", () => {
	const src = readSource("src/app/api/webhook/whatsapp/route.ts");

	it('o switch do webhook tem branch para "image"', () => {
		expect(src).toContain('case "image"');
	});

	it('o switch do webhook tem branch para "document"', () => {
		expect(src).toContain('case "document"');
	});

	it("a mídia inbound é delegada ao handleDocumentInbound (não ao default Unhandled)", () => {
		expect(src).toContain("handleDocumentInbound");
	});

	it("a copy documentUploadToWhatsApp continua convidando a foto 'aqui mesmo'", () => {
		const copy = documentUploadToWhatsApp({}).text ?? "";
		expect(copy.toLowerCase()).toContain("aqui mesmo");
	});
});

describe("FIX-122 — nextDocumentSlot (progressão frente → verso, paridade com o web)", () => {
	it("sem nada enviado, o primeiro slot é a frente", () => {
		expect(nextDocumentSlot([])).toBe("identidade_frente");
	});
	it("com a frente enviada, o próximo é o verso", () => {
		expect(nextDocumentSlot(["identidade_frente"])).toBe("identidade_verso");
	});
	it("com frente e verso enviados, não há próximo slot", () => {
		expect(nextDocumentSlot(["identidade_frente", "identidade_verso"])).toBeNull();
	});
});

describe("FIX-122 — handleDocumentInbound (paridade com o web: mesmo uploadContractDocument)", () => {
	it("1ª foto → sobe no slot 'identidade_frente' e pede o verso", async () => {
		const { deps, uploads, replies, persisted } = makeDeps();
		await handleDocumentInbound({ from: "5562999", mediaId: "M1" }, deps);

		expect(uploads).toHaveLength(1);
		expect(uploads[0].conversationId).toBe("conv-1");
		expect(uploads[0].input.slot).toBe("identidade_frente");
		expect(uploads[0].input.mimeType).toBe("image/jpeg");
		// persistiu a progressão do slot
		expect(persisted[0]?.meta.documentSlotsSent).toEqual(["identidade_frente"]);
		// respondeu pedindo o próximo slot (verso) — nunca silêncio
		expect(replies).toHaveLength(1);
		expect(replies[0].toLowerCase()).toContain("verso");
	});

	it("2ª foto (frente já enviada) → sobe no verso e confirma reserva confirmada", async () => {
		const { deps, uploads, replies, persisted } = makeDeps({
			loadConversation: async () => ({
				id: "conv-1",
				meta: { documentSlotsSent: ["identidade_frente"] } as ConversationMetadata,
			}),
		});
		await handleDocumentInbound({ from: "5562999", mediaId: "M2" }, deps);

		expect(uploads[0].input.slot).toBe("identidade_verso");
		expect(persisted[0]?.meta.documentSlotsSent).toEqual([
			"identidade_frente",
			"identidade_verso",
		]);
		// FIX-216 (Ata 2026-07-04): "reserva confirmada", nunca "ficha completa".
		expect(replies[0].toLowerCase()).toContain("confirmada");
	});

	it("foto extra depois de tudo enviado → confirma sem re-subir (idempotente)", async () => {
		const { deps, uploads, replies } = makeDeps({
			loadConversation: async () => ({
				id: "conv-1",
				meta: {
					documentSlotsSent: ["identidade_frente", "identidade_verso"],
				} as ConversationMetadata,
			}),
		});
		await handleDocumentInbound({ from: "5562999", mediaId: "M3" }, deps);

		expect(uploads).toHaveLength(0); // não re-sobe
		expect(replies).toHaveLength(1); // mas responde (nunca silêncio)
		expect(replies[0].toLowerCase()).toContain("confirmada");
	});

	it("download da mídia falha → responde amigável, sem chamar upload", async () => {
		const { deps, uploads, replies } = makeDeps({
			download: async () => {
				throw new Error("graph 404");
			},
		});
		await handleDocumentInbound({ from: "5562999", mediaId: "M4" }, deps);

		expect(uploads).toHaveLength(0);
		expect(replies).toHaveLength(1);
		expect(replies[0].length).toBeGreaterThan(0); // nunca silêncio
	});

	it("uploadContractDocument lança (sem proposta em 'documentos') → resposta amigável, nunca silêncio", async () => {
		const { deps, replies, persisted } = makeDeps({
			upload: async () => {
				throw new Error("Sem links de documento — finalize a escolha da oferta antes.");
			},
		});
		await handleDocumentInbound({ from: "5562999", mediaId: "M5" }, deps);

		expect(persisted).toHaveLength(0); // não avança a progressão
		expect(replies).toHaveLength(1);
		expect(replies[0].length).toBeGreaterThan(0);
	});

	it("upload retorna ok:false com fallbackLink → devolve o link (nunca silêncio)", async () => {
		const { deps, replies } = makeDeps({
			upload: async () => ({ ok: false, fallbackLink: "https://uselink.me/abc" }),
		});
		await handleDocumentInbound({ from: "5562999", mediaId: "M6" }, deps);

		expect(replies[0]).toContain("https://uselink.me/abc");
	});

	it("sem conversa para o waId → responde amigável, sem baixar nem subir", async () => {
		let downloaded = false;
		const { deps, uploads, replies } = makeDeps({
			loadConversation: async () => null,
			download: async () => {
				downloaded = true;
				return { bytes: new Uint8Array(), mimeType: "image/jpeg" };
			},
		});
		await handleDocumentInbound({ from: "5562999", mediaId: "M7" }, deps);

		expect(downloaded).toBe(false);
		expect(uploads).toHaveLength(0);
		expect(replies).toHaveLength(1);
		expect(replies[0].length).toBeGreaterThan(0);
	});

	it("passa o filename do 'document' inbound adiante quando presente", async () => {
		let seenFilename = "";
		const { deps } = makeDeps({
			upload: async (_c, input) => {
				seenFilename = input.filename;
				return { ok: true };
			},
		});
		await handleDocumentInbound(
			{ from: "5562999", mediaId: "M8", filename: "rg-frente.pdf" },
			deps,
		);
		expect(seenFilename).toBe("rg-frente.pdf");
	});
});
