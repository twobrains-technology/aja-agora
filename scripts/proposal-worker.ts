// FIX-44 — entrypoint do worker de polling do desfecho (BullMQ).
// Roda como processo separado no mesmo projeto/container ("mesmo container se
// der", Kairo). Exige Redis (REDIS_URL).
//
//   npm run worker:proposal

import { startGateReengageWorker } from "@/lib/workers/gate-reengage-poll";
import { startProposalStatusWorker } from "@/lib/workers/proposal-status-poll";

async function main() {
	if (!process.env.DATABASE_URL) {
		console.error("[proposal-worker] DATABASE_URL não definida — abortando");
		process.exit(1);
	}
	await startProposalStatusWorker();
	// FIX-207: watchdog de re-engajamento do funil no MESMO processo/container.
	// Degrada com log se REDIS_URL ausente (não derruba o worker de proposta).
	await startGateReengageWorker();
	// mantém o processo vivo
}

const invoked = process.argv[1] ?? "";
if (/proposal-worker(\.bundle)?\.(ts|cjs)$/.test(invoked)) {
	main().catch((err) => {
		console.error("[proposal-worker] FALHA:", err);
		process.exit(1);
	});
}
