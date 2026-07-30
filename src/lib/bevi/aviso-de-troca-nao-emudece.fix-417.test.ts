// FIX-417 — tirar o VÍNCULO era o objetivo; tirar o AVISO foi dano colateral.
//
// A 12ª revisão independente mediu duas consequências do FIX-414 que eu não tinha
// previsto, e as duas são da mesma natureza: eu removi o texto do caminho do
// dinheiro e, junto, removi o que o cliente enxergava.
//
//   1. `valor` passou a cair no `creditMax` sem cota ancorada. O cliente vê uma
//      carta de 171.000, o teto que ele falou é 180.000, a Bevi recebe 180.000 e
//      devolve uma cota NOVA. É o bait-and-switch que o FIX-73 nomeou, reaberto.
//
//   2. O aviso do FIX-259 ("a administradora fechada divergiu") exigia
//      `administradoraPreferida` preenchida pra comparar. Com ela nula — o caso
//      comum agora —, o aviso emudeceu: o gateway escolhia por proximidade de
//      valor e ninguém contava isso ao cliente.
//
// ── A DISTINÇÃO QUE FALTAVA, e que estes testes fixam ──
//
//   VÍNCULO      (`administradoraPreferida`) — compromete dinheiro. Só de ação
//                estruturada. É a parede, e ela fica de pé.
//   DICA         (`valor`) — orienta o matching. Pode vir da carta EXIBIDA: usar o
//                número que o cliente viu não o compromete com marca nenhuma.
//   OBSERVAÇÃO   (`administradoraExibida`) — só serve pra comparar no fim e AVISAR.
//                Não entra no matching.
//
// Eu tinha tratado os três como um só. São três, e confundi-los custou um
// bait-and-switch e um silêncio.
import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { buildStartContractInput } from "./contract-input";

const IDENT = { cpf: "12345678909", celular: "62999887766", lgpd: true };

/** Jornada de texto puro: o cliente viu a Rodobens de 171 mil na tela, e nunca
 * clicou em nada. É a maioria das conversas. */
const VIU_MAS_NAO_CLICOU = {
	currentCategory: "auto",
	revealCompleted: true,
	recommendedAdministradora: "RODOBENS",
	recommendedOffer: {
		administradora: "RODOBENS",
		creditValue: 171_000,
		termMonths: 96,
		monthlyPayment: 2_719,
	},
	qualifyAnswers: { creditMax: 180_000 },
} as unknown as ConversationMetadata;

describe("FIX-417 — os três campos são três coisas diferentes", () => {
	it("a DICA de matching é a carta que o cliente viu, não o teto que ele falou", () => {
		// Sem isto, a Bevi procura perto de 180.000 e devolve uma cota que nunca
		// esteve na tela — o bait-and-switch do FIX-73.
		expect(buildStartContractInput(VIU_MAS_NAO_CLICOU, IDENT).valor).toBe(171_000);
	});

	it("o VÍNCULO continua exigindo ação estruturada — a parede não regride", () => {
		// A metade que impede este fix de desfazer o anterior. Usar a carta como
		// dica é seguro; usar a MARCA como vínculo não é, e continua barrado.
		expect(buildStartContractInput(VIU_MAS_NAO_CLICOU, IDENT).administradoraPreferida).toBeNull();
		expect(buildStartContractInput(VIU_MAS_NAO_CLICOU, IDENT).prazoPreferido).toBeNull();
	});

	it("a OBSERVAÇÃO carrega a marca da tela — é o que faz o aviso de troca falar", () => {
		// `administradoraChanged` (fulfillment.ts) compara a marca que voltou do
		// gateway contra esta. Sem ela, o campo de comparação era
		// `administradoraPreferida` — nula no caminho sem clique —, e a troca
		// acontecia em silêncio.
		expect(buildStartContractInput(VIU_MAS_NAO_CLICOU, IDENT).administradoraExibida).toBe(
			"RODOBENS",
		);
	});

	it("com cota ancorada, os três apontam pra ela", () => {
		const comClique = {
			...VIU_MAS_NAO_CLICOU,
			contractOffer: {
				administradora: "CANOPUS",
				creditValue: 170_000,
				termMonths: 120,
				monthlyPayment: 1_092,
			},
		} as unknown as ConversationMetadata;

		const input = buildStartContractInput(comClique, IDENT);

		expect(input.administradoraPreferida).toBe("CANOPUS");
		expect(input.administradoraExibida).toBe("CANOPUS");
		expect(input.valor).toBe(170_000);
	});

	it("carta STALE de administradora abandonada não vira dica (o FIX-251 volta)", () => {
		// Eu tinha apagado este guard no FIX-414 alegando que a divergência ficara
		// impossível. Ficou impossível para a MARCA (que hoje vem de uma cota
		// inteira, ancorada de uma vez) e continua possível para o VALOR: um what-if
		// rejeitado deixa `recommendedOffer` numa marca diferente da confirmada, e a
		// carta dele é de uma oferta que o cliente dispensou.
		const staleDeWhatIf = {
			currentCategory: "auto",
			qualifyAnswers: { creditMax: 90_000 },
			recommendedAdministradora: "RODOBENS", // reconfirmada
			recommendedOffer: {
				administradora: "ITAU", // resíduo do what-if rejeitado
				creditValue: 161_258,
				termMonths: 200,
				monthlyPayment: 2_984.38,
			},
		} as unknown as ConversationMetadata;

		const input = buildStartContractInput(staleDeWhatIf, IDENT);

		expect(input.valor).not.toBe(161_258);
		expect(input.valor).toBe(90_000);
	});
});
