import { describe, expect, it, vi } from "vitest";
import { marcacaoSchema } from "./route";

vi.mock("@/db", () => ({ db: {} }));

describe("marcação de teste do contato (PATCH /api/admin/contacts/[id])", () => {
	it("aceita booleano", () => {
		expect(marcacaoSchema.safeParse({ isSimulated: true }).success).toBe(true);
		expect(marcacaoSchema.safeParse({ isSimulated: false }).success).toBe(true);
	});

	it("recusa string — 'true' como texto viraria marcação silenciosa", () => {
		expect(marcacaoSchema.safeParse({ isSimulated: "true" }).success).toBe(false);
	});

	it("recusa corpo vazio", () => {
		expect(marcacaoSchema.safeParse({}).success).toBe(false);
	});
});
