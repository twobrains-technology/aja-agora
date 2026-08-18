/**
 * A tool que disse "confirmada" enquanto o servidor descartava o efeito.
 *
 * Turno de produção (`fd76e393`, WhatsApp, 16/08/2026 19:21:30):
 *
 *   cliente → "gostei dessa do bb"
 *   agente  → "Perfeito, Kairo! Vou confirmar essa escolha pra você.
 *              Pronto! A cota está confirmada."
 *   servidor → escolha = null, contractOffer = null, bevi_proposals = 0
 *
 * O agente não inventou nada: `escolher_cota` devolveu a ele
 * `{ confirmada: true, aviso: "Cota registrada. Fale os números DESTA cota
 * daqui pra frente" }`, porque a tool só verificava se o groupId era de uma cota
 * exibida. O veto de verdade — o FIX-416, que exige aceite explícito — mora no
 * nó `converse` e roda DEPOIS, sem que a tool saiba. "gostei dessa do bb" não
 * está no léxico de sim (`detectYesNoText` devolve `null`), então o efeito foi
 * descartado em silêncio e o modelo já tinha anunciado.
 *
 * Duas fontes de verdade para o mesmo fato, e a que fala com o modelo mentia.
 *
 * A correção não toca na fala: faz a ferramenta responder o que de fato
 * aconteceu. Amordaçar a frase com regex é o anti-padrão revertido em
 * `649320dc` — e não devolveria a cota ao contrato de jeito nenhum.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChosenOffer } from "@/lib/agent/orchestrator/choose-offer";

const CONV = "conv-escolher-cota";

const BB: ChosenOffer = {
	groupId: "6a7b59c125935b16a73163c0",
	administradora: "BANCO DO BRASIL",
	creditValue: 1_031_904,
	termMonths: 217,
	monthlyPayment: 6_162.48,
};
const ITAU: ChosenOffer = {
	groupId: "6a7b59c325935b16a731689b",
	administradora: "ITAÚ",
	creditValue: 900_000,
	termMonths: 48,
	monthlyPayment: 8_100,
};

const mocks = vi.hoisted(() => ({ listShown: vi.fn() }));

vi.mock("@/lib/agent/orchestrator/choose-offer", async (original) => {
	const real = await original<typeof import("@/lib/agent/orchestrator/choose-offer")>();
	return { ...real, listShownOffersForConversation: mocks.listShown };
});

import { buildConsorcioTools } from "./ai-sdk";

/** Executa a tool como o runtime a executa, com o turno do cliente no contexto. */
async function chamarEscolherCota(args: {
	texto: string;
	groupId: string;
}): Promise<Record<string, unknown>> {
	const tools = buildConsorcioTools({
		conversationId: CONV,
		turnoDoCliente: { texto: args.texto, intent: "neutral" },
	});
	const tool = tools.escolher_cota as unknown as { execute: (i: unknown) => Promise<unknown> };
	return (await tool.execute({ groupId: args.groupId })) as Record<string, unknown>;
}

beforeEach(() => {
	mocks.listShown.mockReset();
	mocks.listShown.mockResolvedValue([BB, ITAU]);
});

afterEach(() => vi.clearAllMocks());

describe("escolher_cota — a resposta ao modelo é o que de fato aconteceu", () => {
	// O turno de produção, agora pelos dois lados. A apreciação passou a ser
	// reconhecida como aceite (`aceite-por-apreciacao.test.ts`), então esta fala
	// ANCORA — e é por isso que a tool pode dizer "confirmada". O que este
	// arquivo prende é a coincidência entre as duas coisas: a tool afirma se, e
	// somente se, o servidor grava.
	it("o turno de produção: 'gostei dessa do bb' ancora, e a tool confirma", async () => {
		const out = await chamarEscolherCota({ texto: "gostei dessa do bb", groupId: BB.groupId });
		expect(out.confirmada).toBe(true);
	});

	it("fala que NÃO é aceite volta como não-confirmada, com o motivo", async () => {
		const out = await chamarEscolherCota({
			texto: "essa do banco do brasil tem taxa de quanto?",
			groupId: BB.groupId,
		});
		expect(out.confirmada).toBe(false);
		expect(String(out.motivo)).toMatch(/não registrei/i);
		expect(String(out.motivo)).toMatch(/confirm/i);
	});

	it("aceite explícito continua confirmando — a parede não pode fechar a venda", async () => {
		const out = await chamarEscolherCota({
			texto: "quero essa do banco do brasil, pode fechar",
			groupId: BB.groupId,
		});
		expect(out.confirmada).toBe(true);
		expect(out.administradora).toBe("BANCO DO BRASIL");
	});

	it("aceite que EXCLUI a marca não confirma aquela marca (FIX-414)", async () => {
		const out = await chamarEscolherCota({
			texto: "qualquer uma menos o banco do brasil, quero fechar",
			groupId: BB.groupId,
		});
		expect(out.confirmada).toBe(false);
	});

	it("groupId fora das cotas exibidas continua barrado, com a lista de volta", async () => {
		const out = await chamarEscolherCota({ texto: "quero essa", groupId: "inventado-123" });
		expect(out.confirmada).toBe(false);
		expect(out.gruposDisponiveis).toEqual([BB.groupId, ITAU.groupId]);
	});

	// Sem o turno no contexto (chamador antigo), a tool não tem como aplicar o
	// veto — e aí ela NÃO pode afirmar. Confirmar por omissão é como o defeito
	// nasceu.
	it("sem o texto do turno no contexto, não afirma confirmação", async () => {
		const tools = buildConsorcioTools({ conversationId: CONV });
		const tool = tools.escolher_cota as unknown as { execute: (i: unknown) => Promise<unknown> };
		const out = (await tool.execute({ groupId: BB.groupId })) as Record<string, unknown>;
		expect(out.confirmada).not.toBe(true);
	});
});
