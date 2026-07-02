import { describe, expect, it, vi } from "vitest";
import type { AdministradoraAdapter } from "@/lib/adapters";
import { GroupNotInDiscoveryError } from "@/lib/adapters/bevi/bevi-self-contract-adapter";
import {
	executeGetGroupDetails,
	executeSimulateQuota,
	looksLikeFabricatedGroupId,
	simulationResultSchema,
} from "./ai-sdk";

/**
 * Camada 1 (structural) — FIX-72.
 *
 * Raiz que o FIX-68/FIX-71 atacaram parcialmente: a LLM fabrica groupId no padrao
 * `categoria-valor[-prazo|-nome]` sempre que nao tem o quotaId real (hash opaco,
 * 24-hex) a mao. O qa-noturno (2026-06-24) provou no log que o detector fragil
 * (`-NNNk-NNm$`) NAO pega `auto-180k` (sem `-NNm`) nem `auto-180k-kairo` (sufixo
 * `-nome`), e que o guard nem existia em `get_group_details`.
 *
 * Fecha a raiz em DUAS camadas (defense-in-depth):
 *  (a) fast-path `looksLikeFabricatedGroupId` generalizado (marcador de valor-em-k);
 *  (b) rede de seguranca: id fora do conjunto real → `GroupNotInDiscoveryError`
 *      capturado pela tool → diretiva ACIONAVEL de re-busca (nunca erro cru).
 * Vale pra simulate_quota E get_group_details.
 */

const DIRECTIVE = /re-?busc|search_groups|literal|nao existe na descoberta/i;

describe("FIX-72 — fast-path reconhece o id fabricado observado em prod (auto-180k / auto-180k-kairo)", () => {
	it("pega `auto-180k` (sem sufixo de prazo) e `auto-180k-kairo` (com o nome do usuario)", () => {
		expect(looksLikeFabricatedGroupId("auto-180k")).toBe(true);
		expect(looksLikeFabricatedGroupId("auto-180k-kairo")).toBe(true);
	});

	it("NAO regride os formatos do FIX-68/FIX-71", () => {
		expect(looksLikeFabricatedGroupId("bb-auto-200k-72m")).toBe(true);
		expect(looksLikeFabricatedGroupId("auto-130k-60m")).toBe(true);
		expect(looksLikeFabricatedGroupId("auto-256k-60m")).toBe(true);
	});

	it("NAO confunde o id real (hash opaco de 24 chars, sem a letra `k`) nem string vazia", () => {
		expect(looksLikeFabricatedGroupId("6a0ca9c73e68cce9b61d30fd")).toBe(false);
		expect(looksLikeFabricatedGroupId("7c3d115ee0fd6da59f9d18e1")).toBe(false);
		expect(looksLikeFabricatedGroupId("")).toBe(false);
	});
});

describe("FIX-72 — tool com id fabricado NEM chama a Bevi: devolve diretiva (fast-path)", () => {
	function spyAdapter() {
		const getGroupDetails = vi.fn(async () => ({ creditValue: 180000 }));
		const simulateQuota = vi.fn(async () => ({ groupId: "x", creditValue: 180000 }));
		return {
			adapter: { getGroupDetails, simulateQuota } as unknown as AdministradoraAdapter,
			getGroupDetails,
			simulateQuota,
		};
	}

	it("simulate_quota com `auto-180k` retorna { error } e nao toca o adapter", async () => {
		const { adapter, getGroupDetails, simulateQuota } = spyAdapter();
		const out = await executeSimulateQuota(adapter, { groupId: "auto-180k", creditValue: 180000 });
		expect((out as { error?: string }).error).toMatch(DIRECTIVE);
		expect(getGroupDetails).not.toHaveBeenCalled();
		expect(simulateQuota).not.toHaveBeenCalled();
	});

	it("get_group_details com `auto-180k-kairo` retorna { error } e nao toca o adapter", async () => {
		const { adapter, getGroupDetails } = spyAdapter();
		const out = await executeGetGroupDetails(adapter, { groupId: "auto-180k-kairo" });
		expect((out as { error?: string }).error).toMatch(DIRECTIVE);
		expect(getGroupDetails).not.toHaveBeenCalled();
	});
});

describe("FIX-72 — rede de seguranca: id fora do conjunto real vira diretiva, nao erro cru", () => {
	// Um id que PARECE real (hash, passa o fast-path) mas nao esta no offerIndex —
	// ex.: oferta expirada ou hex inventado. O adapter lanca GroupNotInDiscoveryError;
	// a tool captura e devolve diretiva acionavel em vez de propagar (instabilidade).
	const GONE_ID = "6a0ca9c73e68cce9b61d30fd";

	function throwingAdapter() {
		return {
			getGroupDetails: async () => {
				throw new GroupNotInDiscoveryError(GONE_ID);
			},
			simulateQuota: async () => {
				throw new GroupNotInDiscoveryError(GONE_ID);
			},
		} as unknown as AdministradoraAdapter;
	}

	it("simulate_quota captura GroupNotInDiscoveryError → { error } com guidance de re-busca", async () => {
		const out = await executeSimulateQuota(throwingAdapter(), {
			groupId: GONE_ID,
			creditValue: 180000,
		});
		expect((out as { error?: string }).error).toMatch(DIRECTIVE);
	});

	it("get_group_details captura GroupNotInDiscoveryError → { error } com guidance de re-busca", async () => {
		const out = await executeGetGroupDetails(throwingAdapter(), { groupId: GONE_ID });
		expect((out as { error?: string }).error).toMatch(DIRECTIVE);
	});

	it("erro NAO-GroupNotInDiscovery propaga (nao mascara falha real de rede/config)", async () => {
		const adapter = {
			getGroupDetails: async () => {
				throw new Error("ECONNRESET");
			},
			simulateQuota: async () => {
				throw new Error("ECONNRESET");
			},
		} as unknown as AdministradoraAdapter;
		await expect(executeGetGroupDetails(adapter, { groupId: GONE_ID })).rejects.toThrow(/ECONNRESET/);
	});
});

describe("FIX-72 — o card de simulacao expoe o groupId (quotaId real)", () => {
	it("simulationResultSchema declara groupId", () => {
		expect(simulationResultSchema.shape.groupId).toBeDefined();
	});
});
