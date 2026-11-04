import { afterEach, describe, expect, it } from "vitest";
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

	it("carimba a versão da caixa só na linha publicada; inexistente devolve null", async () => {
		const p = await criarPerfil({ nome: "t", atributos: A, orientacao: "", salvoPor: null });
		criados.push(p.id);
		await carimbarCaixaVersao(p.id, 1, 7);
		expect((await historicoDoPerfil(p.id))[0].caixaVersao).toBe(7);
		expect(await obterPerfil("00000000-0000-4000-8000-000000000000")).toBeNull();
	});
});
