/**
 * FIX-79 — Fechamento Bevi: rejeição do propostaId no `simulate`
 * ("Proposta não pertence ao Bevi Consórcio.") — QA manual Kairo 2026-06-25,
 * conv a9c5effa, administradora TRADIÇÃO.
 *
 * Bug de INTEGRAÇÃO via adapter (NÃO de agente → integration/contract test, não
 * cassette). Exercita o caminho REAL de produção: `startContract` → `BeviApiAdapter`
 * real → boundary HTTP mockado (`global.fetch`), com o repo (DB) em memória.
 *
 * SMOKING GUN reproduzido: `createProposal` manda `productId` explícito, mas o
 * `simulate` não mandava — a proposta nascia sob um product e o `simulate` recusava
 * por ownership. O fetch mock devolve o ownership-400 SE o `simulate` não enviar
 * `productId`, e 200 (ofertas) quando enviar — encodando a hipótese como contrato.
 *
 * TDD strict: ANTES do fix o `simulate` não envia `productId` → ownership-400 →
 * `startContract` rejeita → vermelho. Depois do fix (productId no body) → ofertas → verde.
 *
 * O fallback gracioso ao usuário (route → "Tive um problema…") já é coberto por
 * `src/app/api/chat/route.contract-error-logging.test.ts`; aqui asseguramos que o
 * adapter/fulfillment SURGE o erro de ownership tipado e limpo — o input exato que
 * aquele catch consome.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BeviApiAdapter } from "../adapters/bevi/bevi-api-adapter";
import { BeviApiError, ProposalOwnershipError } from "../adapters/bevi/bevi-errors";
import okSimulation from "../adapters/bevi/__fixtures__/ok-simulation.json";

const CONFIG = {
	baseUrl: "https://api.test/services",
	apiToken: "test-token",
	productId: "PROD-BEVI-CONSORCIO-79",
};

// Repo (DB) em memória — mesmo padrão de fulfillment.test.ts. Mantém startContract
// rodando sem Postgres; o foco do teste é o contrato HTTP do adapter.
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

import { startContract } from "./fulfillment";

const OWNERSHIP_400 = {
	status: "BAD_REQUEST",
	code: 400,
	success: false,
	message: "Proposta não pertence ao Bevi Consórcio.",
	data: {
		errors: [{ field: "propostaId", message: "Proposta não pertence ao Bevi Consórcio." }],
	},
};

const input = {
	cpf: "12345678909",
	celular: "11999998888",
	lgpd: true,
	segmento: "AUTOS",
	objetivo: "contemplacao_rapida" as const,
	valor: 50000,
};

interface SimCall {
	serviceId: string;
	body: Record<string, unknown>;
}

/**
 * Instala um fetch que roteia pelo header `service_id`:
 *  - insert_proposal → cria a proposta (ecoa o productId enviado);
 *  - calculate_simulation → ownership-400 quando `ownershipUnlessProductId` e o body
 *    NÃO traz productId; 200 (ofertas reais) caso contrário.
 */
function installFetchMock(opts: { ownershipUnlessProductId: boolean }): SimCall[] {
	const calls: SimCall[] = [];
	globalThis.fetch = vi.fn(async (_url: string, init: RequestInit) => {
		const serviceId = (init.headers as Record<string, string>).service_id;
		const body = init.body ? JSON.parse(init.body as string) : {};
		calls.push({ serviceId, body });

		if (serviceId === "insert_proposal_bevi_consorcio") {
			return {
				json: async () => ({
					status: "CREATED",
					code: 201,
					success: true,
					message: "Proposta criada com sucesso!",
					data: { proposalId: "PID-79", productId: body.productId },
				}),
			} as Response;
		}
		if (serviceId === "calculate_simulation_bevi_consorcio") {
			const hasProduct = typeof body.productId === "string" && body.productId.length > 0;
			if (opts.ownershipUnlessProductId && !hasProduct) {
				return { json: async () => OWNERSHIP_400 } as Response;
			}
			return { json: async () => okSimulation } as Response;
		}
		throw new Error(`fetch inesperado: service_id=${serviceId}`);
	}) as typeof fetch;
	return calls;
}

beforeEach(() => store.clear());
afterEach(() => vi.restoreAllMocks());

describe("FIX-79 — fechamento Bevi: propostaId aceito quando simulate envia productId", () => {
	it("startContract simula SEM 400 de ownership (simulate carrega o productId da proposta)", async () => {
		// A proposta só é reconhecida se o simulate referenciar o mesmo product da criação.
		const calls = installFetchMock({ ownershipUnlessProductId: true });

		const r = await startContract("conv-79", input, new BeviApiAdapter(CONFIG));

		// Fechamento prossegue: oferta real devolvida pra confirmar.
		expect(r.proposalId).toBe("PID-79");
		expect(r.offer).toBeTruthy();

		// CONTRATO do fix: o simulate envia o MESMO productId que criou a proposta.
		const sim = calls.find((c) => c.serviceId === "calculate_simulation_bevi_consorcio");
		expect(sim, "houve chamada de simulate").toBeTruthy();
		expect(sim?.body.productId).toBe(CONFIG.productId);
	});

	it("ownership-400 persistente (productId errado no env) → erro tipado p/ o fallback gracioso", async () => {
		// Mesmo enviando productId, a Bevi recusa (simula BEVI_PRODUCT_ID genuinamente
		// errado — o caso PENDENTE-KAIRO). O erro precisa surgir limpo e tipado pro
		// catch do route virar a mensagem amigável (sem crash).
		globalThis.fetch = vi.fn(async (_url: string, init: RequestInit) => {
			const serviceId = (init.headers as Record<string, string>).service_id;
			const body = init.body ? JSON.parse(init.body as string) : {};
			if (serviceId === "insert_proposal_bevi_consorcio") {
				return {
					json: async () => ({
						status: "CREATED",
						code: 201,
						success: true,
						message: "ok",
						data: { proposalId: "PID-79", productId: body.productId },
					}),
				} as Response;
			}
			return { json: async () => OWNERSHIP_400 } as Response;
		}) as typeof fetch;

		const err = await startContract("conv-79b", input, new BeviApiAdapter(CONFIG)).catch((e) => e);

		expect(err).toBeInstanceOf(BeviApiError);
		expect(err).toBeInstanceOf(ProposalOwnershipError);
		expect((err as BeviApiError).code).toBe(400);
		expect((err as BeviApiError).errors.some((e) => e.field === "propostaId")).toBe(true);
		// nada persistido — o erro estourou antes do snapshot
		expect(store.get("conv-79b")).toBeUndefined();
	});
});
