/**
 * Seed idempotente do dataset `golden-set` no Langfuse a partir dos roteiros
 * versionados em scripts/eval/golden/*.json.
 *
 * - `id` do item = nome do cenário → re-rodar ATUALIZA (upsert), nunca duplica.
 * - PII NÃO entra no Langfuse: os placeholders `${E2E_TEST_CPF}` ficam
 *   literais no dataset; a expansão acontece só no runner, em runtime.
 *
 * Uso: pnpm eval:seed
 */
import "./_env-host";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getLangfuseClient } from "@/lib/observability/langfuse/client";

const GOLDEN_DIR = join(import.meta.dirname, "eval", "golden");
const DATASET = "golden-set";

async function main(): Promise<void> {
	const client = getLangfuseClient();
	if (!client) {
		console.error("✗ LANGFUSE_* ausentes — configure o .env.local antes do seed.");
		process.exit(1);
	}

	try {
		await client.api.datasets.create({
			name: DATASET,
			description:
				"Golden set do agente de vendas (14 cenários: jornadas canônicas r9/r10 + invariantes CA). Gate de promoção de prompt — ver README.",
		});
		console.log(`✓ dataset "${DATASET}" criado`);
	} catch {
		console.log(`= dataset "${DATASET}" já existe`);
	}

	const files = readdirSync(GOLDEN_DIR)
		.filter((f) => f.endsWith(".json"))
		.sort();
	let ok = 0;
	for (const file of files) {
		const cenario = JSON.parse(readFileSync(join(GOLDEN_DIR, file), "utf8"));
		await client.api.datasetItems.create({
			datasetName: DATASET,
			id: cenario.cenario,
			input: { cenario: cenario.cenario, turns: cenario.turns },
			expectedOutput: cenario.asserts ?? {},
			metadata: {
				descricao: cenario.descricao,
				caRefs: cenario.caRefs ?? [],
				requiresEnv: cenario.requiresEnv ?? [],
			},
		});
		ok++;
		console.log(`✓ item ${cenario.cenario} (${cenario.turns.length} turnos)`);
	}
	console.log(`\n${ok}/${files.length} itens sincronizados no dataset "${DATASET}".`);
}

main().catch((err) => {
	console.error("✗ seed falhou:", err);
	process.exit(1);
});
