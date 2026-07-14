// FIX-110 — guard de turno vazio (server).
// Root cause REAL do "agente mudo" (uso manual Kairo, 2026-06-30): um turno de
// texto-livre fechava com sucesso SEM emitir nenhuma part visível (sem texto,
// tool, artifact, gate, transição ou handoff). O stream fecha "ok", o status do
// client volta a "ready" (input libera) mas NENHUMA resposta aparece — o usuário
// espera e nada; só "destrava" no input seguinte. `isTurnEmpty` detecta isso a
// partir do registro do TurnTrace pra o route emitir um fallback honesto.
import { describe, expect, it } from "vitest";
import {
	EMPTY_TURN_FALLBACK,
	EMPTY_TURN_FALLBACK_REPEAT,
	isTurnEmpty,
	pickEmptyTurnFallback,
} from "./empty-turn-guard";

const base = {
	textChars: 0,
	toolCount: 0,
	artifactCount: 0,
	gate: null as string | null,
	handoff: false,
	transitionedTo: null as string | null,
};

describe("FIX-110 — isTurnEmpty (detector de turno mudo)", () => {
	it("turno sem NENHUMA part visível é vazio", () => {
		expect(isTurnEmpty(base)).toBe(true);
	});

	it("qualquer texto emitido => NÃO é vazio", () => {
		expect(isTurnEmpty({ ...base, textChars: 12 })).toBe(false);
	});

	it("uma tool chamada => NÃO é vazio (a tool já é resposta acionável)", () => {
		expect(isTurnEmpty({ ...base, toolCount: 1 })).toBe(false);
	});

	it("um artifact emitido => NÃO é vazio", () => {
		expect(isTurnEmpty({ ...base, artifactCount: 1 })).toBe(false);
	});

	// FIX-113: handoff é o ÚNICO sinal-de-card que continua contando como visível.
	// O card de handoff (data-handoff) renderiza SOZINHO — o system-prompt PROÍBE o
	// agente de escrever texto no handoff (suggest_handoff → "não escreva NENHUM
	// texto"). Logo textChars=0 é o normal do handoff; sem esta exceção o fallback
	// atropelaria o card "Vou te conectar com um consultor".
	it("um handoff (card silencioso por design) => NÃO é vazio", () => {
		expect(isTurnEmpty({ ...base, handoff: true })).toBe(false);
	});

	// FIX-113 (trava em afirmação de continuidade, PROD 2026-06-30): gate e
	// transitionedTo são ESTADO INTERNO do funil — não são, por si só, resposta
	// VISÍVEL ao usuário. Numa afirmação curta ("blz"/"ta bom") o funil podia setar
	// gate/transição sem emitir texto/tool/artifact; o guard antigo lia esse estado
	// interno e retornava false → fallback NÃO disparava → tela congelava. Agora o
	// guard só olha emissão visível (texto/tool/artifact), IGNORANDO gate/transição.
	it("FIX-113: gate setado SEM emissão visível é vazio (estado interno não conta)", () => {
		expect(isTurnEmpty({ ...base, gate: "value" })).toBe(true);
		expect(isTurnEmpty({ ...base, gate: "experience" })).toBe(true);
	});

	it("FIX-113: transição setada SEM emissão visível é vazia (estado interno não conta)", () => {
		expect(isTurnEmpty({ ...base, transitionedTo: "auto" })).toBe(true);
	});

	it("FIX-113: assinatura exata do card — gate=value sem nada visível => vazio (true)", () => {
		expect(
			isTurnEmpty({
				textChars: 0,
				toolCount: 0,
				artifactCount: 0,
				gate: "value",
				transitionedTo: null,
			}),
		).toBe(true);
	});

	// Contraprova: emissão visível legítima NUNCA vira vazio, mesmo com gate setado
	// (o gate real vem SEMPRE acompanhado da pergunta do gate ou do texto do agente).
	it("FIX-113: gate COM pergunta/texto visível NÃO é vazio (sem falso fallback)", () => {
		expect(isTurnEmpty({ ...base, gate: "experience", textChars: 30 })).toBe(false);
		expect(isTurnEmpty({ ...base, gate: "simulator-offer", artifactCount: 1 })).toBe(false);
	});

	it("o fallback é uma frase PT-BR honesta, não-vazia e sem cara de IA (sem travessão)", () => {
		expect(EMPTY_TURN_FALLBACK.length).toBeGreaterThan(0);
		expect(EMPTY_TURN_FALLBACK).not.toMatch(/[—–]/);
	});
});

describe("FIX-172 — loop de tools SILENCIOSAS deixa o turno mudo (agente mudo ao receber o nome)", () => {
	// Bug REAL (WhatsApp, QA autônomo 2026-07-01): usuário responde "Kairo" → o
	// modelo entra em loop de save_contact_name (10x, até bater stepCountIs) SEM
	// gerar texto → o turno fecha com textChars=0. save_contact_name só GRAVA no DB
	// (tool SILENCIOSA): o usuário não vê NADA. O guard antigo lia toolCount>0 e
	// achava "não vazio" → nenhum fallback → 27s de silêncio. Agora distingue tool
	// ACIONÁVEL (search_groups: produz artifact/texto) de SILENCIOSA (save_*).
	it("save_contact_name em loop (10x) sem texto/artifact => MUDO", () => {
		expect(
			isTurnEmpty({ ...base, toolCount: 10, toolsCalled: Array(10).fill("save_contact_name") }),
		).toBe(true);
	});

	it("save_contact_whatsapp silenciosa sozinha sem emissão => MUDO", () => {
		expect(isTurnEmpty({ ...base, toolCount: 1, toolsCalled: ["save_contact_whatsapp"] })).toBe(
			true,
		);
	});

	it("retrocompat: sem toolsCalled, toolCount>0 segue não-vazio (FIX-110 preservado)", () => {
		expect(isTurnEmpty({ ...base, toolCount: 1 })).toBe(false);
	});
});

describe("FIX-189 — descoberta NÃO é emissão visível por si (a pendura 'Buscando grupos')", () => {
	// Root cause da pendura (print agente-nao-responde-ate-novo-input): a descoberta
	// (search_groups/recommend_groups/get_rates/get_group_details/simulate_quota)
	// NÃO produz artifact por si só — só o chip transitório "Buscando grupos". O
	// VISÍVEL é o artifact/texto que ela LEVA a produzir (já contado em
	// artifactCount/textChars). O FIX-172 tratava search_groups como "acionável =
	// visível" — falso-negativo: um turno que só buscou (sem present_*, sem texto)
	// fechava NÃO-vazio → nenhum fallback → o reveal nunca chegava e o usuário
	// tinha de cutucar ("travou?"). Corrigido: descoberta sozinha = MUDO.

	it("só descoberta (search_groups) sem artifact/texto => MUDO", () => {
		expect(isTurnEmpty({ ...base, toolCount: 1, toolsCalled: ["search_groups"] })).toBe(true);
	});

	it("outras tools de descoberta sozinhas também => MUDO", () => {
		for (const t of ["recommend_groups", "get_rates", "get_group_details", "simulate_quota"]) {
			expect(isTurnEmpty({ ...base, toolCount: 1, toolsCalled: [t] }), t).toBe(true);
		}
	});

	it("descoberta que PRODUZIU artifact (present_*) => NÃO vazio", () => {
		expect(
			isTurnEmpty({
				...base,
				toolCount: 2,
				artifactCount: 1,
				toolsCalled: ["search_groups", "present_comparison_table"],
			}),
		).toBe(false);
	});

	it("descoberta com texto de resultado => NÃO vazio", () => {
		expect(
			isTurnEmpty({ ...base, toolCount: 1, textChars: 40, toolsCalled: ["recommend_groups"] }),
		).toBe(false);
	});

	it("mix silenciosa + descoberta, sem present/texto => MUDO", () => {
		expect(
			isTurnEmpty({ ...base, toolCount: 2, toolsCalled: ["save_contact_name", "search_groups"] }),
		).toBe(true);
	});
});

// FIX-347 (loop-de-goal desamarra, rodada 4, P1.1) — "Regressão exigida": o
// fallback de turno-vazio nunca pode aparecer 2× na mesma conversa (mesma
// classe do FIX-266/332, que já resolveu isso pro fallback de tool-error).
// `pickEmptyTurnFallback` é a função PURA que decide entre a frase original
// e a variante — o route.ts só precisa saber SE `EMPTY_TURN_FALLBACK` já
// apareceu no histórico do assistant desta conversa.
describe("FIX-347 — pickEmptyTurnFallback nunca repete a MESMA frase 2x", () => {
	it("primeira vez (nunca usado antes) => frase original", () => {
		expect(pickEmptyTurnFallback(false)).toBe(EMPTY_TURN_FALLBACK);
	});

	it("já usado antes nesta conversa => variante, NUNCA a frase original", () => {
		expect(pickEmptyTurnFallback(true)).toBe(EMPTY_TURN_FALLBACK_REPEAT);
	});

	it("a variante é uma frase PT-BR honesta, diferente da original, sem cara de IA", () => {
		expect(EMPTY_TURN_FALLBACK_REPEAT.length).toBeGreaterThan(0);
		expect(EMPTY_TURN_FALLBACK_REPEAT).not.toBe(EMPTY_TURN_FALLBACK);
		expect(EMPTY_TURN_FALLBACK_REPEAT).not.toMatch(/[—–]/);
	});
});
