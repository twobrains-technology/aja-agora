// A POPULAÇÃO que a rota do quadro de leads devolve — conta a conta, no banco.
//
// O recorte `?identificavel=true` (P061) empurra o predicado central do funil
// (`conversaIdentificada`) para o `WHERE` de `GET /api/admin/leads`. Até aqui só
// o TEXTO do predicado tinha prova (`sinais-do-funil.test.ts`), e o defeito de
// 310e foi exatamente uma troca de predicado que passou verde mudando quem
// aparece no quadro. Aqui a pergunta é a do operador: semeado o lead, o cartão
// vem ou não vem?
//
// A rota roda INTEIRA (auth mockada, o resto de verdade): o período é um dia
// vazio do calendário (01/06/2031) para que a população seja só a semeada.

import { inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Só a autorização é falsa: sem sessão, a rota devolveria 401 e o teste não
// mediria população nenhuma. `admin` é a role que vê o quadro inteiro.
vi.mock("@/lib/admin/require-role", () => ({
	requireRole: async () => ({
		error: null,
		session: { user: { id: "00000000-0000-4000-8000-0000000000aa", role: "admin" } },
		role: "admin",
	}),
}));

import { db } from "@/db";
import { contacts, conversations, leads } from "@/db/schema";
import { GET } from "./route";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** O dia do negócio do teste — vazio no calendário, para isolar a população. */
const DE = "2031-06-01";
const ATE = "2031-06-01";
const BASE = Date.parse("2031-06-01T12:00:00.000Z");
const MIN = 60_000;
const em = (minutos: number) => new Date(BASE + minutos * MIN);

const TELEFONE_DO_ALCANCE = "5562931020001";
const TELEFONE_DO_SIMULADO = "5562931020002";

const conversas: string[] = [];
const contatos: string[] = [];

async function limpar(): Promise<void> {
	if (conversas.length > 0) {
		await db.delete(leads).where(inArray(leads.conversationId, conversas));
		await db.delete(conversations).where(inArray(conversations.id, conversas));
	}
	if (contatos.length > 0) await db.delete(contacts).where(inArray(contacts.id, contatos));
	conversas.length = 0;
	contatos.length = 0;
}

beforeEach(limpar);
afterAll(limpar);

/** Um lead do período. Sem telefone/e-mail ele não é contato alcançável.
 * Devolve o id do LEAD — é ele que o cartão do quadro carrega. */
async function semearLead(args: {
	sufixo: string;
	telefone?: string;
	simulado?: boolean;
	contatoId?: string;
	estagio?: "novo" | "qualificado";
}): Promise<string> {
	const [conversa] = await db
		.insert(conversations)
		.values({
			channel: "web",
			status: "active",
			isSimulated: args.simulado ?? false,
			contactId: args.contatoId ?? null,
			createdAt: em(0),
			updatedAt: em(0),
		})
		.returning({ id: conversations.id });
	const conversaId = conversa?.id as string;
	conversas.push(conversaId);

	const [lead] = await db
		.insert(leads)
		.values({
			conversationId: conversaId,
			contactId: args.contatoId ?? null,
			phone: args.telefone ?? null,
			stage: args.estagio ?? "novo",
			isSimulated: args.simulado ?? false,
			createdAt: em(0),
			updatedAt: em(0),
		})
		.returning({ id: leads.id });
	return lead?.id as string;
}

async function semearTudo(): Promise<{
	cpfIsolado: string;
	comTelefone: string;
	simuladoComTelefone: string;
}> {
	// CPF isolado: o contato existe, mas o lead não tem telefone nem e-mail —
	// é o caso que inflava o quadro em 310e (P048/P061).
	const [contato] = await db
		.insert(contacts)
		.values({ cpf: "52998224725", name: "Só CPF" })
		.returning({ id: contacts.id });
	const contatoId = contato?.id as string;
	contatos.push(contatoId);

	const cpfIsolado = await semearLead({ sufixo: "cpf", contatoId });
	const comTelefone = await semearLead({ sufixo: "alcance", telefone: TELEFONE_DO_ALCANCE });
	// Alcancável, mas SIMULADO: é demo, e só entra com opt-in explícito.
	const simuladoComTelefone = await semearLead({
		sufixo: "simulado",
		telefone: TELEFONE_DO_SIMULADO,
		simulado: true,
	});
	return { cpfIsolado, comTelefone, simuladoComTelefone };
}

function url(params: string): string {
	return `http://localhost/api/admin/leads?from=${DE}&to=${ATE}${params}`;
}

/** Os ids dos cartões que a rota devolveu, em qualquer raia. */
async function cartoes(params: string): Promise<string[]> {
	const resposta = await GET(new Request(url(params)));
	expect(resposta.status).toBe(200);
	const corpo = (await resposta.json()) as {
		leads: Record<string, Array<{ id: string }>>;
	};
	return Object.values(corpo.leads)
		.flat()
		.map((cartao) => cartao.id);
}

describeIfDb("a população do quadro de leads", () => {
	// P048/P061 — "identificável" é contato ALCANÇÁVEL: CPF isolado não é.
	it("?identificavel=true traz só o lead com contato alcançável", async () => {
		const semeado = await semearTudo();

		const ids = await cartoes("&identificavel=true");
		expect(ids).toEqual([semeado.comTelefone]);
		// O simulado é alcançável e mesmo assim fica fora: são duas perguntas
		// diferentes (identificação e opt-in), e o teste separa as duas.
		expect(ids).not.toContain(semeado.cpfIsolado);
		expect(ids).not.toContain(semeado.simuladoComTelefone);
	});

	// O filtro é o que exclui: sem ele o mesmo período devolve os dois reais.
	it("sem o filtro o quadro traz o CPF isolado — a exclusão é do recorte", async () => {
		const semeado = await semearTudo();

		const ids = await cartoes("");
		expect(ids).toHaveLength(2);
		expect(ids).toContain(semeado.cpfIsolado);
		expect(ids).toContain(semeado.comTelefone);
	});

	// E o simulado volta com opt-in — a população "demo" continua existindo,
	// só não no mesmo número da operação.
	it("?include_simulated=true devolve o lead de teste", async () => {
		const semeado = await semearTudo();

		const ids = await cartoes("&include_simulated=true");
		expect(ids).toContain(semeado.simuladoComTelefone);
		expect(ids).toHaveLength(3);
	});
});
