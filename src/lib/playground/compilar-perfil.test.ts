import { describe, expect, it } from "vitest";
import { aplicarBloco, compilarPerfil, MARCA_FIM, MARCA_INICIO } from "./compilar-perfil";
import { detectarPromessaDeContemplacao } from "./detector-de-promessa";
import { AGRESSIVIDADES, type AtributosDoPerfil, PROATIVIDADES, TECNICIDADES, TONS } from "./tipos";

const COMBINACOES: AtributosDoPerfil[] = [];
for (const agressividade of AGRESSIVIDADES)
	for (const proatividade of PROATIVIDADES)
		for (const tecnicidade of TECNICIDADES)
			for (const tom of TONS) COMBINACOES.push({ agressividade, proatividade, tecnicidade, tom });

const CONDUTA = `${"Conduta base do vendedor. ".repeat(10)}\nFim da conduta.`;

describe("compilarPerfil", () => {
	it("cobre 81 combinações", () => expect(COMBINACOES).toHaveLength(81));

	it.each(COMBINACOES.map((a) => [JSON.stringify(a), a] as const))(
		"%s: determinístico, marcadores únicos e sem promessa",
		(_n, atributos) => {
			const a = compilarPerfil({ atributos, orientacao: "Seja objetivo." });
			const b = compilarPerfil({ atributos, orientacao: "Seja objetivo." });
			expect(a).toBe(b);
			expect(a.split(MARCA_INICIO)).toHaveLength(2);
			expect(a.split(MARCA_FIM)).toHaveLength(2);
			expect(a.startsWith(MARCA_INICIO)).toBe(true);
			expect(a.trimEnd().endsWith(MARCA_FIM)).toBe(true);
			expect(a).toContain("# Ajuste de comportamento (playground)");
			expect(detectarPromessaDeContemplacao(a)).toEqual({ ok: true });
		},
	);

	it("níveis diferentes geram blocos diferentes", () => {
		const base = { proatividade: "media", tecnicidade: "neutro", tom: "neutro" } as const;
		const s = compilarPerfil({ atributos: { ...base, agressividade: "suave" }, orientacao: "" });
		const i = compilarPerfil({
			atributos: { ...base, agressividade: "insistente" },
			orientacao: "",
		});
		expect(s).not.toBe(i);
	});

	it("insistente não empurra ao fecho nem desiste do lead", () => {
		const t = compilarPerfil({
			atributos: {
				agressividade: "insistente",
				proatividade: "alta",
				tecnicidade: "expert",
				tom: "coloquial",
			},
			orientacao: "",
		});
		expect(t).toMatch(/s[óo] .*quando (?:o cliente|a pessoa) pedir/i);
		expect(t).toMatch(/nunca desist/i);
		expect(t).toMatch(/n[úu]mero.*ferramenta/i);
	});

	it("inclui a orientação livre aparada", () => {
		const t = compilarPerfil({
			atributos: COMBINACOES[0],
			orientacao: "  Use exemplos de carro.  ",
		});
		expect(t).toContain("Use exemplos de carro.");
	});

	it("neutraliza marcadores digitados na orientação", () => {
		const t = compilarPerfil({
			atributos: COMBINACOES[0],
			orientacao: `x ${MARCA_INICIO} y ${MARCA_FIM}`,
		});
		expect(t.split(MARCA_INICIO)).toHaveLength(2);
		expect(t.split(MARCA_FIM)).toHaveLength(2);
	});
});

describe("aplicarBloco", () => {
	const bloco = compilarPerfil({ atributos: COMBINACOES[0], orientacao: "A" });
	const outro = compilarPerfil({ atributos: COMBINACOES[80], orientacao: "B" });

	it("acrescenta depois da conduta", () => {
		const r = aplicarBloco(CONDUTA, bloco);
		expect(r.startsWith(CONDUTA.trimEnd())).toBe(true);
		expect(r).toContain(bloco);
	});
	it("idempotente: 2× = 1×", () => {
		const um = aplicarBloco(CONDUTA, bloco);
		expect(aplicarBloco(um, bloco)).toBe(um);
	});
	it("trocar bloco substitui, não empilha", () => {
		const r = aplicarBloco(aplicarBloco(CONDUTA, bloco), outro);
		expect(r.split(MARCA_INICIO)).toHaveLength(2);
		expect(r).toContain(outro);
		expect(r).not.toContain(bloco);
		expect(r).toBe(aplicarBloco(CONDUTA, outro));
	});
	it("conduta já com bloco volta ao original sem ele", () => {
		const r = aplicarBloco(aplicarBloco(CONDUTA, bloco), "");
		expect(r).toBe(CONDUTA.trimEnd());
	});
});
