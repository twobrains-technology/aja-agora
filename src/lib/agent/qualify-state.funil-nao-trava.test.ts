import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "./personas";
import { decideShowGate, nextGate, shouldMarkDoubtsAddressed } from "./qualify-state";

// ============================================================================
// FIX-206 — Camada 1 (estrutural, funil determinístico)
// ----------------------------------------------------------------------------
// Bug (Kairo, WhatsApp 2026-07-02): o usuário clica "🤔 Tenho dúvidas", o agente
// explica consórcio e o funil TRAVA em silêncio (~5min) — só destrava com
// "continua/vai". Root cause: o clique dispara buildExperienceDoubtsDirective
// como turno de SERVIDOR (isUserTurn=false), e `doubtsAddressed` (o flag que
// LIBERA o próximo gate) só era marcado em `if (isUserTurn && ...)` no runner —
// nunca em turno de servidor. Então nextGate ficava preso em "doubts-wait" e
// decideShowGate("doubts-wait")=false → nenhum gate → silêncio.
//
// Fix (estratégia 1): a explicação server-authored É o endereçamento das dúvidas
// (igual à resposta do usuário no caminho de texto). shouldMarkDoubtsAddressed
// cobre os DOIS casos → nextGate converge pro `consent` (que já oferece "Entendi,
// continuar" / "Entender mais antes") no MESMO turno. Auto-avançar ≠ pular etapa:
// o gate de consent continua APARECENDO, só não exige "continua/vai".
// ============================================================================

function readSource(rel: string): string {
	return readFileSync(resolve(process.cwd(), rel), "utf-8");
}

/** Estado logo após o clique "Tenho dúvidas" (o do print): experiência escolhida,
 * dúvidas ainda não endereçadas, consent ainda não ofertado. */
function doubtsClickMeta(over: Partial<ConversationMetadata> = {}): ConversationMetadata {
	return {
		currentPersona: "helena-imovel",
		currentCategory: "imovel",
		experiencePrev: "doubts",
		doubtsAddressed: false,
		...over,
	};
}

describe("FIX-206 shouldMarkDoubtsAddressed — a explicação (server OU user) endereça as dúvidas", () => {
	it("turno de SERVIDOR (clique 'Tenho dúvidas' → explicação) marca doubtsAddressed", () => {
		// O CORAÇÃO do fix: sem depender de isUserTurn. Antes, o server-authored
		// nunca marcava → funil preso em doubts-wait.
		expect(
			shouldMarkDoubtsAddressed({
				meta: { experiencePrev: "doubts", doubtsAddressed: false },
				producedArtifact: false,
				userReplied: true,
			}),
		).toBe(true);
	});

	it("turno do usuário (resposta por texto à dúvida) também marca — paridade", () => {
		expect(
			shouldMarkDoubtsAddressed({
				meta: { experiencePrev: "doubts", doubtsAddressed: false },
				producedArtifact: false,
				userReplied: true,
			}),
		).toBe(true);
	});

	it("NÃO marca se já endereçado (idempotente)", () => {
		expect(
			shouldMarkDoubtsAddressed({
				meta: { experiencePrev: "doubts", doubtsAddressed: true },
				producedArtifact: false,
				userReplied: true,
			}),
		).toBe(false);
	});

	it("NÃO marca se a experiência não é 'doubts'", () => {
		expect(
			shouldMarkDoubtsAddressed({
				meta: { experiencePrev: "first", doubtsAddressed: false },
				producedArtifact: false,
				userReplied: true,
			}),
		).toBe(false);
	});

	it("NÃO marca se o turno produziu artifact (não é explicação pura)", () => {
		expect(
			shouldMarkDoubtsAddressed({
				meta: { experiencePrev: "doubts", doubtsAddressed: false },
				producedArtifact: true,
				userReplied: true,
			}),
		).toBe(false);
	});

	it("NÃO marca se o turno não produziu texto (nada foi endereçado)", () => {
		expect(
			shouldMarkDoubtsAddressed({
				meta: { experiencePrev: "doubts", doubtsAddressed: false },
				producedArtifact: false,
				userReplied: false,
			}),
		).toBe(false);
	});
});

describe("FIX-206 convergência — o clique 'Tenho dúvidas' termina no gate consent, não em silêncio", () => {
	it("o BECO (sem o fix): sem doubtsAddressed, nextGate=doubts-wait e o gate é suprimido", () => {
		const meta = doubtsClickMeta();
		expect(nextGate(meta, { hasContactName: true })).toBe("doubts-wait");
		// Turno server-authored (o directive de dúvidas): doubts-wait NÃO tem card →
		// silêncio total. Este é exatamente o beco que o fix elimina.
		expect(
			decideShowGate({ gate: "doubts-wait", intent: "neutral", meta, isUserTurn: false }),
		).toBe(false);
	});

	it("o FIX: marcado doubtsAddressed, nextGate converge pro consent", () => {
		const meta = doubtsClickMeta({ doubtsAddressed: true });
		expect(nextGate(meta, { hasContactName: true })).toBe("consent");
	});

	it("o FIX: o consent DISPARA no turno server-authored (o próximo passo aparece)", () => {
		const meta = doubtsClickMeta({ doubtsAddressed: true });
		expect(decideShowGate({ gate: "consent", intent: "neutral", meta, isUserTurn: false })).toBe(
			true,
		);
	});

	it("invariante: NÃO pula etapa — o gate de consent ainda é obrigatório (não some)", () => {
		// Auto-avançar ≠ BUG-FUNIL-PULA-PASSO2: o consent continua no caminho, só
		// deixa de exigir "continua/vai". qualifyConsented ainda é false aqui.
		const meta = doubtsClickMeta({ doubtsAddressed: true });
		expect(meta.qualifyConsented).toBeFalsy();
		expect(nextGate(meta, { hasContactName: true })).toBe("consent");
	});
});

// ============================================================================
// Varredura da CLASSE (decisão do Kairo: matar TODOS os pontos de trava): cada
// reação server-authored da qualificação é seguida de um gate ACIONÁVEL no mesmo
// turno — nenhuma termina em silêncio (nextGate ≠ doubts-wait mudo E
// decideShowGate(server) = true).
// ============================================================================
describe("FIX-206 varredura — nenhuma reação server-authored termina o turno sem próximo passo", () => {
	const base: ConversationMetadata = {
		currentPersona: "helena-imovel",
		currentCategory: "imovel",
	};

	// Cada linha = estado logo APÓS a reação server-authored do handler/route
	// (o que o directive daquele clique deixa no meta), + o gate esperado.
	const cases: Array<{ nome: string; meta: ConversationMetadata; gateEsperado: string }> = [
		{
			nome: "experiência 'primeira vez' → consent",
			meta: { ...base, experiencePrev: "first" },
			gateEsperado: "consent",
		},
		{
			nome: "experiência 'já conheço' → consent",
			meta: { ...base, experiencePrev: "returning" },
			gateEsperado: "consent",
		},
		{
			nome: "experiência 'tenho dúvidas' (pós-explicação) → consent",
			meta: { ...base, experiencePrev: "doubts", doubtsAddressed: true },
			gateEsperado: "consent",
		},
		{
			nome: "consent aceito → identify",
			meta: { ...base, experiencePrev: "first", qualifyConsented: true },
			gateEsperado: "identify",
		},
		{
			// FIX-215 (Ata 2026-07-04): lance saiu da entrada — valor informado vai
			// DIRETO pra busca/reveal, nunca pro gate de lance.
			nome: "valor do bem informado → search",
			meta: {
				...base,
				experiencePrev: "first",
				qualifyConsented: true,
				identityCollected: true,
				qualifyAnswers: { creditMax: 300_000 },
			},
			gateEsperado: "search",
		},
		{
			// FIX-215: a conversa de lance só entra em jogo PÓS-reveal.
			nome: "pós-reveal, tem lance → lance-value",
			meta: {
				...base,
				experiencePrev: "first",
				qualifyConsented: true,
				identityCollected: true,
				searchDispatched: true,
				revealCompleted: true,
				qualifyAnswers: { creditMax: 300_000, hasLance: "yes" },
			},
			gateEsperado: "lance-value",
		},
	];

	for (const c of cases) {
		it(`${c.nome} — gate acionável, disparado no turno de servidor`, () => {
			const gate = nextGate(c.meta, { hasContactName: true });
			expect(gate).toBe(c.gateEsperado);
			expect(gate).not.toBe("doubts-wait");
			// Turno server-authored (a reação) SEMPRE mostra o próximo gate.
			expect(decideShowGate({ gate, intent: "neutral", meta: c.meta, isUserTurn: false })).toBe(
				true,
			);
		});
	}
});

describe("FIX-206 acoplamento — o runner consome a decisão pura (não regra-no-prompt)", () => {
	it("runner.ts marca doubtsAddressed via shouldMarkDoubtsAddressed", () => {
		const src = readSource("src/lib/agent/orchestrator/runner.ts");
		expect(src).toMatch(/shouldMarkDoubtsAddressed/);
	});
});
