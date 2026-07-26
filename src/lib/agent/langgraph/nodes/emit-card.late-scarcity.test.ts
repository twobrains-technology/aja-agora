// FIX-372 (rodada 4 — achado ao vivo pelo orquestrador na verificação final da
// campanha vendedor-matador): em 7 conversas reais de teste (rodadas 1 e 3),
// 0 viram o card de escassez — não por falta de dado da Bevi (confirmado no
// banco: as ofertas ancoradas tinham `availableSlots` real em todas), mas
// porque o gate `decision` (único lugar que emitia escassez) é PULADO pra
// sempre assim que o cliente decide rápido ("bora fechar") e `escolha` fica
// ancorada — exatamente o perfil "com pressa" que mais precisa do empurrão de
// urgência. `shouldEmitLateScarcity` é a rede de segurança: mostra a escassez
// uma vez, na hora de ir pro formulário de contrato, se ainda não apareceu.

import { describe, expect, it } from "vitest";
import { shouldEmitLateScarcity } from "./emit-card";

const funnelBase = {
	scarcityDispatched: undefined as boolean | undefined,
	qualifyAnswers: { hasLance: "yes" as const },
};

describe("shouldEmitLateScarcity (FIX-372)", () => {
	it("gate=contract + escassez ainda não mostrada + não é so_parcela → true", () => {
		expect(shouldEmitLateScarcity("contract", funnelBase)).toBe(true);
	});

	it("escassez JÁ foi mostrada nesta conversa → false (nunca duplica)", () => {
		expect(shouldEmitLateScarcity("contract", { ...funnelBase, scarcityDispatched: true })).toBe(
			false,
		);
	});

	it("ramo so_parcela (decisão #4 do goal doc, escassez fora de propósito) → false", () => {
		expect(
			shouldEmitLateScarcity("contract", {
				...funnelBase,
				qualifyAnswers: { hasLance: "so_parcela" },
			}),
		).toBe(false);
	});

	it("gate diferente de 'contract' (ainda não chegou na hora do formulário) → false", () => {
		expect(shouldEmitLateScarcity("decision", funnelBase)).toBe(false);
		expect(shouldEmitLateScarcity("identify", funnelBase)).toBe(false);
		expect(shouldEmitLateScarcity(undefined, funnelBase)).toBe(false);
	});

	it("cliente decidido (hasLance='yes', sem so_parcela) que nunca passou pelo gate decision — cenário real do bug — dispara true", () => {
		// Este é o cenário exato observado ao vivo: `escolha` ancorada por
		// "afirmação" pulou o gate `decision` inteiro, `decisionDispatched` nunca
		// vira true, mas ao chegar em `contract` a rede de segurança dispara.
		expect(
			shouldEmitLateScarcity("contract", {
				scarcityDispatched: undefined,
				qualifyAnswers: { hasLance: "yes" },
			}),
		).toBe(true);
	});
});
