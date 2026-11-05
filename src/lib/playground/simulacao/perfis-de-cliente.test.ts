import { describe, expect, it } from "vitest";
import { IDS_DE_PERFIL, PERFIS_DE_CLIENTE, perfilPorId } from "./perfis-de-cliente";
import type { PerfilId } from "./tipos";

describe("perfis de cliente", () => {
	it("são 12, com ids únicos", () => {
		expect(PERFIS_DE_CLIENTE).toHaveLength(12);
		expect(new Set(IDS_DE_PERFIL).size).toBe(12);
	});

	it("cada perfil tem abertura, persona e maxTurnos válidos", () => {
		for (const p of PERFIS_DE_CLIENTE) {
			expect(p.abertura.trim()).not.toBe("");
			expect(p.persona.trim()).not.toBe("");
			expect(p.maxTurnos).toBeGreaterThan(0);
			expect(p.dados.fonteDeDados).toBe("duble");
		}
	});

	it("só madrugada-sem-atendente tem atendentes 0 com horaFixa", () => {
		const ids = PERFIS_DE_CLIENTE.filter(
			(p) => p.dados.fila.atendentes === 0 && p.dados.fila.horaFixa === "03:00",
		).map((p) => p.id);
		expect(ids).toEqual(["madrugada-sem-atendente"]);
	});

	it("só caminho-feliz espera proposta", () => {
		expect(PERFIS_DE_CLIENTE.filter((p) => p.esperaProposta).map((p) => p.id)).toEqual([
			"caminho-feliz",
		]);
	});

	it("espera fila só em pede-atendente e madrugada", () => {
		expect(PERFIS_DE_CLIENTE.filter((p) => p.esperaFila).map((p) => p.id)).toEqual([
			"pede-atendente",
			"madrugada-sem-atendente",
		]);
	});

	it("perfis de morte têm retomada dentro do roteiro e teto coerente", () => {
		for (const id of ["voltei-sem-nada", "silencio-total", "card-travado"] as const) {
			const p = perfilPorId(id);
			expect(p.roteiro).toBeDefined();
			for (const t of p.turnosDeRetorno ?? []) {
				expect(t).toBeGreaterThan(0);
				expect(t).toBeLessThan(p.maxTurnos);
				expect(p.roteiro?.some((r) => t > r.depoisDoTurno && t <= r.depoisDoTurno + r.vezes)).toBe(
					true,
				);
			}
			expect(p.esperaProposta).toBe(false);
			expect(p.esperaFila).toBe(false);
		}
	});

	it("perfilPorId acha e lança em id inválido", () => {
		expect(perfilPorId("objecao").id).toBe("objecao");
		expect(() => perfilPorId("xyz" as PerfilId)).toThrow("perfil desconhecido: xyz");
	});
});
