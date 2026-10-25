/**
 * O copiloto da mesa PAGA a chamada de LLM e ela tem que entrar no livro-caixa de `uso_de_ia`
 * ligada à conversa que originou o atendimento (custo por conversa / CPC). O
 * `mesa_handoffs.conversation_id` existe no schema desde sempre, mas o `caso` montado em
 * `buildCaso` não o levava até `generateMesaCopilotReply` — a linha de custo saía com
 * `conversation_id` NULL.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateMesaCopilotOpening, generateMesaCopilotReply } from "@/lib/agent/mesa-copilot";

const estado = vi.hoisted(() => ({
	attendants: [] as Array<{ id: string; nome: string; whatsapp: string }>,
	handoff: null as Record<string, unknown> | null,
	history: [] as Array<{ role: "attendant" | "assistant"; content: string }>,
	inserted: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/db", () => {
	/**
	 * Resultado de query encadeável: uma Promise de verdade (dá pra `await`) que ainda carrega
	 * os elos que o módulo chama depois do `where` (`.orderBy()`).
	 */
	function resultado(linhas: () => unknown[]) {
		class Consulta extends Promise<unknown[]> {
			orderBy() {
				return resultado(linhas);
			}
		}
		return new Consulta((resolve) => resolve(linhas()));
	}
	// A projeção é o que diferencia cada SELECT do módulo (atendentes x histórico x docs).
	function select(projecao?: Record<string, unknown>) {
		const chave = projecao ? Object.keys(projecao).join(",") : "";
		const linhas = () => {
			if (chave === "id,nome,whatsapp") return estado.attendants;
			if (chave === "role,content") return estado.history;
			return [];
		};
		return { from: () => ({ where: () => resultado(linhas) }) };
	}
	return {
		db: {
			select,
			selectDistinct: select,
			insert: () => ({
				values: async (v: Record<string, unknown>) => {
					estado.inserted.push(v);
				},
			}),
			query: { mesaHandoffs: { findFirst: async () => estado.handoff } },
		},
	};
});

vi.mock("@/lib/agent/mesa-copilot", () => ({
	generateMesaCopilotReply: vi.fn(async () => "orientação do copiloto"),
	generateMesaCopilotOpening: vi.fn(async () => "abertura do copiloto"),
}));

vi.mock("@/lib/mesa/handoff", () => ({
	claimMesaHandoff: vi.fn(),
}));

vi.mock("./notify", () => ({
	notifyMesaAttendant: vi.fn(async () => {}),
}));

vi.mock("../formatter", () => ({
	formatTextForWhatsApp: (texto: string) => texto,
	splitMessage: (texto: string) => [texto],
}));

import { handleMesaCopilot, invalidateMesaAttendantCache } from "./routing";

const TELEFONE_DA_MESA = "5511900000000";

beforeEach(() => {
	estado.attendants = [{ id: "att-1", nome: "Bruna", whatsapp: TELEFONE_DA_MESA }];
	estado.history = [];
	estado.inserted = [];
	estado.handoff = {
		id: "handoff-1",
		leadId: "lead-1",
		conversationId: "conv-1",
		administradora: { id: "adm-1", nome: "Consórcio X" },
		beviProposal: null,
		lead: { name: "Maria", phone: "5511911112222" },
	};
	invalidateMesaAttendantCache();
	vi.mocked(generateMesaCopilotReply).mockClear();
	vi.mocked(generateMesaCopilotOpening).mockClear();
});

describe("handleMesaCopilot — livro-caixa ligado à conversa de origem", () => {
	it("manda o conversationId do handoff pro copiloto", async () => {
		await handleMesaCopilot(TELEFONE_DA_MESA, "como emito o boleto da adesão?");

		expect(generateMesaCopilotReply).toHaveBeenCalledTimes(1);
		const input = vi.mocked(generateMesaCopilotReply).mock.calls[0][0];
		expect(input.conversationId).toBe("conv-1");
		// O dossiê continua indo inteiro (nada de trocar um campo pelo outro).
		expect(input.caso.clienteNome).toBe("Maria");
		expect(input.caso.administradoraNome).toBe("Consórcio X");
	});

	it("handoff antigo sem conversa vinculada manda null e não quebra a orientação", async () => {
		estado.handoff = { ...estado.handoff, conversationId: null };

		await handleMesaCopilot(TELEFONE_DA_MESA, "e o seguro?");

		const input = vi.mocked(generateMesaCopilotReply).mock.calls[0][0];
		expect(input.conversationId).toBeNull();
		expect(estado.inserted).toContainEqual(
			expect.objectContaining({ role: "assistant", content: "orientação do copiloto" }),
		);
	});
});
