// L2 — o valor do fecho é o valor que o cliente VIU.
//
// Produção, 21/09/2026: o cliente pediu e viu uma simulação de R$ 80.000; no fecho
// o agente disse "esse grupo trabalha com a carta nominal de R$ 120.000, então a
// simulação fechou nesse valor". Duas coisas erradas de uma vez — (a) afirmar que a
// simulação fechou num número que ela nunca mostrou e (b) trocar o objeto do
// contrato sem confirmação.
//
// A âncora aqui é o VALOR (fato de servidor), nunca a fala: `valorVisto` é o número
// que o cliente aprovou, `valorDoFechoDivergiu` compara com a carta que a
// administradora REALMENTE devolveu, e o resumo do fecho deriva do OBJETO da oferta.
//
// Este arquivo falha antes da correção: sem `valorVisto` e sem o portão, uma carta
// real divergente seguia para o resumo como se fosse o valor aprovado.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { MockProposalGateway } from "../../../tests/helpers/mock-proposal-gateway";
import type { PartnerOffer, SimulationResult } from "../adapters/proposal-gateway";
import { realOfferPresentation } from "./closing-presentation";
import { buildStartContractInput } from "./contract-input";
import { startContract } from "./fulfillment";
import { valorDoFechoDivergiu } from "./valor-do-fecho";

// Mock do repo (DB) — mesmo desenho de `fulfillment.test.ts`: memória, sem banco.
const { store } = vi.hoisted(() => ({ store: new Map<string, Record<string, unknown>>() }));
vi.mock("./proposal-repo", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./proposal-repo")>();
	return {
		...actual,
		createBeviProposal: vi.fn(async (conversationId: string, snap: Record<string, unknown>) => {
			const row = { id: `row-${conversationId}`, conversationId, ...snap };
			store.set(conversationId, row);
			return row;
		}),
		getLatestBeviProposal: vi.fn(
			async (conversationId: string) => store.get(conversationId) ?? null,
		),
		updateBeviProposal: vi.fn(async (id: string, patch: Record<string, unknown>) => {
			for (const r of store.values()) if (r.id === id) Object.assign(r, patch);
		}),
	};
});

const IDENT = { cpf: "12345678909", celular: "62999887766", lgpd: true };

describe("valorDoFechoDivergiu — o portão do valor", () => {
	it("carta real MUITO acima do valor visto → divergiu (o caso de produção: 80k visto, 120k real)", () => {
		expect(valorDoFechoDivergiu(80_000, 120_000)).toBe(true);
	});

	it("carta real MUITO abaixo do valor visto → divergiu (trocar pra baixo também é troca de objeto)", () => {
		expect(valorDoFechoDivergiu(120_000, 80_000)).toBe(true);
	});

	it("valor visto == carta real → NÃO divergiu (o fecho segue normalmente)", () => {
		expect(valorDoFechoDivergiu(80_000, 80_000)).toBe(false);
	});

	it.each([
		[90_000, 92_902], // +3,2% — o grupo real quase nunca bate o número redondo
		[180_000, 190_000], // +5,6%
		[100_000, 119_000], // +19% — ainda dentro da folga (MAX_CREDIT_DEVIATION)
	])("desvio pequeno é ruído de catálogo, não troca de objeto: %i → %i", (visto, real) => {
		expect(valorDoFechoDivergiu(visto, real)).toBe(false);
	});

	it("sem os DOIS lados não há divergência a afirmar (D11 — nunca inventa)", () => {
		expect(valorDoFechoDivergiu(undefined, 120_000)).toBe(false);
		expect(valorDoFechoDivergiu(80_000, undefined)).toBe(false);
		expect(valorDoFechoDivergiu(null, null)).toBe(false);
		expect(valorDoFechoDivergiu(0, 120_000)).toBe(false);
		expect(valorDoFechoDivergiu(80_000, Number.NaN)).toBe(false);
	});

	it("tolerância é parâmetro — o mesmo julgamento com outro limite", () => {
		expect(valorDoFechoDivergiu(100_000, 110_000, 0.05)).toBe(true);
		expect(valorDoFechoDivergiu(100_000, 110_000, 0.2)).toBe(false);
	});
});

describe("buildStartContractInput — valorVisto é o valor que o cliente aprovou", () => {
	const meta = (over: Record<string, unknown>) =>
		({
			currentCategory: "auto",
			revealCompleted: true,
			recommendedAdministradora: "ANCORA",
			...over,
		}) as unknown as ConversationMetadata;

	it("cota ancorada por AÇÃO ESTRUTURADA → é ela o valor visto (e o valor do matching)", () => {
		const input = buildStartContractInput(
			meta({ contractOffer: { administradora: "ANCORA", creditValue: 80_000 } }),
			IDENT,
		);
		expect(input.valorVisto).toBe(80_000);
		expect(input.valor).toBe(80_000);
	});

	it("sem ação estruturada, a carta EXIBIDA é o valor visto", () => {
		const input = buildStartContractInput(
			meta({ recommendedOffer: { administradora: "ANCORA", creditValue: 80_000 } }),
			IDENT,
		);
		expect(input.valorVisto).toBe(80_000);
		expect(input.valor).toBe(80_000);
	});

	it("só heurística (teto declarado) → NÃO há valor visto: o teto nunca vira 'o que ele viu'", () => {
		// É a distinção que impede o fecho de apresentar o teto como "a simulação
		// fechou nesse valor". O teto continua servindo ao matching (`valor`).
		const input = buildStartContractInput(meta({ qualifyAnswers: { creditMax: 80_000 } }), IDENT);
		expect(input.valorVisto).toBeUndefined();
		expect(input.valor).toBe(80_000);
	});

	it("default (sem nada declarado) → valor 50000 para o matching, sem valor visto", () => {
		const input = buildStartContractInput(meta({}), IDENT);
		expect(input.valorVisto).toBeUndefined();
		expect(input.valor).toBe(50_000);
	});
});

/** Gateway fixo: a simulação devolve EXATAMENTE uma oferta com o valor dado. */
function fixedOfferGateway(creditValue: number, administradora = "RODOBENS"): MockProposalGateway {
	const gw = new MockProposalGateway();
	const offer: PartnerOffer = {
		ofertaId: "oferta-fixa",
		administradora,
		tipoOferta: "SPECIAL_OFFER",
		grupo: "500",
		valorCarta: creditValue,
		parcela: creditValue / 80,
		taxaContemplacao: 0.6,
		quotaId: "quota-fixa",
	};
	gw.simulate = async (): Promise<SimulationResult> => ({
		simulationSessionId: "sess-fixa",
		expiresAt: new Date("2026-07-12T21:00:00.000Z").toISOString(),
		offers: [offer],
	});
	return gw;
}

const INPUT = {
	cpf: "12345678909",
	celular: "11999998888",
	lgpd: true,
	segmento: "AUTOS",
	objetivo: "contemplacao_rapida" as const,
	valor: 80_000,
	valorVisto: 80_000,
};

beforeEach(() => store.clear());

describe("startContract — o portão antes de registrar/contratar", () => {
	it("carta real divergente do valor visto NÃO segue sem confirmação: o portão marca o resultado", async () => {
		const gw = fixedOfferGateway(120_000);
		const r = await startContract("conv-divergiu", INPUT, gw);
		expect(r.offer?.creditValue).toBe(120_000);
		expect(r.valorDivergiu).toBe(true);
		// O valor visto viaja junto — é o que o resumo cita como "o que mudou".
		expect(r.valorVisto).toBe(80_000);
	});

	it("carta real igual ao valor visto → o portão NÃO barra (fecho normal)", async () => {
		const gw = fixedOfferGateway(80_000);
		const r = await startContract("conv-igual", INPUT, gw);
		expect(r.valorDivergiu).toBe(false);
		expect(r.valorVisto).toBeUndefined();
	});

	it("desvio dentro da tolerância → não é divergência (o grupo real quase nunca bate o redondo)", async () => {
		const gw = fixedOfferGateway(84_000); // +5%
		const r = await startContract("conv-folga", INPUT, gw);
		expect(r.valorDivergiu).toBe(false);
	});

	it("sem valorVisto (heurística) → nunca afirma divergência, nem inventa valor visto", async () => {
		const gw = fixedOfferGateway(120_000);
		const r = await startContract("conv-heuristica", { ...INPUT, valorVisto: undefined }, gw);
		expect(r.valorDivergiu).toBe(false);
		expect(r.valorVisto).toBeUndefined();
	});
});

describe("realOfferPresentation — o resumo diz o que mudou, derivado do objeto", () => {
	const ofertaReal = (creditValue: number, grupo = "500") => ({
		proposalId: "prop-1",
		noOffer: false,
		offer: {
			ofertaId: "oferta-1",
			administradora: "RODOBENS",
			grupo,
			category: "auto" as const,
			creditValue,
			monthlyPayment: 1_454,
			tipoOferta: "SPECIAL_OFFER" as const,
		},
	});

	const textosDe = (items: ReturnType<typeof realOfferPresentation>) =>
		items
			.filter((i) => i.kind === "text")
			.map((i) => i.text)
			.join("\n");

	it("carta real divergente → pedido EXPLÍCITO de confirmação com os dois valores e o grupo da oferta", () => {
		const items = realOfferPresentation({
			...ofertaReal(120_000, "778"),
			requestedCreditValue: 80_000,
		});
		const texto = textosDe(items);
		expect(texto).toContain("80.000");
		expect(texto).toContain("120.000");
		expect(texto).toContain("778");
		expect(texto).toMatch(/confirma/i);
	});

	it("os números do aviso vêm do OBJETO da oferta (troca o objeto, muda o texto)", () => {
		const outro = realOfferPresentation({
			...ofertaReal(135_500, "902"),
			requestedCreditValue: 80_000,
		});
		const texto = textosDe(outro);
		expect(texto).toContain("135.500");
		expect(texto).toContain("902");
		expect(texto).not.toContain("120.000");
	});

	it("com valorVisto do fechamento, o texto cita o que o cliente APROVOU (não o que ele pediu)", () => {
		const items = realOfferPresentation({
			...ofertaReal(120_000),
			requestedCreditValue: 77_000,
			valorVisto: 80_000,
			valorDivergiu: true,
		});
		const texto = textosDe(items);
		expect(texto).toMatch(/você aprovou/i);
		expect(texto).toContain("80.000");
		expect(texto).not.toContain("77.000");
	});

	it("carta igual ao valor aprovado → NENHUM aviso extra (mantém a copy de sempre)", () => {
		const items = realOfferPresentation({
			...ofertaReal(80_000),
			requestedCreditValue: 80_000,
		});
		const texto = textosDe(items);
		expect(texto).toMatch(/Confirmei com a RODOBENS/);
		expect(texto).not.toMatch(/liberou agora/i);
	});
});
