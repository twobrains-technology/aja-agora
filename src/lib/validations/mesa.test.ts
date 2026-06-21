// Camada 1 (structural) — schemas Zod da mesa de operação.
// FIX-61 (administradora). FIX-63 (atendente) adiciona seus casos abaixo.
import { describe, expect, it } from "vitest";
import { createAdministradoraSchema, updateAdministradoraSchema } from "@/lib/validations/mesa";

describe("FIX-61 — createAdministradoraSchema", () => {
	it("aceita nome válido e codigoBevi opcional", () => {
		const r = createAdministradoraSchema.safeParse({ nome: "Canopus", codigoBevi: "CANOPUS" });
		expect(r.success).toBe(true);
		if (r.success) {
			expect(r.data.nome).toBe("Canopus");
			expect(r.data.codigoBevi).toBe("CANOPUS");
		}
	});

	it("aceita sem codigoBevi (opcional)", () => {
		const r = createAdministradoraSchema.safeParse({ nome: "Embracon" });
		expect(r.success).toBe(true);
		if (r.success) expect(r.data.codigoBevi).toBeUndefined();
	});

	it("trata codigoBevi vazio como ausente", () => {
		const r = createAdministradoraSchema.safeParse({ nome: "Porto", codigoBevi: "" });
		expect(r.success).toBe(true);
		if (r.success) expect(r.data.codigoBevi).toBeUndefined();
	});

	it("faz trim do nome", () => {
		const r = createAdministradoraSchema.safeParse({ nome: "  Itaú  " });
		expect(r.success).toBe(true);
		if (r.success) expect(r.data.nome).toBe("Itaú");
	});

	it("rejeita nome curto demais", () => {
		expect(createAdministradoraSchema.safeParse({ nome: "A" }).success).toBe(false);
	});

	it("rejeita nome ausente", () => {
		expect(createAdministradoraSchema.safeParse({}).success).toBe(false);
	});

	it("rejeita nome acima de 80 chars", () => {
		expect(createAdministradoraSchema.safeParse({ nome: "x".repeat(81) }).success).toBe(false);
	});
});

describe("FIX-61 — updateAdministradoraSchema", () => {
	it("aceita atualização parcial de um campo", () => {
		expect(updateAdministradoraSchema.safeParse({ isActive: false }).success).toBe(true);
	});

	it("aceita renomear", () => {
		const r = updateAdministradoraSchema.safeParse({ nome: "Novo Nome" });
		expect(r.success).toBe(true);
	});

	it("rejeita objeto vazio (nada pra atualizar)", () => {
		expect(updateAdministradoraSchema.safeParse({}).success).toBe(false);
	});
});
