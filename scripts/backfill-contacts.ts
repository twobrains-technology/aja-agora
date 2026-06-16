// FIX-42 — runner do backfill de contacts. Roda DENTRO do container (job de
// release, após as migrations). Idempotente: re-rodar é no-op.
//
//   npm run db:backfill:contacts            (local, via tsx)
//   npm run db:backfill:contacts:runtime    (prod, bundle CJS)

import { backfillContacts } from "@/lib/contacts/backfill";

async function main() {
	if (!process.env.DATABASE_URL) {
		console.error("[backfill-contacts] DATABASE_URL não definida — abortando");
		process.exit(1);
	}
	console.log("[backfill-contacts] iniciando consolidação de contacts...");
	const result = await backfillContacts();
	console.log("[backfill-contacts] OK:", JSON.stringify(result));
	process.exit(0);
}

const invoked = process.argv[1] ?? "";
if (/backfill-contacts(\.bundle)?\.(ts|cjs)$/.test(invoked)) {
	main().catch((err) => {
		console.error("[backfill-contacts] FALHA:", err);
		process.exit(1);
	});
}
