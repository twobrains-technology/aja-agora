import { describe, expect, it } from "vitest";
import { isProcessPreamble } from "./sanitizer";

// ============================================================================
// FIX-352 — meta-narrativa: parar de brigar com LISTA DE FRASES
// ----------------------------------------------------------------------------
// O guard de anúncio-de-passo (FIX-335, ampliado no FIX-348) é uma lista fechada
// de objetos vagos ("a mais adequada", "a melhor opção", "as opções"...). O modelo
// escapa por variação — ao vivo (2026-07-14) saiu:
//
//     "Encontramos 23 opções na sua faixa — vou trazer a que melhor encaixa
//      com seu perfil."
//
// "a que melhor encaixa" não estava na lista. É gato-e-rato: cada rodada o juiz
// acha uma frase nova (3 rodadas seguidas com este achado).
//
// A regra ESTRUTURAL, que não depende de adivinhar a frase:
//   "vou/deixa eu + (mostrar|trazer|apresentar|simular|detalhar|recomendar)"
//   SEM nenhum dado concreto (número ou nome de administradora) = anúncio de passo.
//
// Se tem dado concreto, é narração legítima ("Vou simular a Rodobens com R$ 900 mil")
// e PASSA — o agente pode e deve falar dos números que já tem.
// ============================================================================

describe("meta-narrativa: anúncio VAGO cai, narração COM DADO passa", () => {
	const ANUNCIOS_VAGOS = [
		"vou trazer a que melhor encaixa com seu perfil",
		"Agora vou te recomendar a mais adequada:",
		"Deixa eu apresentar as opções pra você escolher uma e simular:",
		"vou te mostrar o cenário completo",
		"deixa eu detalhar como fica sua simulação",
		"vou trazer a que mais faz sentido pra você",
		"deixa eu te mostrar a que eu mais indico",
	];

	for (const frase of ANUNCIOS_VAGOS) {
		it(`dropa o anúncio vago: "${frase.slice(0, 42)}…"`, () => {
			expect(
				isProcessPreamble(frase),
				"anunciar o próximo passo sem nenhum dado concreto é log de pipeline, não conversa — o agente deve FAZER, não anunciar que vai fazer",
			).toBe(true);
		});
	}

	const NARRACOES_LEGITIMAS = [
		"Vou simular a Rodobens com R$ 900 mil:",
		"Deixa eu te apresentar a proposta da Itaú, R$ 1.200 por mês",
		"Essa é a que eu indicaria pra você — melhor custo-benefício na faixa de 150 mil",
		"Olha só o que encontrei:",
		"Encontramos 23 boas opções pra você!",
		"A ITAÚ tem a parcela mais leve entre as três.",
	];

	for (const frase of NARRACOES_LEGITIMAS) {
		it(`PASSA (tem dado concreto ou é transição curta): "${frase.slice(0, 42)}…"`, () => {
			expect(
				isProcessPreamble(frase),
				"o guard não pode virar mordaça — narração com número/administradora e transição curta são conversa legítima",
			).toBe(false);
		});
	}
});
