// Integration (DB real) — o LOTE de "marcar como teste" (AJA-23 T3).
//
// O individual já existe e tem teste (`[id]/marcar-como-teste.integration.test.ts`).
// O que este arquivo protege é o que só o lote pode errar:
//
//   1. **A lista vazia.** Um `IN ()` mal guardado casaria tudo e marcaria a base
//      inteira como teste num clique — a operação é destrutiva de métrica, e
//      "selecionei nada e apertei o botão" não pode significar "marque tudo".
//   2. **O teto.** A tela pagina de 10 em 10 e a leitura corta em 100, mas o
//      corpo aceita até 200; um array gigante tem que ser recusado, não
//      parcialmente aplicado.
//   3. **A reversibilidade em lote.** Desmarcar N de uma vez tem que voltar com
//      os leads junto — o mesmo contrato do individual, agora com N > 1.
//   4. **O motivo certo em cada linha do relatório.** É a parte que o dono lê
//      para decidir o que sai; motivo trocado faz ele marcar o cliente errado.
import { and, eq, inArray } from "drizzle-orm";
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

const TELEFONE_DO_DONO = "556292496793"; // TELEFONES_DA_EQUIPE_PADRAO (motor.ts)

function patchLote(body: unknown) {
	return new Request("http://test/api/admin/conversations", {
		method: "PATCH",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

describeIfDb("lote de marcar como teste (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let PATCH: typeof import("./route").PATCH;

	const conversasCriadas: string[] = [];
	let contatoId: string;
	let userId: string;
	let convLoteA: string;
	let convLoteB: string;
	let leadLoteA: string;
	let leadLoteB: string;
	let convTeste: string;
	let convEquipe: string;
	let convMesa: string;
	let convCliente: string;

	async function novaConversa(valores: {
		channel: "web" | "whatsapp";
		contactName?: string;
		isSimulated?: boolean;
		contactId?: string | null;
		handedOffUserId?: string | null;
		waId?: string | null;
	}): Promise<string> {
		const [conv] = await db
			.insert(schema.conversations)
			.values({
				channel: valores.channel,
				contactName: valores.contactName ?? "Fixture limpeza",
				isSimulated: valores.isSimulated ?? false,
				contactId: valores.contactId ?? null,
				handedOffUserId: valores.handedOffUserId ?? null,
				waId: valores.waId ?? null,
			})
			.returning({ id: schema.conversations.id });
		conversasCriadas.push(conv.id);
		return conv.id;
	}

	async function novoLead(
		conversationId: string,
		valores: { name?: string | null; phone?: string | null; email?: string | null },
	): Promise<string> {
		const [lead] = await db
			.insert(schema.leads)
			.values({
				conversationId,
				name: valores.name ?? null,
				phone: valores.phone ?? null,
				email: valores.email ?? null,
			})
			.returning({ id: schema.leads.id });
		return lead.id;
	}

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ PATCH } = await import("./route"));

		const [usuario] = await db
			.insert(schema.user)
			.values({
				id: `fixture-limpeza-${Date.now()}`,
				name: "Fixture limpeza (atendente)",
				email: `fixture-limpeza-${Date.now()}@exemplo.test`,
				role: "viewer",
			})
			.returning({ id: schema.user.id });
		userId = usuario.id;

		const [contato] = await db
			.insert(schema.contacts)
			.values({ phone: `55629${Date.now() % 100000000}` })
			.returning({ id: schema.contacts.id });
		contatoId = contato.id;

		// As duas do lote: uma com linha ATIVA na régua, provando que o lote
		// segura a régua igual ao individual.
		convLoteA = await novaConversa({ channel: "whatsapp", contactId: contatoId });
		leadLoteA = await novoLead(convLoteA, { name: "Lote A", phone: "11999990001" });

		convLoteB = await novaConversa({ channel: "whatsapp", contactId: contatoId });
		leadLoteB = await novoLead(convLoteB, { name: "Lote B", phone: "11999990002" });
		await db.insert(schema.remarketingTouches).values({
			conversationId: convLoteB,
			contactId: contatoId,
			objetivo: "carro",
			step: 1,
			status: "ATIVO",
			nextTouchAt: new Date(Date.now() - 60_000),
			touches30d: 1,
		});

		// Um caso de CADA sinal do relatório.
		convTeste = await novaConversa({ channel: "web", isSimulated: true });
		convEquipe = await novaConversa({ channel: "whatsapp" });
		await novoLead(convEquipe, { name: "Equipe", phone: TELEFONE_DO_DONO });
		convMesa = await novaConversa({ channel: "web", handedOffUserId: userId });
		await novoLead(convMesa, { name: "Na mesa", phone: null, email: null });
		// Cliente normal: tem nome e telefone, não é da equipe — NÃO pode aparecer.
		convCliente = await novaConversa({ channel: "web" });
		await novoLead(convCliente, { name: "Cliente real", phone: "11988887777" });
	});

	afterAll(async () => {
		if (!db) return;
		if (conversasCriadas.length > 0) {
			await db
				.delete(schema.remarketingTouches)
				.where(inArray(schema.remarketingTouches.conversationId, conversasCriadas));
			await db.delete(schema.leads).where(inArray(schema.leads.conversationId, conversasCriadas));
			await db
				.delete(schema.conversations)
				.where(inArray(schema.conversations.id, conversasCriadas));
		}
		if (contatoId) await db.delete(schema.contacts).where(eq(schema.contacts.id, contatoId));
		if (userId) await db.delete(schema.user).where(eq(schema.user.id, userId));
	});

	it("recusa lista vazia — 'selecionei nada' não pode marcar a base", async () => {
		const res = await PATCH(patchLote({ ids: [], isSimulated: true }));
		expect(res.status).toBe(400);
	});

	it("recusa id que não é UUID", async () => {
		const res = await PATCH(patchLote({ ids: ["nao-e-uuid"], isSimulated: true }));
		expect(res.status).toBe(400);
	});

	it("recusa lista acima do teto de 200", async () => {
		const ids = Array.from(
			{ length: 201 },
			(_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
		);
		const res = await PATCH(patchLote({ ids, isSimulated: true }));
		expect(res.status).toBe(400);
	});

	it("marca as N conversas, os leads junto, e segura a régua da que tinha toque", async () => {
		const res = await PATCH(patchLote({ ids: [convLoteA, convLoteB], isSimulated: true }));
		expect(res.status).toBe(200);
		expect((await res.json()) as Record<string, number>).toMatchObject({
			conversas: 2,
			leadsMarcados: 2,
			toquesSegurados: 1,
		});

		const conversas = await db
			.select({ id: schema.conversations.id, isSimulated: schema.conversations.isSimulated })
			.from(schema.conversations)
			.where(inArray(schema.conversations.id, [convLoteA, convLoteB]));
		expect(conversas.every((c) => c.isSimulated)).toBe(true);

		const leads = await db
			.select({ id: schema.leads.id, isSimulated: schema.leads.isSimulated })
			.from(schema.leads)
			.where(inArray(schema.leads.id, [leadLoteA, leadLoteB]));
		expect(leads.every((l) => l.isSimulated)).toBe(true);

		const touch = await db.query.remarketingTouches.findFirst({
			where: eq(schema.remarketingTouches.conversationId, convLoteB),
			columns: { status: true, motivoSaida: true },
		});
		expect(touch?.status).toBe("RESPONDEU");
		expect(touch?.motivoSaida).toBe("teste");
	});

	it("o lead marcado some do funil (mesma condição que computeFunilMidia usa)", async () => {
		const contados = await db
			.select({ id: schema.leads.id })
			.from(schema.leads)
			.where(
				and(inArray(schema.leads.id, [leadLoteA, leadLoteB]), eq(schema.leads.isSimulated, false)),
			);
		expect(contados).toHaveLength(0);
	});

	it("desmarca as N de uma vez — reversível, como o individual", async () => {
		const res = await PATCH(patchLote({ ids: [convLoteA, convLoteB], isSimulated: false }));
		expect(res.status).toBe(200);
		expect((await res.json()) as Record<string, number>).toMatchObject({
			conversas: 2,
			leadsMarcados: 2,
			toquesSegurados: 0,
		});

		const conversas = await db
			.select({ isSimulated: schema.conversations.isSimulated })
			.from(schema.conversations)
			.where(inArray(schema.conversations.id, [convLoteA, convLoteB]));
		expect(conversas.every((c) => !c.isSimulated)).toBe(true);
	});

	it("id de conversa inexistente não derruba as outras nem inventa linha", async () => {
		const inexistente = "00000000-0000-4000-8000-0000000000ff";
		const res = await PATCH(patchLote({ ids: [convLoteA, inexistente], isSimulated: true }));
		expect(res.status).toBe(200);
		expect((await res.json()) as Record<string, number>).toMatchObject({ conversas: 1 });

		await PATCH(patchLote({ ids: [convLoteA], isSimulated: false }));
	});

	describe("o relatório de candidatos", () => {
		it("traz um caso de cada sinal, com o motivo certo", async () => {
			const { listarCandidatosDeLimpeza } = await import("@/lib/admin/limpeza-queries");
			const candidatos = await listarCandidatosDeLimpeza({
				de: new Date(Date.now() - 60 * 60_000),
				ate: new Date(Date.now() + 60 * 60_000),
			});
			const porConversa = new Map(candidatos.map((c) => [c.conversationId, c]));

			expect(porConversa.get(convTeste)?.motivo).toBe("teste");
			expect(porConversa.get(convEquipe)?.motivo).toBe("telefone_da_equipe");
			expect(porConversa.get(convMesa)?.motivo).toBe("sem_contato");
		});

		it("não lista o cliente normal — sem sinal não é candidato", async () => {
			const { listarCandidatosDeLimpeza } = await import("@/lib/admin/limpeza-queries");
			const candidatos = await listarCandidatosDeLimpeza({
				de: new Date(Date.now() - 60 * 60_000),
				ate: new Date(Date.now() + 60 * 60_000),
			});
			const ids = candidatos.map((c) => c.conversationId);
			expect(ids).not.toContain(convCliente);
		});
	});
});
