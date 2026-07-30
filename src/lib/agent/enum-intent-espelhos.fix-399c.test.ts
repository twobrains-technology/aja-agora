// FIX-399c/399f — os TRÊS espelhos do enum de intent não podem divergir da FONTE.
//
// `UserIntent` (qualify-state.ts) é a fonte, e existem três espelhos manuais:
// `validations/persona.ts` (schema do form de persona), `diagnose/types.ts`
// (schema do diagnóstico LLM-as-doctor), e `turn-analyzer.ts:userIntentAnalyzerEnum`
// (o schema que a LLM de fato preenche — o mais importante dos três e o único que
// não tinha teste nenhum).
//
// ⚠️ HISTÓRICO — leia antes de "melhorar" este arquivo de novo. A 1ª versão
// comparava os espelhos contra uma lista TRANSCRITA À MÃO (`INTENTS_CANONICOS`).
// 3ª revisão independente reverteu `qualify-state.ts` inteiro pra HEAD (some
// `declines` da FONTE) e o teste continuou VERDE — ele comparava os espelhos
// entre si e contra uma cópia solta, nunca contra o tipo de verdade.
//
// A correção: `USER_INTENT_VALUES` (qualify-state.ts) é verificado em tempo de
// COMPILAÇÃO contra `UserIntent` — `satisfies` barra valor inválido, e
// `_UserIntentCompleto` (`Exclude<UserIntent, ...> extends never`) quebra o
// `tsc` se algum valor do tipo ficar de fora do array. Este teste importa ESSE
// array (não uma lista própria) e compara contra os três espelhos. Enum novo
// que não entrar em `USER_INTENT_VALUES` já não compila; que entrar lá e não
// entrar num espelho, este teste aponta qual.
import { describe, expect, it } from "vitest";
import { USER_INTENT_VALUES } from "@/lib/agent/qualify-state";
import { userIntentAnalyzerEnum } from "@/lib/agent/turn-analyzer";
import { diagnoseUserIntentEnum } from "@/lib/diagnose/types";
import { personaUserIntentEnum } from "@/lib/validations/persona";

const CANONICO = [...USER_INTENT_VALUES].sort();

describe("FIX-399c/399f — espelhos do enum de UserIntent, contra a FONTE", () => {
	it("turn-analyzer.ts (o que a LLM de fato emite) cobre exatamente a fonte", () => {
		// O espelho que mais importa: se ele ficar pra trás, o modelo NUNCA
		// consegue produzir o rótulo novo — e nada mais acusa isso, porque o
		// analyzer não passa por `z.infer` de lugar nenhum que o tsc cheque contra
		// `UserIntent` (ele SAI de `UserIntent`, não entra nele).
		expect([...userIntentAnalyzerEnum.options].sort()).toEqual(CANONICO);
	});

	it("validations/persona.ts cobre exatamente a fonte", () => {
		expect([...personaUserIntentEnum.options].sort()).toEqual(CANONICO);
	});

	it("diagnose/types.ts cobre exatamente a fonte", () => {
		expect([...diagnoseUserIntentEnum.options].sort()).toEqual(CANONICO);
	});

	it("a fonte em si não está vazia (sentinela contra typo no import)", () => {
		// Se `USER_INTENT_VALUES` virasse `[]` por engano, as três comparações
		// acima passariam (array vazio == array vazio) sem provar nada.
		expect(CANONICO.length).toBeGreaterThanOrEqual(9);
		expect(CANONICO).toContain("declines");
	});
});
