import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TurnEvent } from "@/lib/agent/orchestrator";
import type { ConversationMetadata } from "@/lib/agent/personas";

// O adapter importa o banco; aqui só interessa o que ele grava e o que manda
// pro stream — `db` não é tocado nos caminhos cobertos abaixo.
vi.mock("@/db", () => ({ db: {} }));

const metaNoBanco = vi.hoisted(() => ({ atual: {} as Record<string, unknown> }));

const reloadMeta = vi.hoisted(() => vi.fn());
const persistMeta = vi.hoisted(() => vi.fn());

vi.mock("@/conversation/meta", () => ({ reloadMeta, persistMeta }));
vi.mock("@/lib/conversation/meta", () => ({ reloadMeta, persistMeta }));

async function* eventos(...lista: TurnEvent[]): AsyncGenerator<TurnEvent> {
	for (const ev of lista) yield ev;
}

function writerDeTeste() {
	const parts: Array<Record<string, unknown>> = [];
	return { parts, write: (part: Record<string, unknown>) => void parts.push(part) };
}

describe("L02 — o formulário de contrato que sai pro cliente autoriza o submit", () => {
	beforeEach(() => {
		metaNoBanco.atual = {};
		reloadMeta.mockReset();
		persistMeta.mockReset();
		reloadMeta.mockImplementation(async () => metaNoBanco.atual);
		persistMeta.mockImplementation(async (_id: string, meta: Record<string, unknown>) => {
			metaNoBanco.atual = meta;
		});
	});

	it("card contract_form no stream grava contractFormDispatched no metadata", async () => {
		const { pipeOrchestratorToWriter } = await import("./adapter");
		const writer = writerDeTeste();

		await pipeOrchestratorToWriter(
			eventos(
				{
					type: "artifact",
					artifactType: "contract_form",
					payload: { conversationId: "c-1" },
					toolCallId: "t-1",
				},
				{ type: "text-delta", text: "vamos fechar" },
			),
			writer as never,
			"conv-1",
		);

		// O card chegou ao cliente…
		expect(writer.parts.some((p) => p.type === "data-artifact")).toBe(true);
		// …e a marca que o `contract-submit` exige foi escrita junto.
		expect(metaNoBanco.atual).toMatchObject({ contractFormDispatched: true });
	});

	it("outro card não autoriza o submit do formulário de contrato", async () => {
		const { pipeOrchestratorToWriter } = await import("./adapter");

		await pipeOrchestratorToWriter(
			eventos({
				type: "artifact",
				artifactType: "recommendation_card",
				payload: {},
				toolCallId: "t-2",
			}),
			writerDeTeste() as never,
			"conv-2",
		);

		expect(persistMeta).not.toHaveBeenCalled();
		expect(metaNoBanco.atual.contractFormDispatched).toBeUndefined();
	});

	it("marca já escrita não é reescrita (um turno, uma escrita)", async () => {
		metaNoBanco.atual = { contractFormDispatched: true } as ConversationMetadata;
		const { marcarFormularioDeContratoEnviado } = await import("./adapter");

		await marcarFormularioDeContratoEnviado("conv-3");

		expect(persistMeta).not.toHaveBeenCalled();
	});
});
