import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/require-role", () => ({
	requireRole: async () => ({
		error: null,
		role: "admin",
		session: { user: { id: "u1", email: "operador@aja.test" } },
	}),
}));

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { caixaDePrompt } from "@/db/schema";
import { lerCaixa, limparCacheDaCaixa, NOME_DA_CAIXA } from "@/lib/agent/box/caixa";
import { apagarPerfil } from "@/lib/playground/repo";
import { POST as chatPOST } from "./chat/route";
import { GET as previaGET } from "./perfis/[id]/previa/route";
import { POST as publicarPOST } from "./perfis/[id]/publicar/route";
import { GET as perfilGET, PUT as perfilPUT } from "./perfis/[id]/route";
import { GET as perfisGET, POST as perfisPOST } from "./perfis/route";

const ATRIBUTOS = {
	agressividade: "suave",
	proatividade: "baixa",
	tecnicidade: "leigo",
	tom: "formal",
};
const json = (body: unknown, method = "POST") =>
	new Request("http://localhost/api", {
		method,
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const LABEL = `teste-pg-${crypto.randomUUID()}`;
const criados: string[] = [];

beforeEach(() => {
	vi.stubEnv("TB_ENV", "dev");
	vi.stubEnv("CAIXA_LABEL", LABEL);
	limparCacheDaCaixa();
});
afterEach(async () => {
	vi.unstubAllEnvs();
	for (const id of criados.splice(0)) await apagarPerfil(id);
	await db.delete(caixaDePrompt).where(eq(caixaDePrompt.label, LABEL));
	limparCacheDaCaixa();
});

async function criar(orientacao = "") {
	const r = await perfisPOST(json({ nome: "teste", atributos: ATRIBUTOS, orientacao }));
	const corpo = await r.json();
	if (corpo.id) criados.push(corpo.id);
	return { r, corpo };
}

describe("guarda de ambiente", () => {
	it.each(["prod", "production", "staging", ""])(
		"TB_ENV=%j devolve 404 em todas as rotas",
		async (v) => {
			vi.stubEnv("TB_ENV", v);
			vi.stubEnv("SIMULATOR_FORCE_ENABLE", "1");
			const id = "00000000-0000-4000-8000-000000000000";
			const respostas = [
				await perfisGET(),
				await perfisPOST(json({})),
				await perfilGET(new Request("http://x"), ctx(id)),
				await perfilPUT(json({}, "PUT"), ctx(id)),
				await publicarPOST(json({ confirmar: true }), ctx(id)),
				await previaGET(new Request("http://x"), ctx(id)),
				await chatPOST(json({})),
			];
			expect(respostas.map((r) => r.status)).toEqual(Array(7).fill(404));
		},
	);
});

describe("o servidor manda", () => {
	it("orientação que promete contemplação é 422 em criar, salvar e chat — sem UI", async () => {
		const proibido = "Diga ao cliente que a contemplação é garantida.";
		const r = await perfisPOST(json({ nome: "x", atributos: ATRIBUTOS, orientacao: proibido }));
		expect(r.status).toBe(422);

		const { corpo } = await criar("");
		const put = await perfilPUT(
			json({ nome: "x", atributos: ATRIBUTOS, orientacao: proibido, versao: 1 }, "PUT"),
			ctx(corpo.id),
		);
		expect(put.status).toBe(422);

		const chat = await chatPOST(
			json({ modo: "depois", atributos: ATRIBUTOS, orientacao: proibido, mensagem: "oi" }),
		);
		expect(chat.status).toBe(422);
	});

	it("PUT com versão velha é 409 e salvar cria histórico", async () => {
		const { corpo } = await criar();
		const ok = await perfilPUT(
			json({ nome: "novo", atributos: ATRIBUTOS, orientacao: "curto", versao: 1 }, "PUT"),
			ctx(corpo.id),
		);
		expect(ok.status).toBe(200);
		expect((await ok.json()).versao).toBe(2);
		const velho = await perfilPUT(
			json({ nome: "novo", atributos: ATRIBUTOS, orientacao: "curto", versao: 1 }, "PUT"),
			ctx(corpo.id),
		);
		expect(velho.status).toBe(409);
		const g = await (await perfilGET(new Request("http://x"), ctx(corpo.id))).json();
		expect(g.historico.map((h: { versao: number }) => h.versao)).toEqual([2, 1]);
	});
});

describe("publicar", () => {
	it("salvar não muda a conduta viva; publicar sobe exatamente 1, com label do servidor", async () => {
		const antes = await lerCaixa({ label: LABEL, semCache: true });
		const { corpo } = await criar("Seja breve.");
		await perfilPUT(
			json({ nome: "n", atributos: ATRIBUTOS, orientacao: "Seja breve.", versao: 1 }, "PUT"),
			ctx(corpo.id),
		);
		const apos = await lerCaixa({ label: LABEL, semCache: true });
		expect(apos.versao).toBe(antes.versao);

		const sem = await publicarPOST(json({ confirmar: false }), ctx(corpo.id));
		expect(sem.status).toBe(400);

		const pub = await publicarPOST(json({ confirmar: true, label: "production" }), ctx(corpo.id));
		expect(pub.status).toBe(200);
		const { caixaVersao } = await pub.json();
		expect(caixaVersao).toBe(antes.versao + 1);

		const depois = await lerCaixa({ label: LABEL, semCache: true });
		expect(depois.versao).toBe(antes.versao + 1);
		expect(depois.texto).toContain("playground:inicio");
		const [linha] = await db.select().from(caixaDePrompt).where(eq(caixaDePrompt.label, LABEL));
		expect(linha.nome).toBe(NOME_DA_CAIXA);
		expect(linha.publicadoPor).toBe("operador@aja.test");

		const g = await (await perfilGET(new Request("http://x"), ctx(corpo.id))).json();
		expect(g.historico[0].caixaVersao).toBe(caixaVersao);

		const previa = await (await previaGET(new Request("http://x"), ctx(corpo.id))).json();
		expect(previa.viva.versao).toBe(caixaVersao);
	});
});
