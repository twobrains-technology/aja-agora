// O retorno de sucesso do `mostrar_card` carrega o fato de que a fala anterior à chamada já foi entregue.
import { describe, expect, it } from "vitest";
import type { GroupSummary } from "@/lib/adapters/types";
import { buildToolsLivres, type ContextoDasTools, FATO_TEXTO_JA_ENTREGUE } from "./tools-livres";

function ctxVazio(): ContextoDasTools {
	return {
		conversationId: "conv-teste",
		channel: "web",
		userText: null,
		nomeDoCliente: null,
		cards: [],
		falasDoFecho: [],
		cartasNaTela: [],
		gruposRevelados: new Map(),
		pediuHumano: false,
		estadoDepoisDaBusca: null,
	};
}

type ToolChamavel = { execute: (input: unknown, opts: unknown) => Promise<unknown> };

async function mostrarCard(
	ctx: ContextoDasTools,
	tipo: string,
	payload: Record<string, unknown>,
): Promise<string> {
	const tools = buildToolsLivres(ctx) as unknown as Record<string, ToolChamavel>;
	const saida = await tools.mostrar_card.execute(
		{ tipo, payload },
		{ toolCallId: "call-1", messages: [] },
	);
	return String(saida);
}

const CARTA: GroupSummary = {
	id: "cota-1",
	administradora: "Canopus",
	category: "auto",
	creditValue: 80_000,
	monthlyPayment: 1_234.56,
	adminFeePercent: 17,
	termMonths: 96,
	totalParticipants: 1_200,
} as GroupSummary;

describe("mostrar_card — fato do texto já entregue", () => {
	it("quick_reply (escolha) devolve o fato", async () => {
		const texto = await mostrarCard(ctxVazio(), "quick_reply", {
			options: [{ label: "Até 80 mil" }, { label: "Até 120 mil" }],
		});
		expect(texto).toContain("Card quick_reply na tela");
		expect(texto).toContain(FATO_TEXTO_JA_ENTREGUE);
	});

	it("card de oferta (scenarios) devolve o fato", async () => {
		const ctx = ctxVazio();
		ctx.gruposRevelados.set(CARTA.id, CARTA);
		const texto = await mostrarCard(ctx, "scenarios", { groupId: CARTA.id });
		expect(texto).toContain("Card scenarios na tela");
		expect(texto).toContain(FATO_TEXTO_JA_ENTREGUE);
	});
});
