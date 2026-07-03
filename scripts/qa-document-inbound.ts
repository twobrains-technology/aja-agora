// QA do upload de documento (RG/CNH) — o simulador não roteia imagem inbound pro
// handleDocumentInbound (só texto/clique), então exercito o path real aqui: download
// da mídia MOCKADO (a Graph API não serve mídia simulada), mas o UPLOAD é REAL pro
// bucket aja-client-docs (via uploadContractDocument → putObject → MinIO/S3) e a
// resposta é REAL (simulator-bus). Rode contra uma conversa JÁ FECHADA (com os links
// de documento da Bevi): QA_WAID=SIM-<uuid> pnpm exec tsx scripts/qa-document-inbound.ts
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { uploadContractDocument } from "@/lib/bevi/fulfillment";
import { metaOf, persistMeta } from "@/lib/conversation/meta";
import { sendTextMessage } from "@/lib/whatsapp/api";
import { handleDocumentInbound } from "@/lib/whatsapp/document-inbound";

// JPEG 1x1 válido (magic FFD8 ... FFD9) — bytes reais pra o upload não rejeitar.
const JPEG_1X1_B64 =
	"/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////////" +
	"////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFAABAAAA" +
	"AAAAAAAAAAAAAAAAAv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8AH//Z";

async function main() {
	const waId = process.env.QA_WAID;
	if (!waId) throw new Error("QA_WAID=SIM-<uuid> obrigatório");
	const bytes = new Uint8Array(Buffer.from(JPEG_1X1_B64, "base64"));

	const deps = {
		loadConversation: async (w: string) => {
			const c = await db.query.conversations.findFirst({ where: eq(conversations.waId, w) });
			return c ? { id: c.id, meta: metaOf(c) } : null;
		},
		persist: persistMeta,
		download: async () => ({ bytes, mimeType: "image/jpeg" }), // MOCK do Graph
		upload: (conversationId: string, input: Parameters<typeof uploadContractDocument>[1]) =>
			uploadContractDocument(conversationId, input), // REAL → aja-client-docs
		reply: async (to: string, text: string) => {
			console.log(`[qa-doc] RESPOSTA ao cliente: ${text}`);
			return sendTextMessage(to, text);
		},
	};

	console.log("=== enviando FRENTE ===");
	await handleDocumentInbound({ from: waId, mediaId: "qa-rg-frente" }, deps);
	console.log("=== enviando VERSO ===");
	await handleDocumentInbound({ from: waId, mediaId: "qa-rg-verso" }, deps);
	process.exit(0);
}

main().catch((e) => {
	console.error("[qa-doc] FALHOU:", e);
	process.exit(1);
});
