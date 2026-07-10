import { describe, expect, it } from "vitest";
import { prefsFromMeta } from "@/lib/bevi/discovery-session";
import type { ConversationMetadata } from "./personas";
import { decideShowGate, nextGate } from "./qualify-state";

// ============================================================================
// FIX-215 (Refino Ata 2026-07-04, item 1 — P0) — remove a pergunta de lance do
// INÍCIO da jornada; a busca dispara direto após valor+identidade; a conversa
// de lance (recurso próprio + lance embutido) migra pro PÓS-reveal, antes do
// simulator-offer. Reverte a COLOCAÇÃO de FIX-92/118/212, não o conceito.
// Decisão de design (onde exatamente re-entra): docs/decisoes/blocos/
// 2026-07-04-bloco-jornada-conversa.md — automático, logo após o reveal.
//
// Este arquivo prova as 4 regressões exigidas pelo card fix-215:
//   1. Sequência de gates: credit → search (nunca lance*) antes do reveal.
//   2. Busca sem lance: prefsFromMeta funciona sem hasLance/lanceEmbutido.
//   3. Lance pós-reveal: só oferecido após revealCompleted; resolvê-lo
//      re-dispara a sequência (simulator-offer/decision).
//   4. Paridade Web×WhatsApp é coberta pelos testes de route.ts/
//      interactive-handlers.ts (o `nextGate` abaixo é a fonte única dos dois
//      canais — não há lógica de ordem duplicada por canal).
// ============================================================================

const IDENTITY_AND_VALUE_READY: ConversationMetadata = {
	desireAsked: true,
	currentCategory: "auto",
	experiencePrev: "first",
	qualifyConsented: true,
	identityCollected: true,
	qualifyAnswers: { creditMax: 250_000 },
};

/** Mesmo estado, mas já com o prazo (timeframe, FIX-233) respondido — usado
 * pelos testes PÓS-reveal desta suite, que testam SÓ o sub-fluxo de lance. */
const IDENTITY_VALUE_AND_TIMEFRAME_READY: ConversationMetadata = {
	...IDENTITY_AND_VALUE_READY,
	qualifyAnswers: { ...IDENTITY_AND_VALUE_READY.qualifyAnswers, prazoMeses: 0 },
};

describe("FIX-215.1 — sequência de gates: credit → search DIRETO, nunca lance* antes do reveal", () => {
	it("identidade + valor prontos, reveal NÃO ocorreu → search (nunca lance/lance-value/lance-embutido)", () => {
		const gate = nextGate(IDENTITY_AND_VALUE_READY, { hasContactName: true });
		expect(gate).toBe("search");
		expect(gate).not.toBe("lance");
		expect(gate).not.toBe("lance-value");
		expect(gate).not.toBe("lance-embutido");
	});

	it("mesmo com hasLance/lanceEmbutido JÁ respondidos (dado volunteered cedo), sem revealCompleted → search", () => {
		// Cenário adversarial: o usuário mencionou lance espontaneamente ANTES do
		// reveal (analyze.ts persiste hasLance oportunisticamente). O gate de
		// busca não pode ficar refém disso — search ainda dispara direto.
		const meta: ConversationMetadata = {
			...IDENTITY_AND_VALUE_READY,
			qualifyAnswers: {
				...IDENTITY_AND_VALUE_READY.qualifyAnswers,
				hasLance: "yes",
				lanceValue: 40_000,
				lanceEmbutido: true,
			},
		};
		expect(nextGate(meta, { hasContactName: true })).toBe("search");
	});
});

describe("FIX-215.2 — busca funciona SEM os campos de lance (prefsFromMeta)", () => {
	it("prefsFromMeta com qualifyAnswers sem hasLance/lanceEmbutido produz prefs válidas (assume ~30%; adapter varre com/sem — FIX-219)", () => {
		const prefs = prefsFromMeta(IDENTITY_AND_VALUE_READY);
		// FIX-219 (Ata item 4) superou a suposição original deste teste: a 1ª busca
		// NÃO fica "sem embutido" — assume-se o teto histórico (~30%, a Bevi não
		// informa se a cota aceita) e o adapter (offersForValue) varre COM e SEM
		// embutido. O ponto do FIX-215 (a busca não QUEBRA sem os campos de lance,
		// que só chegam pós-reveal) segue válido: prefs continua produzida sem eles.
		expect(prefs.embeddedPercentage).toBe("30");
		expect(prefs.objective).toBeDefined();
	});
});

describe("FIX-215.3 — lance só é oferecido PÓS-reveal; resolvê-lo re-dispara a sequência", () => {
	const postReveal = (over: Partial<ConversationMetadata> = {}): ConversationMetadata => ({
		...IDENTITY_VALUE_AND_TIMEFRAME_READY,
		searchDispatched: true,
		revealCompleted: true,
		...over,
	});

	it("pré-reveal: lance NUNCA é oferecido, mesmo com searchDispatched pendente", () => {
		const meta = postReveal({ searchDispatched: false, revealCompleted: false });
		expect(nextGate(meta, { hasContactName: true })).toBe("search");
	});

	it("pós-reveal, hasLance indefinido → oferece lance", () => {
		expect(nextGate(postReveal(), { hasContactName: true })).toBe("lance");
	});

	it("pós-reveal, resolver hasLance='no' → segue pro lance-embutido (educa todo mundo, FIX-4)", () => {
		const meta = postReveal({
			qualifyAnswers: { ...IDENTITY_VALUE_AND_TIMEFRAME_READY.qualifyAnswers, hasLance: "no" },
		});
		expect(nextGate(meta, { hasContactName: true })).toBe("lance-embutido");
	});

	it("pós-reveal, resolver lance-embutido → RE-DISPARA a sequência (simulator-offer)", () => {
		const meta = postReveal({
			qualifyAnswers: {
				...IDENTITY_VALUE_AND_TIMEFRAME_READY.qualifyAnswers,
				hasLance: "no",
				lanceEmbutido: false,
			},
		});
		expect(nextGate(meta, { hasContactName: true })).toBe("simulator-offer");
	});

	it("simulator-offer resolvido → decision (fim da sequência pós-reveal)", () => {
		const meta = postReveal({
			qualifyAnswers: {
				...IDENTITY_VALUE_AND_TIMEFRAME_READY.qualifyAnswers,
				hasLance: "no",
				lanceEmbutido: false,
			},
			simulatorOfferDispatched: true,
		});
		expect(nextGate(meta, { hasContactName: true })).toBe("decision");
	});
});

describe("FIX-215 — não quebra o guard de neutral do FIX-208 (search herda a tolerância que era de lance)", () => {
	it("logo após credit (sem reveal ainda), intent neutral dispara search mesmo assim", () => {
		expect(
			decideShowGate({
				gate: "search",
				intent: "neutral",
				meta: IDENTITY_AND_VALUE_READY,
				isUserTurn: true,
			}),
		).toBe(true);
	});

	it("depois da 1ª busca (searchDispatched=true), neutral solto NÃO re-dispara search", () => {
		const meta: ConversationMetadata = {
			...IDENTITY_AND_VALUE_READY,
			searchDispatched: true,
			revealCompleted: true,
		};
		expect(
			decideShowGate({ gate: "search", intent: "neutral", meta, isUserTurn: true }),
		).toBe(false);
	});
});
