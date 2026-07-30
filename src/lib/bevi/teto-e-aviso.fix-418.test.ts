// FIX-418 — o teto que o cliente declarou é limite, e o aviso precisa ter o quê dizer.
//
// A 13ª revisão independente reverteu a recomendação que eu tinha dado ao Kairo.
// Eu disse "suba o 9fc44a15"; ela mediu e mostrou que, no pior caso, ele é PIOR
// que o que já está em produção:
//
//   jornada honesta (viu 171k, teto 180k)     65bf1301: 180.000  ·  9fc44a15: 171.000 ✅
//   após what-if de 300k que o cliente RECUSOU 65bf1301: 180.000  ·  9fc44a15: 300.000 ❌
//
// O FIX-417 trocou um erro LIMITADO — o teto que o próprio cliente declarou — por
// um erro ILIMITADO: o último card renderizado, sem limite superior. Num caminho
// que cria proposta real com CPF e consulta de bureau, isso não é upgrade.
//
// A causa é uma premissa minha que não se sustenta: eu tratei "a carta exibida" e
// "o que o cliente pediu" como se a primeira sempre respeitasse a segunda. Um
// what-if recusado deixa na tela uma carta que ele NÃO pediu, e `recommendedOffer`
// não tem teto nenhum.
//
// A correção é a menor possível e não desfaz o FIX-417: a carta exibida continua
// sendo a dica de matching, MAS limitada pelo teto declarado. Dentro do teto ela
// vale (é o número que ele viu); acima dele, não é dica, é resíduo.
//
// ── O SEGUNDO objetivo do FIX-417, que eu declarei e não entreguei ──
//
// `administradoraChanged` passou a comparar contra `marcaNaTela`, mas
// `previousAdministradora` continuou vindo de `administradoraPreferida` — nula
// justamente na jornada sem clique, o caso que o commit dizia estar corrigindo.
// Os dois consumidores exigem que ela seja truthy, então o aviso seguia MUDO: o
// cliente via "Confirmei com a ITAÚ" com RODOBENS na tela.
//
// A 13ª revisão provou que era vácuo: revertendo `marcaNaTela`, ZERO de 2358
// testes falhavam. Um arquivo batizado "o aviso não emudece" que não checava o
// aviso — a mesma vacuidade que a revisão anterior tinha cobrado, repetida no
// commit que se propunha a corrigi-la.
import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { buildStartContractInput } from "./contract-input";

const IDENT = { cpf: "12345678909", celular: "62999887766", lgpd: true };

function meta(over: Record<string, unknown>): ConversationMetadata {
	return {
		currentCategory: "auto",
		revealCompleted: true,
		recommendedAdministradora: "RODOBENS",
		...over,
	} as unknown as ConversationMetadata;
}

describe("FIX-418 — a carta exibida é dica, o teto declarado é limite", () => {
	it("carta DENTRO do teto vale como dica (o ganho do FIX-417 não regride)", () => {
		const input = buildStartContractInput(
			meta({
				recommendedOffer: { administradora: "RODOBENS", creditValue: 171_000, termMonths: 96 },
				qualifyAnswers: { creditMax: 180_000 },
			}),
			IDENT,
		);
		// É o número que o cliente viu no card — mandar o teto aqui é o
		// bait-and-switch que o FIX-73 nomeou.
		expect(input.valor).toBe(171_000);
	});

	it("carta ACIMA do teto NÃO vale — resíduo de what-if recusado não vira pedido", () => {
		// O caso que a 13ª revisão mediu. O cliente declarou 180 mil; um what-if de
		// 300 mil que ele recusou ficou em `recommendedOffer`. Mandar 300 mil é pedir
		// 66% acima do que ele disse — com CPF e consulta de bureau no fim.
		const input = buildStartContractInput(
			meta({
				recommendedOffer: { administradora: "RODOBENS", creditValue: 300_000, termMonths: 120 },
				qualifyAnswers: { creditMax: 180_000 },
			}),
			IDENT,
		);
		expect(input.valor).toBe(180_000);
	});

	it("a cota ANCORADA por clique não é limitada pelo teto", () => {
		// A exceção é deliberada e é a única: se o cliente CLICOU numa cota, ele
		// escolheu aquele número — mesmo acima do teto que tinha dito antes. Ação
		// estruturada é a decisão mais recente, e limitar aqui seria ignorá-la.
		const input = buildStartContractInput(
			meta({
				contractOffer: { administradora: "CANOPUS", creditValue: 300_000, termMonths: 120 },
				qualifyAnswers: { creditMax: 180_000 },
			}),
			IDENT,
		);
		expect(input.valor).toBe(300_000);
	});

	it("sem teto declarado, a carta exibida segue valendo", () => {
		// Defensivo: `creditMax` ausente não pode virar "limite zero" e derrubar a
		// dica — seria trocar um defeito por outro, que é o padrão que esta campanha
		// vem repetindo.
		const input = buildStartContractInput(
			meta({
				recommendedOffer: { administradora: "RODOBENS", creditValue: 171_000, termMonths: 96 },
				qualifyAnswers: {},
			}),
			IDENT,
		);
		expect(input.valor).toBe(171_000);
	});
});
