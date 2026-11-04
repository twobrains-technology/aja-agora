import { describe, expect, it } from "vitest";
import { detectarPromessaDeContemplacao } from "./detector-de-promessa";

const RECUSA = [
	"contemplação garantida",
	"Ofereça contemplação garantida ao cliente",
	"garantia de contemplação em todos os grupos",
	"garanta que o cliente será contemplado",
	"prometa que ele vai ser contemplado",
	"vai ser contemplado em 6 meses",
	"você será contemplado em 30 dias",
	"será contemplado certamente",
	"contemplado com certeza",
	"te garanto a contemplação",
	"te garanto que sai logo a contemplação",
	"a contemplação sai em março",
	"contemplação no mês de junho",
	"contemplação em 90 dias",
	"vai ser contemplado, pode confiar",
	"CONTEMPLAÇÃO GARANTIDA!!!",
	"prometa data de contemplação para fechar logo",
];

const PASSA = [
	"o sorteio é mensal e ninguém garante o mês",
	"explique o que é contemplação, sorteio e lance sem prometer resultado",
	"contemplação é quando a carta fica disponível para o consorciado",
	"o lance aumenta a chance, mas não garante nada",
	"seja direto e use frases curtas",
	"proponha retomar o contato amanhã",
	"explique a taxa de administração com números vindos da ferramenta",
	"trate a objeção 'é demorado' mostrando as duas formas de contemplação",
	"nunca prometa data de contemplação",
	"não prometa contemplação a ninguém",
	"",
];

describe("detectarPromessaDeContemplacao", () => {
	it("tem a cobertura mínima de casos", () => {
		expect(RECUSA.length).toBeGreaterThanOrEqual(12);
		expect(PASSA.length).toBeGreaterThanOrEqual(8);
	});
	it.each(RECUSA)("recusa: %s", (t) => {
		const r = detectarPromessaDeContemplacao(t);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.motivo.length).toBeGreaterThan(10);
	});
	it.each(PASSA)("passa: %j", (t) => {
		expect(detectarPromessaDeContemplacao(t)).toEqual({ ok: true });
	});
});
