// O recorte de BRAÇO na lista de Conversas (FIX-404, bloco B2e).
//
// O invariante que este arquivo protege: a lista de Conversas é o DESTINO do
// drill-down da Performance/Percurso. Clicar num número daquela tela com o
// recorte "braço A" ativo tem que abrir exatamente aquelas conversas — nem as B,
// nem as de WhatsApp. E, sem recorte, a lista tem que ser a de sempre.
//
// Por que integração contra Postgres real e não mock: o que pode divergir é o
// SQL. O braço vive no metadata da conversa (a chave do experimento do registro,
// lida com `-> … ->> 'variante'`), e o balde `sem-variante` precisa
// incluir WhatsApp, conversa pré-teste E valor fora da allowlist — é o que faz
// `A + B + sem-variante = todas` fechar. Um mock afirmaria o predicado que o
// teste imaginou, não o que o Postgres devolve.
//
// A linha da tela É uma conversa, então o recorte é o predicado direto no
// metadata da própria linha (`condicaoDeBracoNaConversa`) — D10. Nada de regra
// de pessoa aqui.
import { inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CHAVE_DO_TESTE_NO_METADATA } from "@/lib/chat/variante-da-visita";

vi.mock("@/lib/admin/require-role", () => ({
	requireRole: vi.fn(async () => ({
		error: null,
		session: { user: { id: "test-admin" } },
		role: "admin",
	})),
}));

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/**
 * Marca única deste arquivo. O banco do workspace tem dados reais de outras
 * sessões (e outros blocos do enxame rodam contra ele em paralelo), então toda
 * asserção é sobre as conversas SEMEADAS — e o `q` da rota (que casa
 * `contact_name`) é o que recorta a lista para elas sem depender do volume da
 * base nem da paginação (o teto de `limit` é 100).
 */
const MARCA = `fixture-b2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** O recorte como a URL o carrega (D11). */
function recorte(braco: string, experimento = CHAVE_DO_TESTE_NO_METADATA): string {
	return `${experimento}:${braco}`;
}

function corpoDaLista(payload: unknown): { id: string }[] {
	return (payload as { items: { id: string }[] }).items;
}

describeIfDb("recorte de braço na lista de conversas (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let GET: typeof import("./route").GET;

	const conversasCriadas: string[] = [];
	let idA: string;
	let idB: string;
	let idWhatsapp: string;
	let idPreTeste: string;
	let idForaDaAllowlist: string;

	async function semearConversa(channel: "web" | "whatsapp", variante: string | null) {
		const metadata = variante === null ? {} : { [CHAVE_DO_TESTE_NO_METADATA]: { variante } };
		const [conv] = await db
			.insert(schema.conversations)
			.values({
				channel,
				contactName: `${MARCA} ${channel} ${variante ?? "sem"}`,
				isSimulated: false,
				metadata,
			})
			.returning({ id: schema.conversations.id });
		conversasCriadas.push(conv.id);
		return conv.id;
	}

	function pedirLista(params: Record<string, string> = {}, cookie?: string) {
		const sp = new URLSearchParams({ q: MARCA, limit: "50", ...params });
		return GET(
			new NextRequest(`http://test/api/admin/conversations?${sp}`, {
				headers: cookie ? { cookie } : undefined,
			}),
		);
	}

	async function idsDaLista(params: Record<string, string> = {}): Promise<string[]> {
		const res = await pedirLista(params);
		expect(res.status).toBe(200);
		return corpoDaLista(await res.json()).map((item) => item.id);
	}

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ GET } = await import("./route"));

		idA = await semearConversa("web", "A");
		idB = await semearConversa("web", "B");
		idWhatsapp = await semearConversa("whatsapp", null);
		idPreTeste = await semearConversa("web", null);
		idForaDaAllowlist = await semearConversa("web", "C");
	});

	afterAll(async () => {
		if (!db || conversasCriadas.length === 0) return;
		await db.delete(schema.conversations).where(inArray(schema.conversations.id, conversasCriadas));
	});

	it("sem recorte, devolve todas as semeadas (o default não muda número)", async () => {
		const ids = await idsDaLista();
		expect(new Set(ids)).toEqual(new Set(conversasCriadas));
	});

	it(`?ab=${recorte("A")} devolve só a conversa A`, async () => {
		const ids = await idsDaLista({ ab: recorte("A") });
		expect(ids).toContain(idA);
		expect(ids).not.toContain(idB);
		expect(ids).not.toContain(idWhatsapp);
		expect(ids).not.toContain(idPreTeste);
		expect(ids).not.toContain(idForaDaAllowlist);
	});

	it(`?ab=${recorte("B")} devolve só a conversa B`, async () => {
		const ids = await idsDaLista({ ab: recorte("B") });
		expect(ids).toContain(idB);
		expect(ids).not.toContain(idA);
		expect(ids).not.toContain(idWhatsapp);
	});

	it("o balde sem-variante inclui WhatsApp, pré-teste e valor fora da allowlist", async () => {
		const ids = await idsDaLista({ ab: recorte("sem-variante") });
		expect(ids).toContain(idWhatsapp);
		expect(ids).toContain(idPreTeste);
		expect(ids).toContain(idForaDaAllowlist);
		expect(ids).not.toContain(idA);
		expect(ids).not.toContain(idB);
	});

	it("A + B + sem-variante = todas (a partição fecha)", async () => {
		const [a, b, sem, todas] = await Promise.all([
			idsDaLista({ ab: recorte("A") }),
			idsDaLista({ ab: recorte("B") }),
			idsDaLista({ ab: recorte("sem-variante") }),
			idsDaLista(),
		]);

		const particionados = new Set([...a, ...b, ...sem]);
		expect(particionados.size).toBe(todas.length);
		expect(particionados).toEqual(new Set(todas));
	});

	it("braço fora da allowlist não é 400 e devolve a lista inteira", async () => {
		const res = await pedirLista({ ab: recorte("C") });
		expect(res.status).toBe(200);
		const ids = corpoDaLista(await res.json()).map((item) => item.id);
		expect(new Set(ids)).toEqual(new Set(conversasCriadas));
	});

	it("experimento desconhecido não é 400 e devolve a lista inteira", async () => {
		const res = await pedirLista({ ab: recorte("A", "testeQueNaoExiste") });
		expect(res.status).toBe(200);
		const ids = corpoDaLista(await res.json()).map((item) => item.id);
		expect(new Set(ids)).toEqual(new Set(conversasCriadas));
	});

	it("a URL vence o cookie (cookie B + ?ab=A ⇒ A)", async () => {
		const res = await pedirLista(
			{ q: MARCA, ab: recorte("A") },
			`aja_ab=${encodeURIComponent(recorte("B"))}`,
		);
		expect(res.status).toBe(200);
		const ids = corpoDaLista(await res.json()).map((item) => item.id);
		expect(ids).toContain(idA);
		expect(ids).not.toContain(idB);
	});

	it("sem ?ab, o cookie aja_ab decide o recorte", async () => {
		const res = await pedirLista({ q: MARCA }, `aja_ab=${encodeURIComponent(recorte("B"))}`);
		expect(res.status).toBe(200);
		const ids = corpoDaLista(await res.json()).map((item) => item.id);
		expect(ids).toContain(idB);
		expect(ids).not.toContain(idA);
	});
});
