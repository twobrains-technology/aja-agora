/**
 * REGRESSÃO (bloco-rev-d) — BUG: o case "lead-collection-prompt" de
 * `pipeOrchestratorToWriter` (canal web/SSE) emitia um `text-start` com um id
 * aleatório que NUNCA recebia `text-delta` nem `text-end` (órfão), e logo em
 * seguida `ensureTextStarted()` abria OUTRO id pro delta. Resultado no stream:
 * dois `text-start`, um só `text-end` → parte de texto vazia/aberta no cliente.
 *
 * O contrato correto: cada `text-start` tem um `text-end` com o mesmo id, e o
 * texto do prompt sai num único bloco fechado.
 *
 * Não toca DB (o case lead-collection-prompt não chama reloadMeta) → roda no
 * gate `pnpm test:unit`.
 */
import { describe, expect, it } from "vitest";
import { pipeOrchestratorToWriter } from "./adapter";

type Part = { type: string; id?: string; delta?: string };

function fakeWriter() {
	const parts: Part[] = [];
	const writer = { write: (p: Part) => parts.push(p) } as unknown as Parameters<
		typeof pipeOrchestratorToWriter
	>[1];
	return { writer, parts };
}

async function* gen(events: unknown[]) {
	for (const e of events) yield e as never;
}

describe("pipeOrchestratorToWriter — lead-collection-prompt não deixa text-start órfão", () => {
	it("cada text-start tem text-end com o mesmo id; o delta sai num bloco fechado", async () => {
		const { writer, parts } = fakeWriter();
		await pipeOrchestratorToWriter(
			gen([{ type: "lead-collection-prompt", text: "Me diz seu nome completo" }]),
			writer,
			"00000000-0000-0000-0000-000000000000",
		);

		const starts = parts.filter((p) => p.type === "text-start").map((p) => p.id);
		const ends = parts.filter((p) => p.type === "text-end").map((p) => p.id);
		const deltas = parts.filter((p) => p.type === "text-delta");

		// Nenhum text-start órfão: o conjunto de starts é igual ao de ends.
		expect([...starts].sort()).toEqual([...ends].sort());
		// Um único bloco de texto pro prompt (o bug gerava 2 starts e 1 end).
		expect(starts.length).toBe(1);
		// O delta foi escrito num id que abriu E fechou.
		expect(deltas).toHaveLength(1);
		expect(starts).toContain(deltas[0].id);
		expect(ends).toContain(deltas[0].id);
		expect(deltas[0].delta).toBe("Me diz seu nome completo");
	});
});
