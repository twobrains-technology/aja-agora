// FIX-322 (rodada 10, achado ao vivo durante verificação do FIX-321, dossiê
// Mario onda 4): `recommend_groups` exigia `budget: positive()` — mas o
// próprio FIX-276 (recommendation.ts:10-17) já documenta que "o usuário nunca
// informa orçamento mensal... budget é INVENTADO pelo LLM (recommend_groups
// exige o campo, mas não há de onde vir um número real)" e o scoring
// (`monthlyFitScore`) já trata `budget<=0` graciosamente (contribui 0, não
// quebra). Quando o modelo, corretamente, NÃO inventa um orçamento fictício e
// passa `budget: 0` (honesto: "sem dado"), a validação do schema rejeitava a
// chamada inteira — `Type validation failed: budget too_small` — derrubando o
// turno pro fallback degradado (achado ao vivo: Mario nunca disse orçamento
// mensal, só o valor do bem, e a busca falhava sempre que o modelo tentava
// ser honesto sobre a ausência do dado).
import { describe, expect, it } from "vitest";
import { recommendGroupsSchema } from "./ai-sdk";

describe("FIX-322 — recommend_groups aceita budget=0 (sem dado, mesmo padrão de desiredTermMonths)", () => {
	it("budget=0 NÃO falha mais a validação (antes: too_small, exigia >0)", () => {
		const parsed = recommendGroupsSchema.parse({ category: "auto", budget: 0 });
		expect(parsed.budget).toBe(0);
	});

	it("budget omitido usa o default 0 (mesmo padrão de desiredTermMonths)", () => {
		const parsed = recommendGroupsSchema.parse({ category: "auto" });
		expect(parsed.budget).toBe(0);
	});

	it("budget negativo continua FALHANDO (só 0 é o sentinel de 'sem dado')", () => {
		expect(() => recommendGroupsSchema.parse({ category: "auto", budget: -100 })).toThrow();
	});

	it("budget positivo real continua funcionando (regressão FIX-257)", () => {
		const parsed = recommendGroupsSchema.parse({ category: "auto", budget: 1800 });
		expect(parsed.budget).toBe(1800);
	});
});
