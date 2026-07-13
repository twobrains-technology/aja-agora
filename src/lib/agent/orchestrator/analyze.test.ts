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
	desiredItem: null,
	motivation: null,
	monthlySavings: null,
	fgtsValue: null,
	userIntent: "neutral",
};

// FIX-218 (Ata de alinhamento com o cliente, 2026-07-04): o guardrail FIX-33/
// FIX-54 abaixo foi REVOGADO — "não há integração com grupos nesse ponto,
// então qualquer valor é válido" (a busca, FIX-219, traz a ordem de grandeza
// mais próxima em vez do valor exato). `clampCreditToCategory` deixa de forçar
// o valor pra dentro de CREDIT_BOUNDS; os testes abaixo confirmam o passthrough.
describe("FIX-33/FIX-218 — clampCreditToCategory (função pura, clamp revogado)", () => {
	it("acima do teto NÃO clampa mais (auto: 500k é só a faixa do slider)", () => {
		const r = clampCreditToCategory(5_000_000, "auto");
		expect(r.value).toBe(5_000_000);
		expect(r.clamped).toBe(false);
		expect(r.max).toBe(500_000);
		expect(r.min).toBe(20_000);
	});

	it("abaixo do piso NÃO clampa mais (auto: 20k é só a faixa do slider)", () => {
		const r = clampCreditToCategory(500, "auto");
		expect(r.value).toBe(500);
		expect(r.clamped).toBe(false);
		expect(r.min).toBe(20_000);
	});

	it("dentro da faixa passa intacto (clamped=false)", () => {
		const r = clampCreditToCategory(150_000, "auto");
		expect(r.value).toBe(150_000);
		expect(r.clamped).toBe(false);
	});

	it.each<[Category, number]>([
		["imovel", 5_000_000],
		["imovel", 50_000],
		["auto", 5_000_000],
		["auto", 500],
		["moto", 200_000],
		["moto", 1_000],
		["servicos", 9_000_000],
		["servicos", 100],
	])("matriz %s: %d sobrevive intacto (sem clamp)", (cat, input) => {
		expect(clampCreditToCategory(input, cat).value).toBe(input);
	});
});

describe("FIX-33/FIX-218 — analyzeAndMerge NÃO capa mais o valor na faixa da categoria", () => {
	beforeEach(() => {
		vi.mocked(analyzeTurn).mockReset();
	});

	// FIX-279: os 4 testes abaixo exercitam o merge de creditMax, então a meta
	// precisa refletir o gate `credit` REALMENTE ativo (desireAsked +
	// identityCollected) — senão o guard novo rejeita a captura antes mesmo de
	// o clamp entrar em jogo. O comportamento de clamp em si é o que estes
	// testes verificam, não o timing do gate (isso é o FIX-279 dedicado).

	it("carta de 5 milhões de auto → creditMax preservado (Ata 2026-07-04), sem creditClampedFrom", async () => {
		vi.mocked(analyzeTurn).mockResolvedValue({ ...NEUTRAL, creditMax: 5_000_000 });
		const meta: ConversationMetadata = {
			desireAsked: true,
			identityCollected: true,
			currentCategory: "auto",
		};
		await analyzeAndMerge("quero uma carta de 5 milhoes de auto", "auto", meta);

		expect(meta.qualifyAnswers?.creditMax).toBe(5_000_000);
		expect(meta.qualifyAnswers?.creditClampedFrom).toBeUndefined();
		expect(meta.qualifyAnswers?.creditMin ?? 0).toBeGreaterThan(0);
	});

	it("valor dentro da faixa NÃO marca clamp", async () => {
		vi.mocked(analyzeTurn).mockResolvedValue({ ...NEUTRAL, creditMax: 150_000 });
		const meta: ConversationMetadata = {
			desireAsked: true,
			identityCollected: true,
			currentCategory: "auto",
		};
		await analyzeAndMerge("uns 150 mil", "auto", meta);

		expect(meta.qualifyAnswers?.creditMax).toBe(150_000);
		expect(meta.qualifyAnswers?.creditClampedFrom).toBeUndefined();
	});

	it("creditMin extraído acima do teto sobrevive intacto (não é mais forçado pro teto)", async () => {
		vi.mocked(analyzeTurn).mockResolvedValue({
			...NEUTRAL,
			creditMax: 5_000_000,
			creditMin: 4_000_000,
		});
		const meta: ConversationMetadata = {
			desireAsked: true,
			identityCollected: true,
			currentCategory: "auto",
		};
		await analyzeAndMerge("entre 4 e 5 milhoes", "auto", meta);

		expect(meta.qualifyAnswers?.creditMax).toBe(5_000_000);
		expect(meta.qualifyAnswers?.creditMin).toBe(4_000_000);
	});

	it("sem categoria definida NÃO clampa (defensivo — sem faixa de referência)", async () => {
		vi.mocked(analyzeTurn).mockResolvedValue({ ...NEUTRAL, creditMax: 5_000_000 });
		const meta: ConversationMetadata = { desireAsked: true, identityCollected: true };
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

	it("valor sem sinal de experiência NÃO crava experiencePrev='returning' nem consent", async () => {
		// Espelha o cenário real do browser: "carro de 80 mil, 850/mês" — o
		// analyzer extrai o valor mas NÃO detecta experiência (experiencePrev=null).
		vi.mocked(analyzeTurn).mockResolvedValue({ ...NEUTRAL, creditMax: 80_000 });
		const meta: ConversationMetadata = { currentCategory: "auto" };
		await analyzeAndMerge("quero um carro de uns 80 mil, gastando perto de 850 por mes", "auto", meta);

		// FIX-279: este é exatamente o cenário do bug (bem+valor no turno de
		// `desire`, antes de `credit` ficar ativo) — o guard novo REJEITA a
		// captura aqui; o valor será coletado depois, pela agulha do gate
		// `credit` (ver describe "FIX-279" abaixo). O ponto original deste
		// teste (experiência/consent não são inventados) continua valendo.
		expect(meta.qualifyAnswers?.creditMax).toBeUndefined();
		expect(meta.experiencePrev).toBeUndefined();
		expect(meta.qualifyConsented).toBeFalsy();
	});

	it("meta resultante → nextGate dispara 'desire' (próximo passo legítimo), não 'identify'", async () => {
		// FIX-233 (handoff agente-vendas-consorcio, 2026-07-09): `experience`
		// desceu pra pós-reveal — o próximo passo legítimo logo após o nome
		// agora é `desire` (não bloqueante). O ponto do teste (o funil NÃO pula
		// direto pra `identify` só porque um valor veio em texto livre) continua
		// valendo: `desire`/`consent` seguem obrigatórios no caminho.
		vi.mocked(analyzeTurn).mockResolvedValue({ ...NEUTRAL, creditMax: 80_000 });
		const meta: ConversationMetadata = { currentCategory: "auto" };
		await analyzeAndMerge("um carro de 80 mil", "auto", meta);

		expect(nextGate(meta, { hasContactName: true })).toBe("desire");
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
		desireAsked: true,
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
		// Depois do merge: o funil AVANÇA (passa do `credit` pro `search`, FIX-215
		// tirou o lance do meio), não trava.
		expect(nextGate(meta, { hasContactName: true })).toBe("search");
	});

	it("'50k' e '50 mil' (analyzer mudo) também avançam o funil", async () => {
		for (const text of ["50k", "uns 50 mil então"]) {
			vi.mocked(analyzeTurn).mockResolvedValue({ ...NEUTRAL, creditMax: null });
			const meta = atValueStep();
			await analyzeAndMerge(text, "auto", meta);
			expect(meta.qualifyAnswers?.creditMax, `texto="${text}"`).toBe(50_000);
			expect(nextGate(meta, { hasContactName: true }), `texto="${text}"`).toBe("search");
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
		// FIX-279: meta no gate `credit` ativo (desireAsked+identityCollected) —
		// senão o guard novo rejeitaria a captura de creditMax também, o que
		// isolaria mal o que este teste verifica (o guard de prazoMeses).
		vi.mocked(analyzeTurn).mockResolvedValue({
			...NEUTRAL,
			creditMax: 70_000,
			prazoMeses: 117,
		});
		const meta: ConversationMetadata = {
			desireAsked: true,
			identityCollected: true,
			currentCategory: "auto",
		};
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
			desireAsked: true,
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
		// próximo gate real (search — FIX-215 tirou o lance do meio também),
		// sem travar por causa do guard.
		expect(nextGate(meta, { hasContactName: true })).not.toBe("timeframe");
		expect(nextGate(meta, { hasContactName: true })).toBe("search");
	});
});

// FIX-233 (handoff agente-vendas-consorcio, 2026-07-09) — gate `desire` (não
// bloqueante): captura oportunista de desiredItem/motivation por texto livre.
// O gate não trava se eles nunca vierem, mas quando o usuário os menciona
// (neste turno ou em qualquer turno posterior), analyzeAndMerge persiste a
// PRIMEIRA ocorrência sem sobrescrever depois.
describe("FIX-233 — captura oportunista de desiredItem/motivation (gate desire)", () => {
	beforeEach(() => {
		vi.mocked(analyzeTurn).mockReset();
	});

	it("analyzer extrai desiredItem + motivation → salvos em qualifyAnswers", async () => {
		vi.mocked(analyzeTurn).mockResolvedValue({
			...NEUTRAL,
			detectedCategory: "auto",
			desiredItem: "um Corolla",
			motivation: "carro vive na oficina",
		});
		const meta: ConversationMetadata = { currentCategory: "auto" };
		await analyzeAndMerge("quero um Corolla, meu carro vive na oficina", "auto", meta);

		expect(meta.qualifyAnswers?.desiredItem).toBe("um Corolla");
		expect(meta.qualifyAnswers?.motivation).toBe("carro vive na oficina");
	});

	it("sem sinal (null) → slots ficam undefined, funil não trava", async () => {
		vi.mocked(analyzeTurn).mockResolvedValue({ ...NEUTRAL, detectedCategory: "auto" });
		const meta: ConversationMetadata = { currentCategory: "auto" };
		await analyzeAndMerge("oi", "auto", meta);

		expect(meta.qualifyAnswers?.desiredItem).toBeUndefined();
		expect(meta.qualifyAnswers?.motivation).toBeUndefined();
	});

	it("primeira ocorrência NÃO é sobrescrita por um turno posterior", async () => {
		vi.mocked(analyzeTurn).mockResolvedValue({
			...NEUTRAL,
			detectedCategory: "auto",
			desiredItem: "um Corolla",
		});
		const meta: ConversationMetadata = { currentCategory: "auto" };
		await analyzeAndMerge("quero um Corolla", "auto", meta);
		expect(meta.qualifyAnswers?.desiredItem).toBe("um Corolla");

		vi.mocked(analyzeTurn).mockResolvedValue({
			...NEUTRAL,
			detectedCategory: "auto",
			desiredItem: "um HB20",
		});
		await analyzeAndMerge("na verdade quero um HB20", "auto", meta);
		expect(meta.qualifyAnswers?.desiredItem).toBe("um Corolla");
	});
});

// FIX-285 (r9 onda 2, G-C): `desireAnswered` marca o primeiro turno de
// usuário após `desireAsked`, independente do que o analyzer extraiu como
// `desiredItem` — substitui esse campo como proxy de "o gate desire foi
// respondido" (o proxy antigo falhava na categoria genérica, "um carro").
describe("FIX-285 — desireAnswered marcado no 1º turno de usuário após o gate desire", () => {
	beforeEach(() => {
		vi.mocked(analyzeTurn).mockReset();
	});

	it("'Um carro, uns 80 mil' (categoria genérica) → desireAnswered=true mesmo com desiredItem null", async () => {
		vi.mocked(analyzeTurn).mockResolvedValue({ ...NEUTRAL, detectedCategory: "auto", desiredItem: null });
		const meta: ConversationMetadata = {
			desireAsked: true,
			identityCollected: false,
			currentCategory: "auto",
		};
		await analyzeAndMerge("Um carro, uns 80 mil", "rafael-auto", meta);

		expect(meta.desireAnswered).toBe(true);
		expect(meta.qualifyAnswers?.desiredItem).toBeUndefined();
	});

	it("antes de desireAsked, NÃO marca desireAnswered", async () => {
		vi.mocked(analyzeTurn).mockResolvedValue({ ...NEUTRAL });
		const meta: ConversationMetadata = { desireAsked: false };
		await analyzeAndMerge("oi", "concierge", meta);

		expect(meta.desireAnswered).toBeUndefined();
	});

	it("já marcado → não regride (idempotente, não gera metaChanged de novo)", async () => {
		vi.mocked(analyzeTurn).mockResolvedValue({ ...NEUTRAL, detectedCategory: "auto" });
		const meta: ConversationMetadata = { desireAsked: true, desireAnswered: true, currentCategory: "auto" };
		const { metaChanged } = await analyzeAndMerge("beleza", "rafael-auto", meta);

		expect(meta.desireAnswered).toBe(true);
		expect(metaChanged).toBe(false);
	});
});

// FIX-284 (r9 onda 2, veredito Sonnet 5 pós-onda-1, G-F): o valor mencionado
// informalmente no turno do `desire` ("Um carro, uns 70 mil") nunca ficava
// salvo em NENHUM campo — nem em `q.creditMax` (correto, por design: guard
// `activeGateAtTurnStart` do FIX-279) nem em qualquer outro lugar — então
// quando o `gate:credit` ligava, 2 turnos depois, não havia nada pra
// confirmar. `creditMentionedAtDesire` captura esse valor SEM gating por
// `activeGateAtTurnStart` (nunca substitui a agulha formal do `creditMax`).
describe("FIX-284 — captura oportunista do valor mencionado no desire (creditMentionedAtDesire)", () => {
	beforeEach(() => {
		vi.mocked(analyzeTurn).mockReset();
	});

	it("'Um carro, uns 70 mil' no turno do desire → creditMentionedAtDesire=70000 SEM popular creditMax (não regride FIX-279/G3)", async () => {
		vi.mocked(analyzeTurn).mockResolvedValue({ ...NEUTRAL, detectedCategory: "auto", creditMax: 70_000 });
		const meta: ConversationMetadata = {
			desireAsked: true,
			identityCollected: false,
			currentCategory: "auto",
		};
		await analyzeAndMerge("Um carro, uns 70 mil", "rafael-auto", meta);

		expect(meta.qualifyAnswers?.creditMentionedAtDesire).toBe(70_000);
		expect(meta.qualifyAnswers?.creditMax).toBeUndefined();
	});

	it("quando o gate credit está REALMENTE ativo, popula creditMax E creditMentionedAtDesire", async () => {
		vi.mocked(analyzeTurn).mockResolvedValue({ ...NEUTRAL, detectedCategory: "auto", creditMax: 70_000 });
		const meta: ConversationMetadata = {
			desireAsked: true,
			identityCollected: true,
			currentCategory: "auto",
		};
		await analyzeAndMerge("uns 70 mil", "rafael-auto", meta);

		expect(meta.qualifyAnswers?.creditMax).toBe(70_000);
		expect(meta.qualifyAnswers?.creditMentionedAtDesire).toBe(70_000);
	});

	it("não sobrescreve creditMentionedAtDesire já capturado (primeira ocorrência apenas)", async () => {
		vi.mocked(analyzeTurn).mockResolvedValue({ ...NEUTRAL, detectedCategory: "auto", creditMax: 90_000 });
		const meta: ConversationMetadata = {
			desireAsked: true,
			identityCollected: false,
			currentCategory: "auto",
			qualifyAnswers: { creditMentionedAtDesire: 70_000 },
		};
		await analyzeAndMerge("na verdade uns 90 mil", "rafael-auto", meta);

		expect(meta.qualifyAnswers?.creditMentionedAtDesire).toBe(70_000);
	});

	it("sem nenhum valor mencionado, não popula o campo", async () => {
		vi.mocked(analyzeTurn).mockResolvedValue({ ...NEUTRAL, detectedCategory: "auto" });
		const meta: ConversationMetadata = {
			desireAsked: true,
			identityCollected: false,
			currentCategory: "auto",
		};
		await analyzeAndMerge("um carro", "rafael-auto", meta);

		expect(meta.qualifyAnswers?.creditMentionedAtDesire).toBeUndefined();
	});
});

// FIX-236 (Fable r1, D3.1, gap P0 #1): o gate `lance` estava sendo PULADO no
// funil real — trace mostrava experience→timeframe→lance-embutido, sem nunca
// passar por `lance`. Causa raiz: `hasLance` era capturado de QUALQUER turno
// de texto livre (sem checar se o gate `lance` estava de fato ativo) — uma
// frase respondendo `timeframe` ("Queria rápido, mas não tenho grana agora")
// contém sinal lexical de lance ("não tenho") e o analyzer vazava
// hasLance="no" cedo demais. Duplo efeito: (1) nextGate pulava o gate `lance`
// direto pra lance-embutido; (2) quando o usuário DEPOIS dizia a recusa
// explícita ("não quero comprometer nada além da parcela", so_parcela), o
// guard `!q.hasLance` já estava satisfeito por um "no" falso e a recusa real
// nunca sobrescrevia — a MESMA bolha de educação de embutido repetia (Fable
// viu 3× seguidas). Fix: só aceitar hasLance quando o gate `lance` (calculado
// ANTES do merge, com o estado desta rodada) é o gate REALMENTE ativo.
describe("FIX-236 — hasLance só captura quando o gate `lance` está ativo", () => {
	beforeEach(() => {
		vi.mocked(analyzeTurn).mockReset();
	});

	function postRevealAwaitingTimeframe(): ConversationMetadata {
		return {
			desireAsked: true,
			currentCategory: "auto",
			qualifyConsented: true,
			identityCollected: true,
			experiencePrev: "first",
			searchDispatched: true,
			revealCompleted: true,
			qualifyAnswers: { creditMax: 120_000 },
		};
	}

	it("resposta ao gate timeframe com sinal falso de lance NÃO captura hasLance — gate `lance` continua aparecendo", async () => {
		const meta = postRevealAwaitingTimeframe();
		// Confirma o estado de partida: o gate ativo AGORA é timeframe.
		expect(nextGate(meta, { hasContactName: true })).toBe("timeframe");

		vi.mocked(analyzeTurn).mockResolvedValue({
			...NEUTRAL,
			prazoMeses: 0,
			hasLance: "no", // falso-positivo do analyzer sobre "não tenho grana agora"
		});
		await analyzeAndMerge("Queria rápido, mas não tenho grana agora", "auto", meta);

		expect(meta.qualifyAnswers?.prazoMeses).toBe(0);
		expect(meta.qualifyAnswers?.hasLance).toBeUndefined();
		expect(nextGate(meta, { hasContactName: true })).toBe("lance");
		expect(nextGate(meta, { hasContactName: true })).not.toBe("lance-embutido");
	});

	it("resposta ao gate lance (texto livre, so_parcela) captura normalmente e roteia pra decision/two_paths", async () => {
		const meta = postRevealAwaitingTimeframe();
		meta.qualifyAnswers!.prazoMeses = 6;
		expect(nextGate(meta, { hasContactName: true })).toBe("lance");

		vi.mocked(analyzeTurn).mockResolvedValue({
			...NEUTRAL,
			hasLance: "so_parcela",
		});
		await analyzeAndMerge("não quero comprometer nada além da parcela", "auto", meta);

		expect(meta.qualifyAnswers?.hasLance).toBe("so_parcela");
		expect(nextGate(meta, { hasContactName: true })).toBe("decision");
	});

	it("resposta ao gate lance com 'yes' captura normalmente (caminho feliz preservado)", async () => {
		const meta = postRevealAwaitingTimeframe();
		meta.qualifyAnswers!.prazoMeses = 6;
		expect(nextGate(meta, { hasContactName: true })).toBe("lance");

		vi.mocked(analyzeTurn).mockResolvedValue({ ...NEUTRAL, hasLance: "yes" });
		await analyzeAndMerge("tenho uma reserva pra dar de lance", "auto", meta);
		expect(meta.qualifyAnswers?.hasLance).toBe("yes");
	});
});

// FIX-279 (loop r9, baseline Sonnet 3/10, G3 — Funcional 5/10): o gate `credit`
// (agulha do valor do bem, P4 do canônico, marcado ✅ resolvido pelo FIX-115)
// nunca aparecia em produção — o analyzer capturava creditMax de QUALQUER
// turno de texto livre, inclusive o turno de `desire` (bem + valor juntos, ex.:
// "Um apartamento de uns 250 mil"), preenchendo q.creditMax ANTES de o gate
// `credit` ficar ativo. Quando nextGate() chegava em qualify-state.ts:88, a
// condição `q.creditMax === undefined` já era falsa e o gate nunca disparava.
// Mesma classe de bug do FIX-236 (hasLance) — a correção replica o guard
// `activeGateAtTurnStart`.
describe("FIX-279 — creditMax só captura quando o gate `credit` está ativo", () => {
	beforeEach(() => {
		vi.mocked(analyzeTurn).mockReset();
	});

	it("bem + valor no MESMO turno do desire (antes de identify) → creditMax REJEITADO, gate `credit` continua ativo", async () => {
		// meta reproduz o ponto do funil logo após o nome: desire ainda não foi
		// respondido (desireAsked marcado só na emissão) e identify não rodou.
		const meta: ConversationMetadata = { desireAsked: false };
		// Confirma o estado de partida: gate ativo é `desire` (não `credit`).
		expect(nextGate(meta, { hasContactName: true })).toBe("desire");

		vi.mocked(analyzeTurn).mockResolvedValue({
			...NEUTRAL,
			detectedCategory: "imovel",
			creditMax: 250_000,
			desiredItem: "um apartamento",
		});
		await analyzeAndMerge("Um apartamento de uns 250 mil", "imovel", meta);

		expect(meta.qualifyAnswers?.creditMax).toBeUndefined();
		// captura oportunista de desiredItem (FIX-233) continua intocada — só
		// creditMax precisa do guard novo.
		expect(meta.qualifyAnswers?.desiredItem).toBe("um apartamento");
	});

	it("no turno seguinte, com desire respondido e identify concluído, o gate `credit` aparece", () => {
		const meta: ConversationMetadata = {
			desireAsked: true,
			currentCategory: "imovel",
			identityCollected: true,
		};
		expect(nextGate(meta, { hasContactName: true })).toBe("credit");
	});

	it("resposta DIRETA ao gate `credit` já ativo → creditMax é setado normalmente (caminho legítimo preservado)", async () => {
		const meta: ConversationMetadata = {
			desireAsked: true,
			currentCategory: "imovel",
			identityCollected: true,
		};
		expect(nextGate(meta, { hasContactName: true })).toBe("credit");

		vi.mocked(analyzeTurn).mockResolvedValue({ ...NEUTRAL, creditMax: 250_000 });
		await analyzeAndMerge("200 mil", "imovel", meta);

		expect(meta.qualifyAnswers?.creditMax).toBe(250_000);
		expect(nextGate(meta, { hasContactName: true })).toBe("search");
	});

	it("isRevealRefit pós-reveal continua funcionando (exceção legítima, independe do gate ativo no momento)", async () => {
		const meta: ConversationMetadata = {
			desireAsked: true,
			currentCategory: "auto",
			identityCollected: true,
			revealCompleted: true,
			experiencePrev: "returning",
			searchDispatched: true,
			qualifyAnswers: { creditMax: 80_000 },
		};
		// gate ativo agora é `timeframe`, não `credit` — mesmo assim o refit
		// pós-reveal (isRevealRefit) precisa continuar funcionando.
		expect(nextGate(meta, { hasContactName: true })).toBe("timeframe");

		vi.mocked(analyzeTurn).mockResolvedValue({
			...NEUTRAL,
			userIntent: "providing_info",
			creditMax: 130_000,
		});
		await analyzeAndMerge("na verdade agora quero um de 130 mil", "auto", meta);

		expect(meta.qualifyAnswers?.creditMax).toBe(130_000);
	});
});

// FIX-241 (rodada 2, Fable r1, D1 do veredito) — âncora de dinheiro: captura
// oportunista de monthlySavings/fgtsValue por texto livre, mesmo padrão de
// "primeira ocorrência" do FIX-233 (desiredItem/motivation).
describe("FIX-241 — captura oportunista de monthlySavings/fgtsValue (âncora de dinheiro)", () => {
	beforeEach(() => {
		vi.mocked(analyzeTurn).mockReset();
	});

	it("analyzer extrai monthlySavings → salvo em qualifyAnswers", async () => {
		vi.mocked(analyzeTurn).mockResolvedValue({
			...NEUTRAL,
			detectedCategory: "auto",
			monthlySavings: 4000,
		});
		const meta: ConversationMetadata = { currentCategory: "auto" };
		await analyzeAndMerge("não tenho reserva, mas junto uns 4 mil por mês", "auto", meta);

		expect(meta.qualifyAnswers?.monthlySavings).toBe(4000);
	});

	it("analyzer extrai fgtsValue → salvo em qualifyAnswers", async () => {
		vi.mocked(analyzeTurn).mockResolvedValue({
			...NEUTRAL,
			detectedCategory: "imovel",
			fgtsValue: 15_000,
		});
		const meta: ConversationMetadata = { currentCategory: "imovel" };
		await analyzeAndMerge("tenho uns 15 mil de FGTS", "imovel", meta);

		expect(meta.qualifyAnswers?.fgtsValue).toBe(15_000);
	});

	it("sem sinal (null) → slots ficam undefined, funil não trava", async () => {
		vi.mocked(analyzeTurn).mockResolvedValue({ ...NEUTRAL, detectedCategory: "auto" });
		const meta: ConversationMetadata = { currentCategory: "auto" };
		await analyzeAndMerge("oi", "auto", meta);

		expect(meta.qualifyAnswers?.monthlySavings).toBeUndefined();
		expect(meta.qualifyAnswers?.fgtsValue).toBeUndefined();
	});

	it("primeira ocorrência de monthlySavings NÃO é sobrescrita por um turno posterior", async () => {
		vi.mocked(analyzeTurn).mockResolvedValue({
			...NEUTRAL,
			detectedCategory: "auto",
			monthlySavings: 4000,
		});
		const meta: ConversationMetadata = { currentCategory: "auto" };
		await analyzeAndMerge("junto uns 4 mil por mês", "auto", meta);
		expect(meta.qualifyAnswers?.monthlySavings).toBe(4000);

		vi.mocked(analyzeTurn).mockResolvedValue({
			...NEUTRAL,
			detectedCategory: "auto",
			monthlySavings: 1000,
		});
		await analyzeAndMerge("na verdade só consigo juntar uns 1000", "auto", meta);
		expect(meta.qualifyAnswers?.monthlySavings).toBe(4000);
	});
});
