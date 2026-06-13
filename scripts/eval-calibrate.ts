// Roda a suíte de calibração contra o JUIZ REAL (Anthropic API).
// Uso:
//   tsx --env-file=.env scripts/eval-calibrate.ts
//   ou via npm: npm run eval:calibrate
//
// Substitui a calibração humana enquanto não temos conversas reais —
// detecta regressão no RUBRIC_SYSTEM_PROMPT comparando contra faixas
// declaradas em fixtures.ts.

import { formatCalibrationReport, runCalibration } from "@/lib/eval/calibration";
import { ALL_FIXTURES } from "@/lib/eval/fixtures";
import { judgeConversation } from "@/lib/eval/judge";

async function main() {
	if (!process.env.ANTHROPIC_API_KEY) {
		console.error("ANTHROPIC_API_KEY não setado.");
		process.exit(1);
	}

	console.log(`Rodando calibração em ${ALL_FIXTURES.length} fixtures contra judge real...`);
	const start = Date.now();

	const report = await runCalibration(ALL_FIXTURES, judgeConversation);

	const elapsed = ((Date.now() - start) / 1000).toFixed(1);
	console.log(formatCalibrationReport(report));
	console.log(`\nDuração: ${elapsed}s`);

	// Threshold mínimo: 70% das checks dentro das faixas.
	// Abaixo disso, sinal de regressão no prompt — investigar antes de subir.
	const THRESHOLD = 0.7;
	if (report.concordance < THRESHOLD) {
		console.error(
			`\n✗ Concordância abaixo do threshold (${THRESHOLD * 100}%) — revisar RUBRIC_SYSTEM_PROMPT.`,
		);
		process.exit(1);
	}
	console.log(`\n✓ Concordância dentro do threshold.`);
}

main().catch((err) => {
	console.error("Calibração falhou:", err);
	process.exit(1);
});
