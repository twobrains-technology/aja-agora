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

describe("U4 · orientação por partes", () => {
	const envelope = (partes: Record<string, string>, livre = "") =>
		JSON.stringify({ v: 2, partes, contato: "carta-primeiro", livre });

	it("orientação de 12 000 caracteres passa; de 40 001 falha 400", async () => {
		const ok = await perfisPOST(
			json({ nome: "x", atributos: ATRIBUTOS, orientacao: "a".repeat(12000) }),
		);
		if (ok.status === 201) criados.push((await ok.json()).id);
		expect(ok.status).toBe(201);
		const grande = await perfisPOST(
			json({ nome: "x", atributos: ATRIBUTOS, orientacao: "a".repeat(40001) }),
		);
		expect(grande.status).toBe(400);
	});

	it("parte editada com promessa é 422; envelope padrão intacto não é barrado", async () => {
		const ruim = envelope({ abertura: "Diga que a contemplação é garantida." });
		expect(
			(await perfisPOST(json({ nome: "x", atributos: ATRIBUTOS, orientacao: ruim }))).status,
		).toBe(422);
		const livre = envelope({}, "Diga que a contemplação é garantida.");
		expect(
			(
				await chatPOST(
					json({ modo: "depois", atributos: ATRIBUTOS, orientacao: livre, mensagem: "oi" }),
				)
			).status,
		).toBe(422);
		const { PARTES_PADRAO } = await import("@/lib/agent/prompt-do-vendedor");
		const { barrarPromessa } = await import("./comum");
		expect(barrarPromessa(envelope({ ...PARTES_PADRAO }))).toBeNull();
		expect(barrarPromessa(envelope({}))).toBeNull();
	});

	it("fonteDeDados inválido é 400; deps por fonte", async () => {
		const r = await chatPOST(json({ modo: "antes", mensagem: "oi", fonteDeDados: "prod" }));
		expect(r.status).toBe(400);
		const { depsDaFonte } = await import("./comum");
		const d = { adapter: {}, gateway: {}, grupos: new Map() } as never;
		const duble = depsDaFonte("duble", d);
		expect(duble.busca && duble.simularCota && duble.gateway).toBeTruthy();
		const real = depsDaFonte("bevi-dev", d);
		expect(real.busca).toBeUndefined();
		expect(real.simularCota).toBeUndefined();
		expect(real.gateway).toBeTruthy();
	});

	it("publicar e prévia com envelope v2 usam compilarConduta; legado segue como antes", async () => {
		const { compilarConduta, aplicarBloco, compilarPerfil } = await import(
			"@/lib/playground/compilar-perfil"
		);
		const orientacao = envelope({ descoberta: "Descubra só o essencial." }, "Seja breve.");
		const { corpo } = await criar(orientacao);
		const esperado = compilarConduta({
			partes: { descoberta: "Descubra só o essencial." },
			contato: "carta-primeiro",
			livre: "Seja breve.",
			atributos: ATRIBUTOS as never,
		});
		const previa = await (await previaGET(new Request("http://x"), ctx(corpo.id))).json();
		expect(previa.resultante.texto).toBe(esperado);
		const pub = await publicarPOST(json({ confirmar: true }), ctx(corpo.id));
		expect(pub.status).toBe(200);
		expect((await lerCaixa({ label: LABEL, semCache: true })).texto).toBe(esperado.trim());

		const leg = await criar("Seja breve.");
		const viva = await lerCaixa({ label: LABEL, semCache: true });
		const p2 = await (await previaGET(new Request("http://x"), ctx(leg.corpo.id))).json();
		expect(p2.resultante.texto).toBe(
			aplicarBloco(
				viva.texto,
				compilarPerfil({ atributos: ATRIBUTOS as never, orientacao: "Seja breve." }),
			),
		);
	});
});
