// A LISTA DE CONVERSAS CONCORDA COM O WORKER NA WEB (FIX-438, D9).
//
// A rota monta `FatosDaConversa` à mão e chama `avaliarRegua` — a MESMA decisão
// do ciclo. Sem a última fala do cliente, a conversa da web sem
// `last_inbound_at` continuava exibindo "Fora da régua · ainda em silêncio"
// enquanto o ciclo já a tinha inscrito: duas verdades para a mesma pergunta.
//
// Integração contra Postgres real e não mock: o que pode divergir é o SQL (o
// `CASE WHEN channel = 'web'` que traz a fala). Um mock afirmaria o predicado que
// o teste imaginou, não o que o Postgres devolve.
//
// Skip quando não há DATABASE_URL.

import { inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/require-role", () => ({
	requireRole: vi.fn(async () => ({
		error: null,
		session: { user: { id: "test-admin" } },
		role: "admin",
	})),
}));

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const MIN = 60 * 1000;
/** Marca única deste arquivo: o banco do workspace é compartilhado. */
const MARCA = `fixture-b7b-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
/** Telefones sorteados por execução — fora de qualquer lista de equipe. */
const SUF = String(Math.floor(Math.random() * 9000) + 1000);

interface ItemDaLista {
	id: string;
	motivoForaDaRegua: string | null;
}

describeIfDb("a coluna Régua da lista de Conversas lê a fala do cliente (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let GET: typeof import("./route").GET;

	const convIds: string[] = [];
	const contactIds: string[] = [];
	const envAntes = {
		REMARKETING_ATIVO: process.env.REMARKETING_ATIVO,
		REMARKETING_ENTRADA_WEB: process.env.REMARKETING_ENTRADA_WEB,
	};

	let idWebParada: string;
	let idWebSemFala: string;
	let idWhatsapp: string;

	async function semearContato(sufixo: string): Promise<string> {
		const [contact] = await db
			.insert(schema.contacts)
			.values({ phone: `55629${SUF}${sufixo}` })
			.returning({ id: schema.contacts.id });
		contactIds.push(contact.id);
		return contact.id;
	}

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ GET } = await import("./route"));

		// As duas chaves que abrem a régua e a porta da web (D9).
		process.env.REMARKETING_ATIVO = "1";
		process.env.REMARKETING_ENTRADA_WEB = "1";

		const agora = Date.now();
		const antiga = new Date(agora - 200 * MIN);

		// 1. Web parada: sem `last_inbound_at` (a web nunca escreve a coluna), com
		// uma fala do cliente há 200 min — o silêncio que a tela tem que contar.
		const contatoWeb = await semearContato("01");
		const [convWeb] = await db
			.insert(schema.conversations)
			.values({
				channel: "web",
				status: "active",
				contactName: `${MARCA} web parada`,
				contactId: contatoWeb,
				lastInboundAt: null,
				isSimulated: false,
			})
			.returning({ id: schema.conversations.id });
		convIds.push(convWeb.id);
		idWebParada = convWeb.id;
		await db.insert(schema.messages).values({
			conversationId: convWeb.id,
			role: "user",
			content: "Quero simular um financiamento",
			channel: "web",
			createdAt: antiga,
		});
		await db.insert(schema.messages).values({
			conversationId: convWeb.id,
			role: "assistant",
			content: "Claro, me diga o valor",
			channel: "web",
			createdAt: new Date(agora - 150 * MIN),
		});

		// 2. Controle: web sem fala nenhuma segue "ainda em silêncio".
		const contatoWebSemFala = await semearContato("02");
		const [convWebSemFala] = await db
			.insert(schema.conversations)
			.values({
				channel: "web",
				status: "active",
				contactName: `${MARCA} web sem fala`,
				contactId: contatoWebSemFala,
				lastInboundAt: null,
				isSimulated: false,
			})
			.returning({ id: schema.conversations.id });
		convIds.push(convWebSemFala.id);
		idWebSemFala = convWebSemFala.id;

		// 3. Controle: no WhatsApp a coluna continua governando.
		const contatoZap = await semearContato("03");
		const [convZap] = await db
			.insert(schema.conversations)
			.values({
				channel: "whatsapp",
				status: "active",
				contactName: `${MARCA} whatsapp`,
				contactId: contatoZap,
				waId: `55629${SUF}03`,
				lastInboundAt: antiga,
				isSimulated: false,
			})
			.returning({ id: schema.conversations.id });
		convIds.push(convZap.id);
		idWhatsapp = convZap.id;
	});

	afterAll(async () => {
		process.env.REMARKETING_ATIVO = envAntes.REMARKETING_ATIVO;
		process.env.REMARKETING_ENTRADA_WEB = envAntes.REMARKETING_ENTRADA_WEB;
		if (!db || convIds.length === 0) return;
		await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		await db.delete(schema.contacts).where(inArray(schema.contacts.id, contactIds));
	});

	async function lista(): Promise<Map<string, ItemDaLista>> {
		const sp = new URLSearchParams({ q: MARCA, limit: "50" });
		const res = await GET(new NextRequest(`http://test/api/admin/conversations?${sp}`));
		expect(res.status).toBe(200);
		const payload = (await res.json()) as { items: ItemDaLista[] };
		return new Map(payload.items.map((item) => [item.id, item]));
	}

	it("a web parada NÃO aparece 'ainda em silêncio' — entra como o worker decide", async () => {
		const itens = await lista();
		const web = itens.get(idWebParada);
		expect(web).toBeDefined();
		expect(web?.motivoForaDaRegua).not.toBe("ainda_em_silencio");
		expect(web?.motivoForaDaRegua).toBeNull();
	});

	it("web sem fala nenhuma segue 'ainda em silêncio'", async () => {
		const itens = await lista();
		expect(itens.get(idWebSemFala)?.motivoForaDaRegua).toBe("ainda_em_silencio");
	});

	it("no WhatsApp o `last_inbound_at` continua decidindo (comportamento intacto)", async () => {
		const itens = await lista();
		expect(itens.get(idWhatsapp)?.motivoForaDaRegua).toBeNull();
	});
});
