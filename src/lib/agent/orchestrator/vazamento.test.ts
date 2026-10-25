import { describe, expect, it } from "vitest";
import { NOMES_DAS_TOOLS_LIVRES } from "@/lib/agent/pi/tools-livres";
import { isInternalToolLeak, passaFinal } from "./vazamento";

describe("vazamento — nome de tool na fala não chega ao cliente", () => {
	// L19/P274 — `status_da_proposta` entrou no toolset do vendedor livre e ficou
	// fora do filtro: o modelo podia escrever o nome da tool na fala e o cliente lia.
	it("filtra status_da_proposta", () => {
		expect(isInternalToolLeak("Vou chamar status_da_proposta agora.")).toBe(true);
		expect(passaFinal("Consultando com status_da_proposta.")).toBe("");
	});

	// A lista do filtro é um espelho manual da lista de tools: tool nova em
	// `NOMES_DAS_TOOLS_LIVRES` sem entrada aqui é vazamento silencioso.
	it("cobre TODAS as tools do vendedor livre", () => {
		const faltando = NOMES_DAS_TOOLS_LIVRES.filter(
			(nome) => !isInternalToolLeak(`Vou chamar ${nome}.`),
		);
		expect(faltando).toEqual([]);
	});

	it("não derruba fala normal que só parece técnica", () => {
		expect(isInternalToolLeak("Sua proposta está em análise na administradora.")).toBe(false);
	});
});
