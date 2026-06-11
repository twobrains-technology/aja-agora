// Camada 1 — /reset web (D17): purgeIdentity no contrato do MemoryAdapter.
// O reset profundo precisa apagar o agent Letta da identity (anon-cookie do
// device e phone da conversa) — senão a memória "ressuscita" o contexto ao
// re-identificar com o mesmo celular e o reset não nasce zero.

import { beforeEach, describe, expect, it, vi } from "vitest";

const lettaFetchMock = vi.fn();
vi.mock("./letta-client", () => ({
	lettaFetch: (...args: unknown[]) => lettaFetchMock(...args),
	lettaHealthCheck: async () => true,
	resolveLettaBaseUrl: async () => "http://letta:8283",
}));

const recordMemoryEventMock = vi.fn();
vi.mock("./observability", async (importOriginal) => {
	const original = await importOriginal<typeof import("./observability")>();
	return {
		...original,
		recordMemoryEvent: (...args: unknown[]) => {
			recordMemoryEventMock(...args);
			return Promise.resolve();
		},
	};
});

import { identityFromCookie, identityFromPhone } from "./identity";
import { LettaMemoryAdapter } from "./letta-adapter";
import { NoopMemoryAdapter } from "./noop-adapter";

beforeEach(() => {
	lettaFetchMock.mockReset();
	recordMemoryEventMock.mockReset();
});

describe("D17 — NoopMemoryAdapter.purgeIdentity", () => {
	it("é no-op e resolve sem erro", async () => {
		const adapter = new NoopMemoryAdapter();
		await expect(
			adapter.purgeIdentity(identityFromCookie("a".repeat(32), "ns-test")),
		).resolves.toBeUndefined();
	});
});

describe("D17 — LettaMemoryAdapter.purgeIdentity", () => {
	const identity = identityFromPhone("+5562999990000", "ns-test");

	it("agent encontrado → DELETE /v1/agents/{id} + audit agent purged", async () => {
		lettaFetchMock.mockImplementation(async (path: string, opts?: { method?: string }) => {
			if (opts?.method === "DELETE") return undefined;
			// findAgent: GET /v1/agents/?name=...
			return [{ id: "agent-123", name: expectAgentName(path), memory: { blocks: [] } }];
		});

		const adapter = new LettaMemoryAdapter();
		await adapter.purgeIdentity(identity);

		const deleteCall = lettaFetchMock.mock.calls.find(
			([, opts]) => (opts as { method?: string } | undefined)?.method === "DELETE",
		);
		expect(deleteCall).toBeDefined();
		expect(deleteCall?.[0]).toBe("/v1/agents/agent-123");
		// audit trail
		expect(recordMemoryEventMock).toHaveBeenCalledWith(
			expect.objectContaining({ eventType: "purged", lettaAgentId: "agent-123" }),
		);
	});

	it("agent não existe → não chama DELETE e resolve", async () => {
		lettaFetchMock.mockResolvedValue([]);
		const adapter = new LettaMemoryAdapter();
		await expect(adapter.purgeIdentity(identity)).resolves.toBeUndefined();
		const deleteCall = lettaFetchMock.mock.calls.find(
			([, opts]) => (opts as { method?: string } | undefined)?.method === "DELETE",
		);
		expect(deleteCall).toBeUndefined();
	});

	it("erro transiente do Letta → engole (write-side), NÃO throw", async () => {
		lettaFetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
		const adapter = new LettaMemoryAdapter();
		await expect(adapter.purgeIdentity(identity)).resolves.toBeUndefined();
	});
});

/** Extrai o name da query string do findAgent pra ecoar no mock. */
function expectAgentName(path: string): string {
	const m = /name=([^&]+)/.exec(path);
	return m ? decodeURIComponent(m[1]) : "unknown";
}
