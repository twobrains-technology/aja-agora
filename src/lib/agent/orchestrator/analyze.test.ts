import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Category, ConversationMetadata } from "@/lib/agent/personas";
import { clampCreditToCategory } from "@/lib/agent/qualify-config";
import type { TurnAnalysis } from "@/lib/agent/turn-analyzer";
import { nextGate } from "@/lib/agent/qualify-state";
import { analyzeAndMerge } from "./analyze";

// FIX-33 — guardrail server-side do valor de carta na faixa da categoria.
// Auditoria 2026-06-12: o valor extraído por TEXTO LIVRE ("quero uma carta de 5
// milhões de auto") não tinha clamp — passava pelo funil até morrer na Bevi ou
// retornar oferta absurda. Os sliders da UI já limitam por CREDIT_BOUNDS; o
// caminho de texto livre não. Este fix aplica o mesmo teto/piso no merge do
// analyzer.

// Mock do analyzer LLM — controla o `analysis.creditMax` extraído.
vi.mock("@/lib/agent/turn-analyzer", () => ({ analyzeTurn: vi.fn() }));

import { analyzeTurn } from "@/lib/agent/turn-analyzer";

const NEUTRAL: TurnAnalysis = {
	reasoning: "t",
	detectedCategory: null,
	detectedSubTopic: null,
	isExplicitSwitch: false,
	expertiseLevel: "neutro",
	experiencePrev: null,
	creditMin: null,
	creditMax: null,
	prazoMeses: null,
	hasLance: null,
	userIntent: "neutral",
};

describe("FIX-33 — clampCreditToCategory (função pura)", () => {
	it("acima do teto clampa no teto (auto: 500k — FIX-54)", () => {
		const r = clampCreditToCategory(5_000_000, "auto");
		expect(r.value).toBe(500_000);
		expect(r.clamped).toBe(true);
		expect(r.max).toBe(500_000);
		expect(r.min).toBe(20_000);
	});

	it("abaixo do piso clampa no piso (auto: 20k)", () => {
		const r = clampCreditToCategory(500, "auto");
		expect(r.value).toBe(20_000);
		expect(r.clamped).toBe(true);
		expect(r.min).toBe(20_000);
	});

	it("dentro da faixa passa intacto (clamped=false)", () => {
		const r = clampCreditToCategory(150_000, "auto");
		expect(r.value).toBe(150_000);
		expect(r.clamped).toBe(false);
	});

	it.each<[Category, number, number]>([
		["imovel", 5_000_000, 2_000_000],
		["imovel", 50_000, 100_000],
		["auto", 5_000_000, 500_000],
		["auto", 500, 20_000],
		["moto", 200_000, 80_000],
		["moto", 1_000, 8_000],
		["servicos", 9_000_000, 500_000],
		["servicos", 100, 10_000],
	])("matriz %s: %d clampa pra %d", (cat, input, expected) => {
		expect(clampCreditToCategory(input, cat).value).toBe(expected);
	});
});

describe("FIX-33 — analyzeAndMerge aplica o clamp na faixa da categoria", () => {
	beforeEach(() => {
		vi.mocked(analyzeTurn).mockReset();
	});

	it("carta de 5 milhões de auto → creditMax clampado (500k — FIX-54), creditClampedFrom=5M", async () => {
		vi.mocked(analyzeTurn).mockResolvedValue({ ...NEUTRAL, creditMax: 5_000_000 });
		const meta: ConversationMetadata = { currentCategory: "auto" };
		await analyzeAndMerge("quero uma carta de 5 milhoes de auto", "auto", meta);

		expect(meta.qualifyAnswers?.creditMax).toBe(500_000);
		expect(meta.qualifyAnswers?.creditClampedFrom).toBe(5_000_000);
		// creditMin derivado respeita a faixa.
		expect(meta.qualifyAnswers?.creditMin).toBeLessThanOrEqual(500_000);
		expect(meta.qualifyAnswers?.creditMin ?? 0).toBeGreaterThan(0);
	});

	it("valor dentro da faixa NÃO marca clamp", async () => {
		vi.mocked(analyzeTurn).mockResolvedValue({ ...NEUTRAL, creditMax: 150_000 });
		const meta: ConversationMetadata = { currentCategory: "auto" };
		await analyzeAndMerge("uns 150 mil", "auto", meta);

		expect(meta.qualifyAnswers?.creditMax).toBe(150_000);
		expect(meta.qualifyAnswers?.creditClampedFrom).toBeUndefined();
	});

	it("creditMin extraído acima do teto também herda o clamp", async () => {
		vi.mocked(analyzeTurn).mockResolvedValue({
			...NEUTRAL,
			creditMax: 5_000_000,
			creditMin: 4_000_000,
		});
		const meta: ConversationMetadata = { currentCategory: "auto" };
		await analyzeAndMerge("entre 4 e 5 milhoes", "auto", meta);

		expect(meta.qualifyAnswers?.creditMax).toBe(500_000);
		expect(meta.qualifyAnswers?.creditMin).toBeLessThanOrEqual(500_000);
	});

	it("sem categoria definida NÃO clampa (defensivo — sem faixa de referência)", async () => {
		vi.mocked(analyzeTurn).mockResolvedValue({ ...NEUTRAL, creditMax: 5_000_000 });
		const meta: ConversationMetadata = {};
		await analyzeAndMerge("5 milhoes", "concierge", meta);

		expect(meta.qualifyAnswers?.creditMax).toBe(5_000_000);
		expect(meta.qualifyAnswers?.creditClampedFrom).toBeUndefined();
	});
});

// BUG (QA noturno E2E browser, 2026-06-21): o funil pulava o passo 2 da jornada
// canônica (experiência + consent) sempre que o usuário mencionava o valor em
// texto livre — caminho MAIS comum, pois a landing incentiva "Quero um carro de
// até R$ 80 mil…". `analyze.ts` cravava experiencePrev="returning" + consent=true
// só por ter extraído um campo de qualificação, e o nextGate caía direto em
// `identify`. Confronto: jornada-canonica.md §2 ("Você já participou de um
// consórcio antes?" → explicação se não → "Entendi, pode continuar") é etapa
// sequencial obrigatória, NÃO condicionada a "não ter dito o valor".
// Card: docs/correcoes/inbox/2026-06-21-funil-pula-experience-consent.md
describe("BUG-FUNIL-PULA-PASSO2 — valor em texto livre não presume experiência/consent", () => {
	beforeEach(() => {
		vi.mocked(analyzeTurn).mockReset();
	});

	it("valor sem sinal de experiência NÃO crava experiencePrev='returning' nem consent (dado fica salvo)", async () => {
		// Espelha o cenário real do browser: "carro de 80 mil, 850/mês" — o
		// analyzer extrai o valor mas NÃO detecta experiência (experiencePrev=null).
		vi.mocked(analyzeTurn).mockResolvedValue({ ...NEUTRAL, creditMax: 80_000 });
		const meta: ConversationMetadata = { currentCategory: "auto" };
		await analyzeAndMerge("quero um carro de uns 80 mil, gastando perto de 850 por mes", "auto", meta);

		// o valor é preservado — não se re-pergunta
		expect(meta.qualifyAnswers?.creditMax).toBe(80_000);
		// mas a experiência NÃO é inventada e o consent NÃO é presumido
		expect(meta.experiencePrev).toBeUndefined();
		expect(meta.qualifyConsented).toBeFalsy();
	});

	it("meta resultante → nextGate dispara 'experience' (passo 2 do docx), não 'identify'", async () => {
		vi.mocked(analyzeTurn).mockResolvedValue({ ...NEUTRAL, creditMax: 80_000 });
		const meta: ConversationMetadata = { currentCategory: "auto" };
		await analyzeAndMerge("um carro de 80 mil", "auto", meta);

		// nome já capturado; o próximo gate canônico é a pergunta de experiência
		expect(nextGate(meta, { hasContactName: true })).toBe("experience");
	});

	it("classifier COM sinal explícito de experiência ainda marca 'returning' (não regrediu)", async () => {
		vi.mocked(analyzeTurn).mockResolvedValue({
			...NEUTRAL,
			creditMax: 80_000,
			experiencePrev: "returning",
		});
		const meta: ConversationMetadata = { currentCategory: "auto" };
		await analyzeAndMerge("ja fiz consorcio antes, quero um carro de 80 mil", "auto", meta);

		expect(meta.experiencePrev).toBe("returning");
	});
});

// FIX-115 (PROD 2026-06-30) — resiliência do valor por texto.
// Requisito literal do Kairo: "se o componente nao aparecer tem que se resolver
// mesmo assim". O valor por conversa depende do analyzer LLM, que cai em
// NEUTRAL_FALLBACK (creditMax=null) em timeout de cold-start. Sem backstop, "50k"
// não vira número, o gate `credit` re-dispara e o funil TRAVA. O backstop
// determinístico (parseAssetValue) garante o AVANÇO mesmo com o analyzer mudo.
describe("FIX-115 — valor por texto avança o funil mesmo com analyzer mudo (backstop)", () => {
	beforeEach(() => {
		vi.mocked(analyzeTurn).mockReset();
	});

	// meta no passo do valor: nome/experiência/consent/identidade já feitos → o
	// ÚNICO gate pendente é `credit` (o valor). Reproduz o print do bug.
	const atValueStep = (): ConversationMetadata => ({
		currentCategory: "auto",
		experiencePrev: "returning",
		qualifyConsented: true,
		identityCollected: true,
	});

	it("analyzer devolve creditMax=null (timeout) + user 'R$ 50.000' → backstop crava 50000", async () => {
		vi.mocked(analyzeTurn).mockResolvedValue({ ...NEUTRAL, creditMax: null });
		const meta = atValueStep();
		// Antes do merge: o funil ESTÁ preso no gate do valor.
		expect(nextGate(meta, { hasContactName: true })).toBe("credit");

		await analyzeAndMerge("R$ 50.000", "auto", meta);

		expect(meta.qualifyAnswers?.creditMax).toBe(50_000);
		// Depois do merge: o funil AVANÇA (passa do `credit` pro `lance`), não trava.
		expect(nextGate(meta, { hasContactName: true })).toBe("lance");
	});

	it("'50k' e '50 mil' (analyzer mudo) também avançam o funil", async () => {
		for (const text of ["50k", "uns 50 mil então"]) {
			vi.mocked(analyzeTurn).mockResolvedValue({ ...NEUTRAL, creditMax: null });
			const meta = atValueStep();
			await analyzeAndMerge(text, "auto", meta);
			expect(meta.qualifyAnswers?.creditMax, `texto="${text}"`).toBe(50_000);
			expect(nextGate(meta, { hasContactName: true }), `texto="${text}"`).toBe("lance");
		}
	});

	it("o backstop NÃO inventa valor quando não há um (texto sem valor NÃO destrava o gate)", async () => {
		vi.mocked(analyzeTurn).mockResolvedValue({ ...NEUTRAL, creditMax: null });
		const meta = atValueStep();
		await analyzeAndMerge("bora continuar", "auto", meta);
		expect(meta.qualifyAnswers?.creditMax).toBeUndefined();
		// Segue no gate do valor (não pula pra frente sem o dado) — nunca crava lixo.
		expect(nextGate(meta, { hasContactName: true })).toBe("credit");
	});

	it("o analyzer LLM tem prioridade: quando ELE extrai, o backstop não sobrescreve", async () => {
		// '80 mil' — o analyzer acertou 80000; o parseAssetValue leria o mesmo, mas o
		// caminho do analyzer é a fonte primária (não deve haver dupla-escrita).
		vi.mocked(analyzeTurn).mockResolvedValue({ ...NEUTRAL, creditMax: 80_000 });
		const meta = atValueStep();
		await analyzeAndMerge("uns 80 mil", "auto", meta);
		expect(meta.qualifyAnswers?.creditMax).toBe(80_000);
	});

	// Backstop é SÓ coleta inicial: pós-reveal a troca de faixa é decisão do LLM
	// (analyzer providing_info), nunca do regex — senão um número solto reabriria
	// busca à toa (anti BUG-REVEAL-LOOP).
	it("pós-reveal NÃO deixa o regex trocar a faixa (só o analyzer refita)", async () => {
		vi.mocked(analyzeTurn).mockResolvedValue({ ...NEUTRAL, creditMax: null });
		const meta: ConversationMetadata = {
			currentCategory: "auto",
			experiencePrev: "returning",
			qualifyConsented: true,
			identityCollected: true,
			revealCompleted: true,
			qualifyAnswers: { creditMax: 80_000 },
		};
		await analyzeAndMerge("R$ 130.000", "auto", meta);
		// creditMax preservado — o backstop não roda com creditMax já setado.
		expect(meta.qualifyAnswers?.creditMax).toBe(80_000);
	});
});

// FIX-74 (QA dono-de-produto 2026-07-02): "…R$ 70 mil, gastando perto de R$
// 900 por mês" (valor + orçamento mensal, SEM menção temporal) — em produção o
// analyzer LLM classificou "R$ 900/mês" como prazoMeses não-nulo, pulando o
// gate "timeframe" (jornada §2: "Em quanto tempo você gostaria de estar com
// seu bem?"). O gate em si (qualify-state.ts) e a guarda contra null
// (analyze.ts:102-105 original) já existiam — o defeito é confiabilidade do
// analyzer, não ausência de gate. Guard DETERMINÍSTICO: rejeita
// analysis.prazoMeses quando a mensagem só traz sinal de orçamento/parcela
// mensal e nenhuma menção temporal explícita (não confia só no prompt).
describe("FIX-74 — guarda determinística: orçamento mensal nunca vira prazo", () => {
	beforeEach(() => {
		vi.mocked(analyzeTurn).mockReset();
	});

	it("'R$ 900 por mês' sem menção temporal → prazoMeses REJEITADO mesmo se o analyzer classificar errado", async () => {
		// Reproduz o bug real: o analyzer (LLM) classificou por engano.
		vi.mocked(analyzeTurn).mockResolvedValue({
			...NEUTRAL,
			creditMax: 70_000,
			prazoMeses: 117,
		});
		const meta: ConversationMetadata = { currentCategory: "auto" };
		await analyzeAndMerge(
			"Quero um carro de uns R$ 70 mil, gastando perto de R$ 900 por mês.",
			"auto",
			meta,
		);

		expect(meta.qualifyAnswers?.creditMax).toBe(70_000);
		expect(meta.qualifyAnswers?.prazoMeses).toBeUndefined();
	});

	it("'R$ 400/mês' (barra) também é bloqueado — mesma classe de menção mensal", async () => {
		vi.mocked(analyzeTurn).mockResolvedValue({
			...NEUTRAL,
			creditMax: 40_000,
			prazoMeses: 48,
		});
		const meta: ConversationMetadata = { currentCategory: "moto" };
		await analyzeAndMerge("Trocar de moto gastando R$ 400/mês.", "moto", meta);

		expect(meta.qualifyAnswers?.prazoMeses).toBeUndefined();
	});

	it("'em 2 anos' — menção temporal explícita → prazoMeses PRESERVADO", async () => {
		vi.mocked(analyzeTurn).mockResolvedValue({
			...NEUTRAL,
			creditMax: 70_000,
			prazoMeses: 24,
		});
		const meta: ConversationMetadata = { currentCategory: "auto" };
		await analyzeAndMerge("Quero um carro de 70 mil em 2 anos.", "auto", meta);

		expect(meta.qualifyAnswers?.prazoMeses).toBe(24);
	});

	it("orçamento mensal + menção temporal explícita no MESMO turno → prazoMeses PRESERVADO", async () => {
		vi.mocked(analyzeTurn).mockResolvedValue({
			...NEUTRAL,
			creditMax: 40_000,
			prazoMeses: 36,
		});
		const meta: ConversationMetadata = { currentCategory: "moto" };
		await analyzeAndMerge(
			"Trocar de moto gastando R$ 400/mês, contemplando em 36 meses.",
			"moto",
			meta,
		);

		expect(meta.qualifyAnswers?.prazoMeses).toBe(36);
	});

	// FIX-103 (Kairo, 2026-06-28, já em develop): o gate "timeframe" SAIU da
	// qualificação — "usuário só fala o valor agora, prazo não" (qualify-state.ts,
	// nextGate NUNCA mais o emite). Isso veio DEPOIS da rodada de QA que gerou
	// este card (2026-07-02), então o gate em si não existe mais pra "voltar a
	// disparar". A guarda determinística continua válida por outro motivo: evita
	// persistir um prazoMeses FABRICADO (que poderia vazar pra outros
	// consumidores do campo, ex. relatórios) e garante que o funil segue seu
	// curso normal (não trava) mesmo com o guard rejeitando o dado.
	it("prazo rejeitado pelo guard não trava o funil — nextGate segue o fluxo normal (sem gate de timeframe, FIX-103)", async () => {
		vi.mocked(analyzeTurn).mockResolvedValue({
			...NEUTRAL,
			creditMax: 70_000,
			prazoMeses: 117,
			experiencePrev: "returning",
		});
		const meta: ConversationMetadata = {
			currentCategory: "auto",
			experiencePrev: "returning",
			qualifyConsented: true,
			identityCollected: true,
		};
		await analyzeAndMerge(
			"Quero um carro de uns R$ 70 mil, gastando perto de R$ 900 por mês.",
			"auto",
			meta,
		);

		expect(meta.qualifyAnswers?.prazoMeses).toBeUndefined();
		// nextGate NUNCA emite "timeframe" (FIX-103) — o funil segue pro
		// próximo gate real (lance), sem travar por causa do guard.
		expect(nextGate(meta, { hasContactName: true })).not.toBe("timeframe");
		expect(nextGate(meta, { hasContactName: true })).toBe("lance");
	});
});
