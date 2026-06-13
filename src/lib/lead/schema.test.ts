import { describe, expect, it } from "vitest";
import { leadSchema } from "./schema";

describe("leadSchema", () => {
	it("aceita phone presente + email vazio", () => {
		const r = leadSchema.safeParse({
			name: "Kairo",
			phone: "11987654321",
			email: "",
		});
		expect(r.success).toBe(true);
	});

	it("aceita phone presente + email omitido", () => {
		const r = leadSchema.safeParse({ name: "Kairo", phone: "11987654321" });
		expect(r.success).toBe(true);
	});

	it("rejeita phone vazio mesmo com email presente", () => {
		const r = leadSchema.safeParse({
			name: "Kairo",
			phone: "",
			email: "k@a.com",
		});
		expect(r.success).toBe(false);
	});

	it("rejeita email inválido se preenchido", () => {
		const r = leadSchema.safeParse({
			name: "Kairo",
			phone: "11987654321",
			email: "not-an-email",
		});
		expect(r.success).toBe(false);
	});

	it("aceita phone com formatação BR", () => {
		const r = leadSchema.safeParse({
			name: "Kairo",
			phone: "(11) 98765-4321",
		});
		expect(r.success).toBe(true);
		if (r.success) expect(r.data.phone).toBe("11987654321");
	});

	it("rejeita nome muito curto", () => {
		const r = leadSchema.safeParse({
			name: "K",
			phone: "11987654321",
		});
		expect(r.success).toBe(false);
	});

	it("email vazio é transformado para undefined", () => {
		const r = leadSchema.safeParse({
			name: "Kairo",
			phone: "11987654321",
			email: "",
		});
		expect(r.success).toBe(true);
		if (r.success) expect(r.data.email).toBeUndefined();
	});
});
