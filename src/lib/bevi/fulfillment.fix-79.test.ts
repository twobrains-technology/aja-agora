/**
 * FIX-79 (+ REVERT 2026-06-28) — Fechamento Bevi: rejeição do propostaId no
 * `simulate` ("Proposta não pertence ao Bevi Consórcio.") — QA manual Kairo
 * 2026-06-25, conv a9c5effa, administradora TRADIÇÃO.
 *
 * Bug de INTEGRAÇÃO via adapter (NÃO de agente → integration/contract test, não
 * cassette). Exercita o caminho REAL de produção: `startContract` → `BeviApiAdapter`
 * real → boundary HTTP mockado (`global.fetch`), com o repo (DB) em memória.
 *
 * HISTÓRIA: o FIX-79 hipotetizou que mandar `productId` no `simulate` resolveria o
 * ownership-400 e adicionou o campo. O dossiê 2026-06-26 + re-validação ao vivo
 * (28/06) REFUTARAM: o erro é EXTERNO (Bevi/AGX — o productId que o insert aceita
 * está desvinculado do produto "Consórcio" na conta do token) e ocorre SEMPRE, com
 * ou sem productId no simulate. A doc oficial (collection + spec §4.3) NÃO tem
 * productId no simulate. O FIX-79 foi revertido (o simulate não manda productId).
 *
 * Este teste agora garante: (1) caminho feliz do fechamento, com o `simulate` SEM
 * productId (contrato do revert no nível do fulfillment); (2) quando a Bevi recusa
 * (o estado real hoje, PENDENTE-KAIRO), o erro surge TIPADO (ProposalOwnershipError)
 * pro fallback gracioso do route — o input exato que aquele catch consome.
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

/** fetch feliz: insert → 201; calculate_simulation → 200 (ofertas reais). Captura
 * as chamadas pra inspecionar o body enviado. */
function installHappyFetch(): SimCall[] {
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
			return { json: async () => okSimulation } as Response;
		}
		throw new Error(`fetch inesperado: service_id=${serviceId}`);
	}) as typeof fetch;
	return calls;
}

beforeEach(() => store.clear());
afterEach(() => vi.restoreAllMocks());

describe("FIX-79 (revertido 2026-06-28) — fechamento Bevi: simulate sem productId + ownership tipado", () => {
	it("caminho feliz: startContract simula e devolve oferta; simulate NÃO manda productId (revert)", async () => {
		const calls = installHappyFetch();

		const r = await startContract("conv-79", input, new BeviApiAdapter(CONFIG));

		// Fechamento prossegue: oferta real devolvida pra confirmar.
		expect(r.proposalId).toBe("PID-79");
		expect(r.offer).toBeTruthy();

		// CONTRATO do revert: o simulate NÃO carrega productId (doc oficial não tem;
		// mandá-lo não resolvia o ownership — é pendência externa da Bevi).
		const sim = calls.find((c) => c.serviceId === "calculate_simulation_bevi_consorcio");
		expect(sim, "houve chamada de simulate").toBeTruthy();
		expect(sim?.body).not.toHaveProperty("productId");
	});

	it("ownership-400 (productId desvinculado na Bevi — PENDENTE-KAIRO) → erro tipado p/ fallback gracioso", async () => {
		// A Bevi recusa SEMPRE hoje (com ou sem productId — o vínculo do produto na
		// conta do token está quebrado, causa-raiz externa). O erro precisa surgir
		// limpo e tipado pro catch do route virar a mensagem amigável (sem crash).
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
