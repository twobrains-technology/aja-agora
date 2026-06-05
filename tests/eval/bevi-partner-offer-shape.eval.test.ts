// ============================================================================
// Teste de CONTRATO opt-in — shape da oferta da API de Parceiro Bevi/AGX
// ----------------------------------------------------------------------------
// FIX-13: o card de confirmação não mostra prazo porque a oferta de parceiro
// tem EXATAMENTE 8 campos e `term` NÃO é um deles (spec §7, verificado ao vivo
// em 2026-06-05). Este teste simula 1× contra a API REAL e trava o shape:
//
//   - GANHOU campo (ex.: `term`)? → falha avisando pra PROMOVER o campo pro
//     card real-offer.tsx (resolve o FIX-13 na raiz — opção (c) do fix).
//   - PERDEU campo? → falha porque o mapper/runtime quebram.
//
// Opt-in (spec §13: "gated por env, nunca no CI público — cria dado real"):
//   roda SÓ com BEVI_API_TOKEN presente, e tests/eval/ fica FORA do PR
//   (vitest.config.ts não inclui; só vitest.eval.config.ts, nightly).
//   CPF de teste 12345678909 na loja-piloto — nunca CPF real aqui (LGPD).
//
// Como rodar manualmente:
//   npx vitest run --config vitest.eval.config.ts tests/eval/bevi-partner-offer-shape.eval.test.ts
// ============================================================================

import { describe, expect, it } from "vitest";
import { BeviApiAdapter } from "@/lib/adapters/bevi/bevi-api-adapter";

const hasToken = !!(process.env.BEVI_API_TOKEN ?? "").trim();

/** Os 8 campos da oferta de parceiro hoje (spec §7) — ordem alfabética. */
const EXPECTED_KEYS = [
	"administradora",
	"grupo",
	"ofertaId",
	"parcela",
	"quotaId",
	"taxaContemplacao",
	"tipoOferta",
	"valorCarta",
] as const;

describe.runIf(hasToken)("CONTRATO — shape da oferta da API de Parceiro (FIX-13)", () => {
	it(
		"oferta tem EXATAMENTE os 8 campos — se ganhou `term`, promover pro card real-offer",
		{ timeout: 60_000 },
		async () => {
			const gateway = new BeviApiAdapter();

			// Loja-piloto + CPF de teste (spec §6) — mesma sequência da verificação
			// ao vivo de 2026-06-05 (MOTOS, R$ 40.000 → 11 ofertas).
			const { proposalId } = await gateway.createProposal({
				cpf: "12345678909",
				celular: "11999998888",
				termoLgpd: true,
				consultaDados: true,
				ignoreOngoingProposals: true,
			});

			const sim = await gateway.simulate({
				proposalId,
				segmento: "MOTOS",
				tipoSimulacao: "valor_total",
				valor: 40_000,
				objetivo: "contemplacao_rapida",
				lanceEmbutido: "nenhum",
			});

			expect(sim.offers.length).toBeGreaterThan(0);

			for (const offer of sim.offers) {
				const keys = Object.keys(offer).sort();
				expect(
					keys,
					`Shape da oferta de parceiro MUDOU (oferta ${offer.ofertaId}).\n` +
						`Esperado: ${EXPECTED_KEYS.join(", ")}\nRecebido: ${keys.join(", ")}\n` +
						"→ Campo NOVO (ex. `term`)? PROMOVA pro card real-offer.tsx e " +
						"closing-presentation.ts (fecha o FIX-13 na raiz).\n" +
						"→ Campo REMOVIDO? Verifique partner-offer-mapper.ts e o runtime do fechamento.",
				).toEqual([...EXPECTED_KEYS]);
			}
		},
	);
});

// Sem token: deixa rastro explícito no relatório do nightly em vez de sumir.
describe.runIf(!hasToken)("CONTRATO — shape da oferta de parceiro (SKIP)", () => {
	it.skip("BEVI_API_TOKEN ausente — contrato não verificado nesta run", () => {});
});
