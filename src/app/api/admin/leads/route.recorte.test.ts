/**
 * O RECORTE do quadro é do servidor — e o simulado é opt-in.
 *
 * Até 22/09/2026 esta rota devolvia a base INTEIRA e o período era aplicado no
 * cliente: o chip do cabeçalho dizia "30 dias" enquanto a resposta carregava
 * todo o histórico, e o lead do simulador (demo) entrava no mesmo número da
 * operação. O quadro afirmava duas coisas diferentes ao mesmo tempo.
 *
 * O que este teste protege:
 *  1. `?from&to` recorta NO SERVIDOR, sobre `created_at` do lead;
 *  2. sem escolha, a precedência continua a do resto do painel — URL > cookie >
 *     "Desde o início" (`INICIO_DO_COLETOR`, 18/08/2026), e não "hoje";
 *  3. lead simulado fica FORA por padrão, e volta com `?include_simulated=true`
 *     (só o literal "true", como em `/api/admin/conversations`).
 *
 * Integration test: bate no Postgres real.
 */
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { conversations, leads } from "@/db/schema";
import { COOKIE_DO_PERIODO } from "@/lib/admin/periodo";

vi.mock("@/lib/admin/require-role", () => ({
	requireRole: vi.fn().mockResolvedValue({
		error: null,
		session: { user: { id: "test-admin", role: "admin" } },
		role: "admin",
	}),
}));

const { GET } = await import("./route");

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** O instante do negócio em que o lead entrou — é o campo do recorte. */
const DENTRO_DA_JANELA = new Date("2026-08-22T15:00:00Z");
const ANTES_DO_COLETOR = new Date("2026-08-10T15:00:00Z");

function pedido(query: string, cookie?: string): Request {
	return new Request(`http://test/api/admin/leads${query}`, {
		headers: cookie ? { cookie } : undefined,
	});
}

async function idsNaResposta(requisicao: Request): Promise<Set<string>> {
	const res = await GET(requisicao);
	expect(res.status).toBe(200);
	const json = (await res.json()) as { leads: Record<string, Array<{ id: string }>> };
	return new Set(
		Object.values(json.leads)
			.flat()
			.map((l) => l.id),
	);
}

describeIfDb("GET /api/admin/leads — recorte no servidor", () => {
	const convIds: string[] = [];
	const leadIds: string[] = [];
	let idDentro: string;
	let idFora: string;
	let idSimuladoDentro: string;

	async function semearLead(
		createdAt: Date,
		isSimulated: boolean,
		opcoes: {
			channel?: "web" | "whatsapp";
			/** `wa_id` da conversa: presença = veio pelo WhatsApp. */
			waId?: string | null;
			name?: string | null;
			phone?: string | null;
			email?: string | null;
		} = {},
	): Promise<string> {
		const [conversa] = await db
			.insert(conversations)
			.values({
				channel: opcoes.channel ?? "web",
				waId: opcoes.waId ?? null,
				isSimulated,
			})
			.returning({ id: conversations.id });
		convIds.push(conversa.id);

		const [lead] = await db
			.insert(leads)
			.values({
				conversationId: conversa.id,
				name: opcoes.name === undefined ? "Cliente do Recorte" : opcoes.name,
				phone:
					opcoes.phone === undefined ? `+5511${Math.floor(Math.random() * 1e8)}` : opcoes.phone,
				email: opcoes.email ?? null,
				stage: "novo",
				isSimulated,
				createdAt,
			})
			.returning({ id: leads.id });
		leadIds.push(lead.id);
		return lead.id;
	}

	beforeAll(async () => {
		idDentro = await semearLead(DENTRO_DA_JANELA, false);
		idFora = await semearLead(ANTES_DO_COLETOR, false);
		idSimuladoDentro = await semearLead(DENTRO_DA_JANELA, true);
	});

	afterAll(async () => {
		if (leadIds.length > 0) await db.delete(leads).where(inArray(leads.id, leadIds));
		if (convIds.length > 0)
			await db.delete(conversations).where(inArray(conversations.id, convIds));
	});

	it("recorta pela janela pedida — o de fora não vem", async () => {
		const ids = await idsNaResposta(pedido("?from=2026-08-20&to=2026-08-25"));

		expect(ids.has(idDentro)).toBe(true);
		expect(ids.has(idFora)).toBe(false);
	});

	it("esconde o lead simulado por padrão e o devolve com include_simulated=true", async () => {
		const semOptIn = await idsNaResposta(pedido("?from=2026-08-20&to=2026-08-25"));
		expect(semOptIn.has(idSimuladoDentro)).toBe(false);

		const comOptIn = await idsNaResposta(
			pedido("?from=2026-08-20&to=2026-08-25&include_simulated=true"),
		);
		expect(comOptIn.has(idSimuladoDentro)).toBe(true);
		expect(comOptIn.has(idDentro)).toBe(true);
	});

	it("só o literal 'true' liga o simulado — qualquer outra string é false", async () => {
		// Mesma regra de /api/admin/conversations: `?include_simulated=1` não pode
		// ligar o recorte por acidente.
		const ids = await idsNaResposta(pedido("?include_simulated=1"));
		expect(ids.has(idSimuladoDentro)).toBe(false);
	});

	it("sem URL, o cookie manda — e vence o 'Desde o início'", async () => {
		// 10–12/08 é ANTES do início do coletor (18/08): só o cookie pode trazer
		// esse lead, e é isso que prova a precedência URL > cookie > chão.
		const ids = await idsNaResposta(pedido("", `${COOKIE_DO_PERIODO}=2026-08-10_2026-08-12`));

		expect(ids.has(idFora)).toBe(true);
		expect(ids.has(idDentro)).toBe(false);
	});

	it("sem URL nem cookie, o chão é 'Desde o início' — o anterior ao coletor fica fora", async () => {
		const ids = await idsNaResposta(pedido(""));

		expect(ids.has(idDentro)).toBe(true);
		expect(ids.has(idFora)).toBe(false);
	});

	// O filtro "identificável" (AJA-23 T2) é do SERVIDOR e usa o MESMO predicado do
	// funil e da lista de Conversas (`conversaIdentificada`) — a regra é do CANAL
	// (decisão do dono, 23/09/2026). Antes ele rodava no cliente com uma cópia em
	// JS que pedia nome + contato do LEAD, e por isso o mesmo card aparecia numa
	// tela e sumia na outra.
	describe("?identificavel=true", () => {
		let idWebSemContato: string;
		let idWebComContato: string;
		let idWhatsappSemContatoNoLead: string;

		beforeAll(async () => {
			idWebSemContato = await semearLead(DENTRO_DA_JANELA, false, {
				name: null,
				phone: null,
			});
			idWebComContato = await semearLead(DENTRO_DA_JANELA, false, { phone: "+5511900000001" });
			// Conversa de WhatsApp: o `wa_id` é o que identifica, mesmo sem contato
			// nenhum no lead — é o caso que a cópia em JS deixava de fora.
			idWhatsappSemContatoNoLead = await semearLead(DENTRO_DA_JANELA, false, {
				channel: "whatsapp",
				waId: "5511900000002",
				name: null,
				phone: null,
			});
		});

		it("exclui a web sem contato coletado", async () => {
			const ids = await idsNaResposta(pedido("?from=2026-08-20&to=2026-08-25&identificavel=true"));

			expect(ids.has(idWebSemContato)).toBe(false);
		});

		it("inclui a web com contato e a conversa de WhatsApp", async () => {
			const ids = await idsNaResposta(pedido("?from=2026-08-20&to=2026-08-25&identificavel=true"));

			expect(ids.has(idWebComContato)).toBe(true);
			expect(ids.has(idWhatsappSemContatoNoLead)).toBe(true);
		});

		it("o filtro não é do cliente: sem o parâmetro, a web sem contato continua vindo", async () => {
			const ids = await idsNaResposta(pedido("?from=2026-08-20&to=2026-08-25"));

			expect(ids.has(idWebSemContato)).toBe(true);
		});
	});
});
