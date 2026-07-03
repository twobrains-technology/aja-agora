import { describe, expect, it } from "vitest";
import { buildTrilhoLogLine } from "./trilho-log";

describe("buildTrilhoLogLine — tag de trilho na fronteira HTTP", () => {
	it("Trilho B (descoberta/simulacao) fica inequívoco na linha", () => {
		const line = JSON.parse(
			buildTrilhoLogLine({
				trilho: "B",
				method: "PATCH",
				endpoint: "update-step/HASH/step/simulation",
				phase: "response",
				status: 200,
				ok: true,
				ms: 812,
			}),
		);
		expect(line.source).toBe("bevi-http");
		expect(line.trilho).toBe("B");
		expect(line.trilho_label).toMatch(/self-contract/i);
		expect(line.trilho_label).toMatch(/descoberta|simula/i);
		expect(line.method).toBe("PATCH");
		expect(line.endpoint).toContain("simulation");
		expect(line.status).toBe(200);
		expect(line.ok).toBe(true);
	});

	it("Trilho A (fechamento) fica inequívoco e vira level=error na falha", () => {
		const line = JSON.parse(
			buildTrilhoLogLine({
				trilho: "A",
				method: "POST",
				endpoint: "insert_proposal_bevi_consorcio",
				phase: "error",
				ok: false,
			}),
		);
		expect(line.trilho).toBe("A");
		expect(line.trilho_label).toMatch(/parceiro|uxvision/i);
		expect(line.trilho_label).toMatch(/fechamento/i);
		expect(line.level).toBe("error");
		expect(line.ok).toBe(false);
	});

	it("não vaza campos ausentes (status/ms/ok omitidos quando não passados)", () => {
		const line = JSON.parse(
			buildTrilhoLogLine({ trilho: "B", method: "GET", endpoint: "HASH/system", phase: "request" }),
		);
		expect(line).not.toHaveProperty("status");
		expect(line).not.toHaveProperty("ms");
		expect(line).not.toHaveProperty("ok");
		expect(line.phase).toBe("request");
	});
});
