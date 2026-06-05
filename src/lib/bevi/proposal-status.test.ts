// Camada 1 — FIX-14: tradução leiga + orquestração do status REAL da proposta.
// Plano de teste: docs/test-plans/fix-14-tool-status-proposta.md (CA-1..CA-14).
// Fixtures = capturas REAIS da POC 2026-06-05 (docs/jornada/jornada-ate-boleto.md §4)
// + estados PROJETADOS (approved/reproved/integrationCode — nunca observados real).
// Zero rede/DB — gateway e repo entram por deps (CA-14).

import { beforeEach, describe, expect, it, vi } from "vitest";
import { BeviApiError, BeviConfigError } from "@/lib/adapters/bevi/bevi-errors";
import type { ProposalGateway, ProposalStatus } from "@/lib/adapters/proposal-gateway";
import {
	checkProposalStatus,
	NO_PROPOSAL_MESSAGE,
	STATUS_ERROR_MESSAGE,
	STATUS_TRANSLATIONS,
	translateProposalStatus,
} from "./proposal-status";

// ============================================================================
// Fixtures
// ============================================================================

/** Termos técnicos que JAMAIS podem vazar pro usuário (CN-17 / CA-1). */
const JARGON =
	/systemicValue|waitingForUniqueCode|consultaConsorcioBevicred|dadosDoDocumentoDeIdentidade|comprovanteDeEndereco|documentoPessoal|dadosIniciais|\bpending\b|\bsituation\b|\bsort\b/;

/** Os 8 systemicValues observados na POC real (sorts 0→10; 2-4 não existem). */
const KNOWN_STATES: Array<{ systemicValue: string; statusName: string; sort?: number }> = [
	{ systemicValue: "dadosIniciais", statusName: "Dados Iniciais" },
	{ systemicValue: "consultaConsorcioBevicred", statusName: "Espera Consulta Consórcio", sort: 1 },
	{ systemicValue: "simulation", statusName: "Simulação Consórcio", sort: 5 },
	{ systemicValue: "documentoPessoal", statusName: "Documento pessoal", sort: 6 },
	{
		systemicValue: "dadosDoDocumentoDeIdentidade",
		statusName: "Dados do documento de identidade",
		sort: 7,
	},
	{ systemicValue: "endereco", statusName: "Endereço", sort: 8 },
	{ systemicValue: "comprovanteDeEndereco", statusName: "Comprovante de endereço", sort: 9 },
	{
		systemicValue: "waitingForUniqueCode",
		statusName: "Aguardando inserção da proposta",
		sort: 10,
	},
];

/** Monta um ProposalStatus no shape EXATO da captura real (ok-status.json). */
function makeStatus(over: Partial<ProposalStatus> = {}): ProposalStatus {
	return {
		proposalId: "6a230bb1cf5174e43abd089b",
		statusName: "Aguardando inserção da proposta",
		situation: "pending",
		statusDescription: null,
		integrationCode: null,
		createdAt: "2026-06-05T14:47:00.000Z",
		updatedAt: "2026-06-05T14:52:00.000Z",
		approvedAt: null,
		reprovedAt: null,
		changesHistory: [
			{
				previousState: {
					title: "Comprovante de endereço",
					situation: "pending",
					systemicValue: "comprovanteDeEndereco",
					sort: 9,
				},
				newState: {
					title: "Aguardando inserção da proposta",
					situation: "pending",
					systemicValue: "waitingForUniqueCode",
					sort: 10,
				},
				changeDate: "2026-06-05T14:52:00.000Z",
			},
		],
		...over,
	};
}

/** Status cujo estado atual (último newState) é o systemicValue dado. */
function makeStatusFor(systemicValue: string, statusName: string): ProposalStatus {
	return makeStatus({
		statusName,
		changesHistory: [
			{
				previousState: { title: "Anterior", situation: "pending", systemicValue: "anterior" },
				newState: { title: statusName, situation: "pending", systemicValue },
				changeDate: "2026-06-05T14:52:00.000Z",
			},
		],
	});
}

/** Gateway dublê: getStatus resolve com a fixture (ou lança). */
function makeGateway(impl: (proposalId: string) => Promise<ProposalStatus>): {
	gateway: ProposalGateway;
	getStatusSpy: ReturnType<typeof vi.fn>;
} {
	const getStatusSpy = vi.fn(impl);
	return { gateway: { getStatus: getStatusSpy } as unknown as ProposalGateway, getStatusSpy };
}

const ROW_WITH_PROPOSAL = {
	proposalId: "6a230bb1cf5174e43abd089b",
	conversationId: "11111111-1111-1111-1111-111111111111",
	// biome-ignore lint/suspicious/noExplicitAny: shape parcial da Row do Drizzle — só os campos usados
} as any;

// ============================================================================
// CA-1..CA-6 — translateProposalStatus (pura)
// ============================================================================

describe("FIX-14 translateProposalStatus — mapa leigo dos estados conhecidos", () => {
	for (const st of KNOWN_STATES) {
		it(`CA-1: '${st.systemicValue}' → userMessage PT-BR sem jargão técnico`, () => {
			const { userMessage } = translateProposalStatus(
				makeStatusFor(st.systemicValue, st.statusName),
			);
			expect(userMessage.length).toBeGreaterThan(10);
			expect(userMessage).not.toMatch(JARGON);
			// não caiu no fallback genérico (estado conhecido tem tradução própria)
			expect(userMessage).not.toContain(
				st.statusName === "Endereço" ? "Status atual" : "Status atual",
			);
		});
	}

	it("CA-1: mapa STATUS_TRANSLATIONS cobre os 8 systemicValues observados na POC", () => {
		for (const st of KNOWN_STATES) {
			expect(STATUS_TRANSLATIONS, `falta tradução pra '${st.systemicValue}'`).toHaveProperty(
				st.systemicValue,
			);
		}
	});

	it("CA-2: reprovedAt tem prioridade MÁXIMA (vence approvedAt + integrationCode + mapa)", () => {
		const { userMessage } = translateProposalStatus(
			makeStatus({
				reprovedAt: "2026-06-10T12:00:00Z",
				approvedAt: "2026-06-10T11:00:00Z",
				integrationCode: "PROP-123456",
			}),
		);
		expect(userMessage).toMatch(/não foi aprovada|reprovada/i);
		expect(userMessage).not.toMatch(/foi aprovada!|boa notícia/i);
	});

	it("CA-3: approvedAt vence integrationCode e o mapa", () => {
		const { userMessage } = translateProposalStatus(
			makeStatus({ approvedAt: "2026-06-10T12:00:00Z", integrationCode: "PROP-123456" }),
		);
		expect(userMessage).toMatch(/aprovada/i);
		expect(userMessage).not.toMatch(/não foi aprovada/i);
	});

	it("CA-4: integrationCode preenchido vence o mapa e expõe o número", () => {
		const { userMessage } = translateProposalStatus(makeStatus({ integrationCode: "PROP-123456" }));
		expect(userMessage).toMatch(/entrou na administradora/i);
		expect(userMessage).toContain("PROP-123456");
	});

	it("CA-5: estado desconhecido → fallback honesto repassa statusName, sem inventar", () => {
		const { userMessage } = translateProposalStatus(
			makeStatusFor("creditAnalysisSpecial", "Análise de crédito especial"),
		);
		expect(userMessage).toContain("Análise de crédito especial");
		expect(userMessage).not.toContain("creditAnalysisSpecial");
	});

	it("CA-6: precedência exata reprovedAt > approvedAt > integrationCode > mapa > fallback", () => {
		// reproved > approved
		expect(
			translateProposalStatus(
				makeStatus({ reprovedAt: "2026-06-10T12:00:00Z", approvedAt: "2026-06-10T12:00:00Z" }),
			).userMessage,
		).toMatch(/não foi aprovada|reprovada/i);
		// approved > integrationCode
		expect(
			translateProposalStatus(
				makeStatus({ approvedAt: "2026-06-10T12:00:00Z", integrationCode: "X-1" }),
			).userMessage,
		).toMatch(/aprovada/i);
		// integrationCode > mapa
		expect(translateProposalStatus(makeStatus({ integrationCode: "X-1" })).userMessage).toMatch(
			/entrou na administradora/i,
		);
		// mapa (sem overrides) — waitingForUniqueCode traduzido
		expect(translateProposalStatus(makeStatus()).userMessage).toMatch(/fila da administradora/i);
		// fallback (estado desconhecido, sem overrides)
		expect(
			translateProposalStatus(makeStatusFor("zzzNovo", "Estado Misterioso")).userMessage,
		).toContain("Estado Misterioso");
	});

	it("CA-12 (pura): lastTransition extraída do changesHistory (estado + data)", () => {
		const { lastTransition } = translateProposalStatus(makeStatus());
		expect(lastTransition).not.toBeNull();
		expect(lastTransition?.state).toBe("waitingForUniqueCode");
		expect(lastTransition?.at).toBe("2026-06-05T14:52:00.000Z");
	});

	it("CA-13 (pura): changesHistory vazio → lastTransition null, userMessage correta", () => {
		const r = translateProposalStatus(makeStatus({ statusName: "Endereço", changesHistory: [] }));
		expect(r.lastTransition).toBeNull();
		expect(r.userMessage.length).toBeGreaterThan(10);
		expect(r.userMessage).not.toMatch(JARGON);
	});

	it("CA-13 (pura): changesHistory malformado ({}, newState vazio) → não lança", () => {
		const r = translateProposalStatus(
			makeStatus({
				statusName: "Endereço",
				// biome-ignore lint/suspicious/noExplicitAny: shape hostil de propósito
				changesHistory: [{}, { newState: {} }] as any,
			}),
		);
		expect(r.lastTransition).toBeNull();
		expect(r.userMessage.length).toBeGreaterThan(10);
	});

	it("CA-31: nenhuma mensagem do mapa inventa número, data ou prazo", () => {
		for (const msg of Object.values(STATUS_TRANSLATIONS)) {
			expect(msg).not.toMatch(/\d{2}\/\d{2}|\d+ dias|\d+ horas|R\$\s*\d/);
		}
	});
});

// ============================================================================
// CA-7..CA-14 — checkProposalStatus (orquestração com dublês)
// ============================================================================

describe("FIX-14 checkProposalStatus — orquestração proposta→gateway→tradução", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("CA-7: proposta existe → ok:true/hasProposal:true, getStatus 1x com o proposalId da CONVERSA", async () => {
		const { gateway, getStatusSpy } = makeGateway(async () => makeStatus());
		const getProposalImpl = vi.fn(async () => ROW_WITH_PROPOSAL);

		const r = await checkProposalStatus("11111111-1111-1111-1111-111111111111", {
			getProposalImpl,
			gateway,
		});

		expect(r.ok).toBe(true);
		if (!r.ok || !("hasProposal" in r)) throw new Error("shape inesperado");
		expect(r.hasProposal).toBe(true);
		expect(r.userMessage).toMatch(/fila da administradora/i);
		expect(getStatusSpy).toHaveBeenCalledTimes(1);
		expect(getStatusSpy).toHaveBeenCalledWith("6a230bb1cf5174e43abd089b");
	});

	it("CA-8: sem proposta na conversa → hasProposal:false e gateway NÃO chamado (0 calls)", async () => {
		const { gateway, getStatusSpy } = makeGateway(async () => makeStatus());
		const getProposalImpl = vi.fn(async () => null);

		const r = await checkProposalStatus("22222222-2222-2222-2222-222222222222", {
			getProposalImpl,
			gateway,
		});

		expect(r).toMatchObject({ ok: true, hasProposal: false, userMessage: NO_PROPOSAL_MESSAGE });
		expect(getStatusSpy).not.toHaveBeenCalled();
	});

	it("CA-9: getStatus lança 404 → ok:false com mensagem honesta, NUNCA estado inventado", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const { gateway } = makeGateway(async () => {
			throw new BeviApiError(404, "Proposta não encontrada.", [
				{ field: "propostaId", message: "Proposta não encontrada." },
			]);
		});

		const r = await checkProposalStatus("11111111-1111-1111-1111-111111111111", {
			getProposalImpl: vi.fn(async () => ROW_WITH_PROPOSAL),
			gateway,
		});

		expect(r.ok).toBe(false);
		expect(r.userMessage).toBe(STATUS_ERROR_MESSAGE);
		// estado inventado é proibido — nada de fila/aprovada/pendente na resposta de erro
		expect(r.userMessage).not.toMatch(/fila|aprovada|reprovada|administradora recebeu/i);
	});

	it("CA-10: 403/timeout/genérico → mesma mensagem honesta, sem vazar credencial/técnica", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const errors = [
			new BeviConfigError("não foi encontrado usuário para esta token.", 403),
			new DOMException("The operation was aborted due to timeout", "TimeoutError"),
			new BeviApiError(500, "Erro interno"),
		];
		for (const err of errors) {
			const { gateway } = makeGateway(async () => {
				throw err;
			});
			const r = await checkProposalStatus("11111111-1111-1111-1111-111111111111", {
				getProposalImpl: vi.fn(async () => ROW_WITH_PROPOSAL),
				gateway,
			});
			expect(r.ok).toBe(false);
			expect(r.userMessage).toBe(STATUS_ERROR_MESSAGE);
			expect(r.userMessage).not.toMatch(/token|credencial|timeout|abort|interno/i);
		}
	});

	it("CA-11: caminho ok:false emite log estruturado server-side ANTES do retorno", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const { gateway } = makeGateway(async () => {
			throw new BeviApiError(404, "Proposta não encontrada.");
		});

		await checkProposalStatus("11111111-1111-1111-1111-111111111111", {
			getProposalImpl: vi.fn(async () => ROW_WITH_PROPOSAL),
			gateway,
		});

		expect(errorSpy).toHaveBeenCalledTimes(1);
		const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
		expect(logged).toMatchObject({
			level: "error",
			source: "proposal-status",
			conversation_id: "11111111-1111-1111-1111-111111111111",
			error_name: "BeviApiError",
		});
	});

	it("CA-12: retorno inclui lastTransition do changesHistory", async () => {
		const { gateway } = makeGateway(async () => makeStatus());
		const r = await checkProposalStatus("11111111-1111-1111-1111-111111111111", {
			getProposalImpl: vi.fn(async () => ROW_WITH_PROPOSAL),
			gateway,
		});
		if (!r.ok || !("lastTransition" in r)) throw new Error("shape inesperado");
		expect(r.lastTransition).toMatchObject({
			state: "waitingForUniqueCode",
			at: "2026-06-05T14:52:00.000Z",
		});
	});

	it("CA-13: history vazio/malformado vindo do gateway não lança", async () => {
		const { gateway } = makeGateway(async () =>
			makeStatus({
				statusName: "Endereço",
				// biome-ignore lint/suspicious/noExplicitAny: shape hostil de propósito
				changesHistory: [{}, { newState: {} }] as any,
			}),
		);
		const r = await checkProposalStatus("11111111-1111-1111-1111-111111111111", {
			getProposalImpl: vi.fn(async () => ROW_WITH_PROPOSAL),
			gateway,
		});
		expect(r.ok).toBe(true);
	});
});
