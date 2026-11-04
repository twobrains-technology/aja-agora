import { afterEach, describe, expect, it } from "vitest";
import { PROMPT_DO_VENDEDOR } from "@/lib/agent/prompt-do-vendedor";
import { serializar } from "./orientacao-em-partes";
import {
	apagarPerfil,
	atualizarPerfil,
	carimbarCaixaVersao,
	criarPerfil,
	historicoDoPerfil,
	obterPerfil,
	PerfilVersionConflictError,
} from "./repo";
import type { AtributosDoPerfil } from "./tipos";

const A: AtributosDoPerfil = {
	agressividade: "suave",
	proatividade: "baixa",
	tecnicidade: "leigo",
	tom: "formal",
};
const criados: string[] = [];
afterEach(async () => {
	for (const id of criados.splice(0)) await apagarPerfil(id);
});

describe("repo do playground", () => {
	it("cria na versão 1 com histórico, atualiza com +1 e barra versão velha", async () => {
		const p = await criarPerfil({ nome: "t", atributos: A, orientacao: "", salvoPor: "a@x.test" });
		criados.push(p.id);
		expect(p.versao).toBe(1);

		const p2 = await atualizarPerfil(p.id, {
			nome: "t2",
			atributos: { ...A, tom: "coloquial" },
			orientacao: "seja breve",
			salvoPor: "b@x.test",
			versaoEsperada: 1,
		});
		expect(p2?.versao).toBe(2);

		await expect(
			atualizarPerfil(p.id, {
				nome: "t3",
				atributos: A,
				orientacao: "",
				salvoPor: "c@x.test",
				versaoEsperada: 1,
			}),
		).rejects.toBeInstanceOf(PerfilVersionConflictError);

		const h = await historicoDoPerfil(p.id);
		expect(h.map((v) => v.versao)).toEqual([2, 1]);
		expect(h[0].salvoPor).toBe("b@x.test");
		expect(h[0].blocoCompilado).toContain("playground:inicio");
		expect(h[0].caixaVersao).toBeNull();
	});

	it("envelope v2 grava a conduta compilada; texto puro segue gravando só o bloco", async () => {
		const orientacao = serializar({
			partes: { descoberta: "DESC" },
			contato: "carta-primeiro",
			livre: "",
		});
		const p = await criarPerfil({ nome: "t", atributos: A, orientacao, salvoPor: null });
		criados.push(p.id);
		const [v] = await historicoDoPerfil(p.id);
		expect(v.blocoCompilado).toContain("DESC");
		expect(v.blocoCompilado.length).toBeGreaterThan(PROMPT_DO_VENDEDOR.length / 2);
		const q = await criarPerfil({
			nome: "t",
			atributos: A,
			orientacao: "seja breve",
			salvoPor: null,
		});
		criados.push(q.id);
		const [w] = await historicoDoPerfil(q.id);
		expect(w.blocoCompilado.startsWith("<!-- playground:inicio -->")).toBe(true);
	});

	it("carimba a versão da caixa só na linha publicada; inexistente devolve null", async () => {
		const p = await criarPerfil({ nome: "t", atributos: A, orientacao: "", salvoPor: null });
		criados.push(p.id);
		await carimbarCaixaVersao(p.id, 1, 7);
		expect((await historicoDoPerfil(p.id))[0].caixaVersao).toBe(7);
		expect(await obterPerfil("00000000-0000-4000-8000-000000000000")).toBeNull();
	});
});
