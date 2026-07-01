// FIX-110 — guard de turno vazio (server).
// Root cause REAL do "agente mudo" (uso manual Kairo, 2026-06-30): um turno de
// texto-livre fechava com sucesso SEM emitir nenhuma part visível (sem texto,
// tool, artifact, gate, transição ou handoff). O stream fecha "ok", o status do
// client volta a "ready" (input libera) mas NENHUMA resposta aparece — o usuário
// espera e nada; só "destrava" no input seguinte. `isTurnEmpty` detecta isso a
// partir do registro do TurnTrace pra o route emitir um fallback honesto.
import { describe, expect, it } from "vitest";
import { EMPTY_TURN_FALLBACK, isTurnEmpty } from "./empty-turn-guard";

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

	it("tool ACIONÁVEL (search_groups) => NÃO vazio (o resultado vira artifact/texto)", () => {
		expect(isTurnEmpty({ ...base, toolCount: 1, toolsCalled: ["search_groups"] })).toBe(false);
	});

	it("mix silenciosa + acionável => NÃO vazio (a acionável emite)", () => {
		expect(
			isTurnEmpty({ ...base, toolCount: 2, toolsCalled: ["save_contact_name", "search_groups"] }),
		).toBe(false);
	});

	it("retrocompat: sem toolsCalled, toolCount>0 segue não-vazio (FIX-110 preservado)", () => {
		expect(isTurnEmpty({ ...base, toolCount: 1 })).toBe(false);
	});
});
