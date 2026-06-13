import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Config dedicada para o eval agent-vs-agent (tests/eval/*.eval.test.ts).
// Roda separada do `npm test` padrão pra evitar lentidão (cada cenário
// leva 30-120s e custa tokens da Anthropic).
//
// Uso:
//   npx vitest run --config vitest.eval.config.ts
export default defineConfig({
	resolve: {
		alias: {
			"@": resolve(__dirname, "src"),
		},
	},
	test: {
		globals: false,
		environment: "node",
		include: ["tests/**/*.eval.test.ts"],
		setupFiles: ["./vitest.setup.ts"],
		testTimeout: 240_000,
		hookTimeout: 240_000,
	},
});
