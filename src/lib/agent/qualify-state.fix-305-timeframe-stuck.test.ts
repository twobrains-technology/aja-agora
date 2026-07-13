import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "./personas";
import {
	GATE_STUCK_ESCAPE_THRESHOLD,
	nextGate,
	registerGateStuckTurn,
	STUCK_ESCAPE_GATES,
} from "./qualify-state";

// ============================================================================
// FIX-305 (rodada 10, onda 3, loop-de-goal consórcio) — achado no bakeoff
// pós-onda-1 (FIX-304): sob modelo com extração fraca de texto livre (Qwen), o
// funil pós-reveal trava indefinidamente no gate `timeframe` quando o usuário
// responde de forma neutra/vaga sem nunca informar um prazo — `nextGate()`
// devolve o MESMO gate pra sempre (`qualifyAnswers.prazoMeses` nunca é
// preenchido) e `simulator-offer` nunca é alcançado.
//
// Trace real (.bakeoff/qwen-jornada-pos-r10-onda1.log, FIX-304):
//   ... reco-consent → timeframe → timeframe → timeframe → timeframe (4x)
//   [gate-skip] gate=timeframe intent=neutral — staying conversational
//
// Decisão de produto (Kairo, AskUserQuestion 2026-07-13): "Default após N
// tentativas — depois de ~2-3 respostas vagas seguidas sem extrair prazo,
// assume um prazo padrão razoável e segue o funil. Nunca trava."
//
// Investigação desta rodada (docs/decisoes/blocos/2026-07-13-bloco-r10-3-
// timeframe-stuck.md): `lance`/`lance-value`/`lance-embutido` AINDA estão em
// COLLECTION_GATES hoje, mas isso não os protege do MESMO risco — afeta só
// `decideShowGate` (se o card volta a aparecer), nunca `nextGate()` (a
// cascata que decide se o funil avança). Aplica-se o MESMO mecanismo aos 4.
// ============================================================================

const posReveal = (over: Partial<ConversationMetadata> = {}): ConversationMetadata => ({
	desireAsked: true,
	currentPersona: "rafael-auto",
	currentCategory: "auto",
	identityCollected: true,
	searchDispatched: true,
	revealCompleted: true,
	experiencePrev: "first",
	// FIX-297/FIX-308: reco-consent precisa estar RESPONDIDO pra nextGate
	// cruzar até o timeframe (senão fica preso em "reco-consent").
	recoConsentDispatched: true,
	recoConsentAnswered: true,
	qualifyAnswers: { creditMax: 80_000 },
	...over,
});

describe("FIX-305 — gate `timeframe` (e a classe lance/lance-value/lance-embutido) preso sem escape", () => {
	it("reproduz o cenário travado: sem nenhum progresso no meta, nextGate() fica preso em 'timeframe' pra sempre — nextGate() é PURO, não existe turno que o faça avançar sozinho", () => {
		const meta = posReveal();
		expect(nextGate(meta, { hasContactName: true })).toBe("timeframe");
		// 10 chamadas repetidas (equivalente a 10 turnos neutros seguidos, sem
		// NENHUMA mudança no meta) — sem o mecanismo de escape, é sempre o mesmo gate.
		for (let i = 0; i < 10; i++) {
			expect(nextGate(meta, { hasContactName: true })).toBe("timeframe");
		}
	});

	it(`após ${GATE_STUCK_ESCAPE_THRESHOLD - 1} turnos presos, ainda NÃO assume o default (dá a última chance)`, () => {
		let meta = posReveal();
		for (let i = 0; i < GATE_STUCK_ESCAPE_THRESHOLD - 1; i++) {
			const patch = registerGateStuckTurn(meta, "timeframe");
			expect(patch, `tentativa ${i + 1}`).not.toBeNull();
			meta = { ...meta, ...patch };
		}
		expect(meta.qualifyAnswers?.prazoMeses).toBeUndefined();
		expect(nextGate(meta, { hasContactName: true })).toBe("timeframe");
	});

	it(`no ${GATE_STUCK_ESCAPE_THRESHOLD}º turno preso, assume o default (12 meses) e o funil AVANÇA — nunca trava`, () => {
		let meta = posReveal();
		for (let i = 0; i < GATE_STUCK_ESCAPE_THRESHOLD; i++) {
			const gate = nextGate(meta, { hasContactName: true });
			const patch = registerGateStuckTurn(meta, gate);
			meta = patch ? { ...meta, ...patch } : meta;
		}
		expect(meta.qualifyAnswers?.prazoMeses).toBe(12);
		expect(meta.qualifyAnswers?.objetivo).toBe("contemplacao_rapida");
		expect(meta.gateDefaultsAssumed?.timeframe).toBe(true);
		expect(meta.gateStuckTurns?.timeframe).toBe(0);
		expect(nextGate(meta, { hasContactName: true })).not.toBe("timeframe");
	});

	it("cenário ponta-a-ponta do card FIX-305: 3 turnos neutros presos no timeframe, resto da qualificação já resolvido → alcança simulator-offer", () => {
		let meta = posReveal({
			qualifyAnswers: {
				creditMax: 80_000,
				hasLance: "yes",
				lanceValue: 15_000,
				lanceEmbutido: true,
			},
		});
		for (let i = 0; i < GATE_STUCK_ESCAPE_THRESHOLD; i++) {
			const gate = nextGate(meta, { hasContactName: true });
			expect(gate, `turno ${i + 1}`).toBe("timeframe");
			const patch = registerGateStuckTurn(meta, gate);
			meta = patch ? { ...meta, ...patch } : meta;
		}
		expect(nextGate(meta, { hasContactName: true })).toBe("simulator-offer");
	});

	it("caminho feliz: resposta clara de prazo na 1ª tentativa usa o valor REAL — não regride, não aciona o escape", () => {
		const meta = posReveal({ qualifyAnswers: { creditMax: 80_000, prazoMeses: 24 } });
		expect(nextGate(meta, { hasContactName: true })).toBe("lance");
		expect(meta.qualifyAnswers?.prazoMeses).toBe(24);
		expect(meta.gateStuckTurns).toBeUndefined();
	});

	it("registerGateStuckTurn devolve null pra gates fora da classe de escape (ex.: credit/identify/search)", () => {
		const meta = posReveal({ identityCollected: false, qualifyAnswers: {} });
		expect(registerGateStuckTurn(meta, "credit")).toBeNull();
		expect(registerGateStuckTurn(meta, "identify")).toBeNull();
		expect(registerGateStuckTurn(meta, "search")).toBeNull();
		expect(registerGateStuckTurn(meta, "decision")).toBeNull();
	});

	it("mesma classe de bug: lance/lance-value/lance-embutido TAMBÉM escapam após o teto (não só timeframe)", () => {
		expect(STUCK_ESCAPE_GATES.has("lance")).toBe(true);
		expect(STUCK_ESCAPE_GATES.has("lance-value")).toBe(true);
		expect(STUCK_ESCAPE_GATES.has("lance-embutido")).toBe(true);

		let meta = posReveal({ qualifyAnswers: { creditMax: 80_000, prazoMeses: 12 } });
		for (let i = 0; i < GATE_STUCK_ESCAPE_THRESHOLD; i++) {
			const gate = nextGate(meta, { hasContactName: true });
			expect(gate, `turno ${i + 1}`).toBe("lance");
			const patch = registerGateStuckTurn(meta, gate);
			meta = patch ? { ...meta, ...patch } : meta;
		}
		expect(meta.qualifyAnswers?.hasLance).toBe("no");
		// hasLance="no" pula lance-value (só "yes" pede o valor) — vai direto pro embutido.
		expect(nextGate(meta, { hasContactName: true })).toBe("lance-embutido");
	});

	it("lance-value assume 20% do creditMax (mesmo percentual do cenário 'provável' de scenarios.ts) quando hasLance='yes' é real mas o valor nunca é extraído", () => {
		let meta = posReveal({
			qualifyAnswers: { creditMax: 100_000, prazoMeses: 12, hasLance: "yes" },
		});
		for (let i = 0; i < GATE_STUCK_ESCAPE_THRESHOLD; i++) {
			const gate = nextGate(meta, { hasContactName: true });
			expect(gate, `turno ${i + 1}`).toBe("lance-value");
			const patch = registerGateStuckTurn(meta, gate);
			meta = patch ? { ...meta, ...patch } : meta;
		}
		expect(meta.qualifyAnswers?.lanceValue).toBe(20_000);
		expect(nextGate(meta, { hasContactName: true })).toBe("lance-embutido");
	});

	it("lance-embutido assume false (consent-minimization: sem sinal claro, nunca assume opt-in) quando nunca resolve", () => {
		let meta = posReveal({
			qualifyAnswers: { creditMax: 80_000, prazoMeses: 12, hasLance: "no" },
		});
		for (let i = 0; i < GATE_STUCK_ESCAPE_THRESHOLD; i++) {
			const gate = nextGate(meta, { hasContactName: true });
			expect(gate, `turno ${i + 1}`).toBe("lance-embutido");
			const patch = registerGateStuckTurn(meta, gate);
			meta = patch ? { ...meta, ...patch } : meta;
		}
		expect(meta.qualifyAnswers?.lanceEmbutido).toBe(false);
		expect(nextGate(meta, { hasContactName: true })).toBe("simulator-offer");
	});
});
