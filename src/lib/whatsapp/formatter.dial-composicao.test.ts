// P148/P170 — a COMPOSIÇÃO do lance no dial do WhatsApp.
//
// O balão do dial não é desenho: ele é a conta que o cliente lê. Duas coisas da
// main se perderam no caminho livre e este arquivo prova as duas pelo caminho
// REAL — `mostrar_card` (o que o vendedor emite) → payload do card → mensagem
// que o WhatsApp manda:
//   • a RECUSA ao lance embutido (`usarLanceEmbutido: false`) tem de chegar ao
//     cálculo: sem isso o motor cai no teto padrão de 30% e come a carta de quem
//     disse "não quero usar a carta como lance";
//   • o dinheiro DECLARADO pelo cliente (`declaredLanceValue`) entra antes do
//     embutido: sem isso a carta encolhe na tela de quem tem o dinheiro na mão.
import { describe, expect, it, vi } from "vitest";
import type { GroupSummary } from "@/lib/adapters/types";
import { buildToolsLivres, type ContextoDasTools } from "@/lib/agent/pi/tools-livres";
import { artifactToWhatsApp } from "./formatter";

vi.mock("@/db", () => ({ db: {} }));

// `toLocaleString("pt-BR", { style: "currency" })` separa com espaço INQUEBRÁVEL.
const semNbsp = (t: string) => t.replace(/\u00a0/g, " ");

/** Carta de R$ 80 mil em 96 meses, lance médio REAL de R$ 12 mil (15% da carta):
 * no mês 24 o lance necessário é exatamente esse teto observado. */
const CARTA: GroupSummary = {
	id: "cota-canopus-70035",
	administradora: "Canopus",
	category: "auto",
	creditValue: 80_000,
	monthlyPayment: 1_234.56,
	adminFeePercent: 17,
	termMonths: 96,
	totalParticipants: 1_200,
	availableSlots: 9,
	avgBidValue: 12_000,
};

function ctxComCarta(lanceDeclarado?: number): ContextoDasTools {
	return {
		conversationId: "conv-dial-wa",
		channel: "whatsapp",
		userText: null,
		nomeDoCliente: null,
		cards: [],
		falasDoFecho: [],
		cartasNaTela: [],
		gruposRevelados: new Map([[CARTA.id, CARTA]]),
		...(lanceDeclarado !== undefined ? { perfilDeclarado: { lanceValue: lanceDeclarado } } : {}),
		pediuHumano: false,
		estadoDepoisDaBusca: null,
	};
}

type ToolChamavel = { execute: (input: unknown, opts: unknown) => Promise<unknown> };

/** Emite o dial como o vendedor emite e devolve o payload DO CARD na tela. */
async function payloadDoDial(
	ctx: ContextoDasTools,
	payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	const tools = buildToolsLivres(ctx) as unknown as Record<string, ToolChamavel>;
	await tools.mostrar_card.execute({ tipo: "contemplation_dial", payload }, { messages: [] });
	const card = ctx.cards.at(-1);
	expect(card?.type).toBe("contemplation_dial");
	return card?.payload ?? {};
}

/** O balão que o WhatsApp manda para esse card. */
function balaoDoDial(payload: Record<string, unknown>): string {
	const wa = artifactToWhatsApp("contemplation_dial", payload);
	expect(wa?.type).toBe("interactive");
	return semNbsp((wa?.interactive as { body: { text: string } }).body.text);
}

describe("dial do WhatsApp — composição do lance (P148/P170)", () => {
	it("recusa ao embutido atravessa mostrar_card → payload → balão: a carta não é comida", async () => {
		const payload = await payloadDoDial(ctxComCarta(4_000), {
			groupId: CARTA.id,
			initialTargetMonth: 24,
			usarLanceEmbutido: false,
		});

		// O teto zero é o fato que o cálculo do WhatsApp lê (`maxEmbutidoPct`).
		expect(payload.maxEmbutidoPct).toBe(0);
		const corpo = balaoDoDial(payload);
		expect(corpo).toContain("24 meses");
		// Sem embutido, o crédito que ele recebe é a carta CHEIA.
		expect(corpo).toContain("R$ 80.000");
		expect(corpo).not.toContain("R$ 72.000");
	});

	it("aceitando o embutido o mesmo mês come a carta — é a diferença que a recusa produz", async () => {
		const recusou = balaoDoDial(
			await payloadDoDial(ctxComCarta(4_000), {
				groupId: CARTA.id,
				initialTargetMonth: 24,
				usarLanceEmbutido: false,
			}),
		);
		const aceitou = balaoDoDial(
			await payloadDoDial(ctxComCarta(4_000), { groupId: CARTA.id, initialTargetMonth: 24 }),
		);

		// R$ 12 mil de lance: R$ 4 mil do bolso, R$ 8 mil saem da carta.
		expect(aceitou).toContain("R$ 72.000");
		expect(recusou).toContain("R$ 80.000");
	});

	it("o dinheiro declarado entra antes do embutido no balão do dial", async () => {
		// Sem dinheiro declarado, o embutido cobre o lance inteiro e a carta encolhe.
		const semDinheiro = balaoDoDial(
			await payloadDoDial(ctxComCarta(), { groupId: CARTA.id, initialTargetMonth: 24 }),
		);
		// Declarando R$ 20 mil, o bolso cobre o lance: a carta fica inteira com ele.
		const comDinheiro = balaoDoDial(
			await payloadDoDial(ctxComCarta(20_000), { groupId: CARTA.id, initialTargetMonth: 24 }),
		);

		expect(semDinheiro).toContain("R$ 68.000");
		expect(comDinheiro).toContain("R$ 80.000");
		expect(comDinheiro).not.toContain("R$ 68.000");
	});

	it("o loop de outro prazo mantém a composição: mês novo, mesma recusa e mesmo bolso", async () => {
		// "Testar outro prazo" reemite o card com o mês que o cliente pediu; a
		// recusa e o dinheiro declarado são do cliente e não mudam com o prazo.
		const ctx = ctxComCarta(4_000);
		const primeira = balaoDoDial(
			await payloadDoDial(ctx, {
				groupId: CARTA.id,
				initialTargetMonth: 24,
				usarLanceEmbutido: false,
			}),
		);
		const segunda = balaoDoDial(
			await payloadDoDial(ctx, {
				groupId: CARTA.id,
				initialTargetMonth: 36,
				usarLanceEmbutido: false,
			}),
		);

		expect(primeira).toContain("24 meses");
		expect(segunda).toContain("36 meses");
		// A composição sobrevive ao prazo novo: carta cheia nos dois balões.
		expect(primeira).toContain("R$ 80.000");
		expect(segunda).toContain("R$ 80.000");
		// R$ 71.040 é a carta comida pelo embutido no mês 36 — o que a recusa impede.
		expect(segunda).not.toContain("R$ 71.040");
	});
});
