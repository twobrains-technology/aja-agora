// Produção, 2026-08 — o agente contou pro cliente que a MÁQUINA falhou.
//
// Caso da Bruna (conv 31dc7e52, texto literal do banco):
//   "Agora vou trazer as melhores opções de consórcio pra você com R$ 300 mil.
//    Um segundo aí. Deixa eu tentar de outro jeito aqui.
//    Infelizmente a busca travou por um segundo."
//
// E o card `comparison_table` saiu LOGO EM SEGUIDA, no mesmo turno: a busca não
// travou coisa nenhuma. O modelo narrou uma falha que não houve — provavelmente
// contando um retry interno — e o cliente leu "travou" antes de ver as ofertas
// aparecerem normalmente. São 6 ocorrências de "de outro jeito" na base.
//
// Isto é da família do FIX-190 (fallback técnico) e do FIX-283 (narração do
// mecanismo interno): o que acontece dentro da máquina não é assunto do
// cliente. Entra em `factualDropReason`, não em estilo, porque a frase afirma um
// FATO — e um fato falso.
//
// A fronteira que o guard NÃO pode cruzar: honestidade sobre o NEGÓCIO continua
// passando inteira. "As opções na sua faixa estão limitadas hoje" e "não achei
// nada nessa faixa" são verdade sobre a oferta, não sobre o encanamento, e o
// agente precisa poder dizer — inclusive porque o directive de escassez manda
// dizer.

import { describe, expect, it } from "vitest";
import {
	isInternalFailureNarration,
	stripProcessPreamble,
} from "@/lib/agent/orchestrator/sanitizer";

describe("narração de falha interna", () => {
	it("dropa as frases literais que a Bruna recebeu em produção", () => {
		expect(isInternalFailureNarration("Deixa eu tentar de outro jeito aqui.")).toBe(true);
		expect(isInternalFailureNarration("Infelizmente a busca travou por um segundo.")).toBe(true);
		expect(
			isInternalFailureNarration("Deixa eu tentar de outro jeito com as informações que já temos."),
		).toBe(true);
	});

	it("dropa retentativa anunciada em voz alta", () => {
		for (const s of [
			"Vou tentar de novo.",
			"Deixa eu tentar novamente.",
			"Vou tentar outra vez aqui.",
			"Deixa eu tentar de outra forma.",
		]) {
			expect(isInternalFailureNarration(s), s).toBe(true);
		}
	});

	it("dropa falha de sistema contada ao cliente", () => {
		for (const s of [
			"A busca falhou.",
			"O sistema travou aqui.",
			"A busca não respondeu.",
			"Tive um problema técnico aqui.",
			"Deu um erro na busca.",
			"O sistema está instável no momento.",
		]) {
			expect(isInternalFailureNarration(s), s).toBe(true);
		}
	});

	it("NÃO dropa honestidade sobre a oferta — isso é negócio, não encanamento", () => {
		for (const s of [
			"As opções na sua faixa estão limitadas hoje.",
			"Não encontrei nenhum grupo nessa faixa de valor.",
			"Essa faixa tem menos grupos disponíveis do que o normal.",
			"Encontrei 3 boas opções pra você!",
			"A ITAÚ tem uma cota de R$ 300.000 com parcela de R$ 1.850.",
			"Vou simular a Rodobens com R$ 900 mil.",
		]) {
			expect(isInternalFailureNarration(s), s).toBe(false);
		}
	});

	it("o turno inteiro da Bruna sai limpo, preservando a fala real", () => {
		const bruta =
			"Ótimo, Bruna! Seus dados já estão registrados. Agora vou trazer as melhores opções de consórcio pra você com R$ 300 mil. Um segundo aí. Deixa eu tentar de outro jeito aqui. Infelizmente a busca travou por um segundo.";
		const limpo = stripProcessPreamble(bruta);
		expect(limpo).toContain("Ótimo, Bruna");
		expect(limpo).not.toContain("travou");
		expect(limpo).not.toContain("de outro jeito");
		expect(limpo).not.toContain("Um segundo aí");
	});
});
