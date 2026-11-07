import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regressão do build: `chips.ts` entra no bundle do cliente (simulação do playground →
// golden.ts → chips.ts). Se ele importar observabilidade/banco, o Turbopack tenta empacotar
// `pg` (dns/fs/net/tls) e o `next build` quebra.
describe("chips.ts é puro (grafo do cliente não puxa o banco)", () => {
	it("não importa observabilidade nem o banco", () => {
		const fonte = readFileSync("src/lib/agent/pi/chips.ts", "utf8");
		expect(fonte).not.toContain("observability");
		expect(fonte).not.toContain("@/db");
	});
});
