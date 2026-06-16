import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	resolve: {
		alias: {
			"@": resolve(__dirname, "src"),
		},
	},
	test: {
		globals: false,
		environment: "node",
		// O suite mistura testes de DB-integração (Postgres do workspace via ponte
		// OrbStack). O default de 5s estoura sob CARGA CONCORRENTE — o fluxo do
		// projeto roda vários agentes em paralelo (Superset), competindo por CPU; a
		// resolução das promises de DB atrasa além de 5s mesmo com o DB ocioso
		// (6/100 conexões). 20s dá headroom sem deixar de pegar hang real.
		testTimeout: 20_000,
		hookTimeout: 20_000,
		include: [
			"src/**/*.test.ts",
			"src/**/*.test.tsx",
			"tests/regression/**/*.test.ts",
		],
		setupFiles: ["./vitest.setup.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "html"],
			include: ["src/**/*.ts"],
			exclude: ["src/**/*.test.ts", "src/**/*.d.ts"],
		},
	},
});
