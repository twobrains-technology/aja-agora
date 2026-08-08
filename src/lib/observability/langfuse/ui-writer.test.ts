// collectAgentText — tap no writer SSE que acumula os text-delta do turno; é
// de onde sai o `output` do trace Langfuse (a fala final do agente).
import { describe, expect, it, vi } from "vitest";
import { collectAgentText } from "./ui-writer";

function fakeWriter() {
	return { write: vi.fn(), merge: vi.fn() };
}

describe("collectAgentText", () => {
	it("acumula só os text-delta, na ordem, e repassa TUDO ao writer original", () => {
		const inner = fakeWriter();
		// biome-ignore lint/suspicious/noExplicitAny: writer fake de teste
		const { writer, getText } = collectAgentText(inner as any);

		writer.write({ type: "text-delta", id: "t1", delta: "Olá, " });
		writer.write({ type: "data-trace", data: { traceId: "t-1" } });
		writer.write({ type: "text-delta", id: "t1", delta: "Madalena!" });

		expect(getText()).toBe("Olá, Madalena!");
		expect(inner.write).toHaveBeenCalledTimes(3);
	});

	it("métodos não-write continuam funcionando (proxy transparente)", () => {
		const inner = fakeWriter();
		// biome-ignore lint/suspicious/noExplicitAny: writer fake de teste
		const { writer } = collectAgentText(inner as any);
		// biome-ignore lint/suspicious/noExplicitAny: método proxied
		(writer as any).merge("x");
		expect(inner.merge).toHaveBeenCalledWith("x");
	});
});
