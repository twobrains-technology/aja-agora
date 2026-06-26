// Camada 1 — /reset web (D17): purgeIdentity no contrato do MemoryAdapter.
// O reset profundo precisa apagar a memória da identity (anon-cookie do device
// e phone da conversa) — senão a memória "ressuscita" o contexto ao
// re-identificar com o mesmo celular e o reset não nasce zero.
//
// Cobertura DB real do PostgresMemoryAdapter.purgeIdentity (remove a linha) vive
// em `postgres-adapter.integration.test.ts`. Aqui ficam os invariantes do
// contrato que NÃO precisam de DB: Noop é no-op; o write-side é best-effort.

import { describe, expect, it } from "vitest";

import { identityFromCookie } from "./identity";
import { NoopMemoryAdapter } from "./noop-adapter";

describe("D17 — NoopMemoryAdapter.purgeIdentity", () => {
	it("é no-op e resolve sem erro", async () => {
		const adapter = new NoopMemoryAdapter();
		await expect(
			adapter.purgeIdentity(identityFromCookie("a".repeat(32), "ns-test")),
		).resolves.toBeUndefined();
	});
});
