import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { nextGate } from "@/lib/agent/qualify-state";

/**
 * A ORDEM DO FUNIL é o invariante mais caro deste produto: `nextGate` decide o que
 * a tela pede a cada turno, e o código é a fonte (CLAUDE.md — "Invariante
 * verificável vira código. Conversa é do modelo.").
 *
 * Este arquivo pina a ORDEM, não a copy: cada asserção falha se alguém reordenar a
 * cascata ou trocar uma condição de saída por outra. É a garantia que o motor novo
 * (pi) tem de reproduzir sem regredir — por isso ela é escrita ANTES do motor.
 */

/** Meta mínima. O `nextGate` lê poucos campos; o resto fica de fora de propósito. */
const meta = (over: Partial<ConversationMetadata> = {}): ConversationMetadata =>
	({ qualifyAnswers: {}, ...over }) as ConversationMetadata;

describe("nextGate — contrato fechado é TERMINAL", () => {
	it("devolve 'search' mesmo com o funil inteiro em branco", () => {
		// O caso que a vida real produziu: meta reidratado de forma incompleta
		// (resume server-side) num contrato já fechado. Sem esta precedência, a
		// cascata rodava por cima e reabria pergunta pra quem já tinha fechado.
		expect(nextGate(meta({ contractClosed: true }), { hasContactName: false })).toBe("search");
	});

	it("vence o gate do nome — que é o primeiro da cascata quando não há contrato", () => {
		expect(nextGate(meta(), { hasContactName: false })).toBe("name");
		expect(nextGate(meta({ contractClosed: true }), { hasContactName: false })).toBe("search");
	});
});

describe("nextGate — o nome não bloqueia quem já disse o que quer", () => {
	it("sem nome E sem alvo: pede o nome", () => {
		expect(nextGate(meta(), { hasContactName: false })).toBe("name");
	});

	it("sem nome MAS com categoria: NÃO pede o nome", () => {
		// 49,4% das conversas de produção morriam aqui, com 1,3 turno de média:
		// a pessoa escrevia o que queria e ouvia de volta uma pergunta.
		expect(nextGate(meta({ currentCategory: "auto" }), { hasContactName: false })).not.toBe("name");
	});

	it("com nome capturado e alvo: não pede o nome de novo", () => {
		expect(nextGate(meta({ currentCategory: "auto" }), { hasContactName: true })).not.toBe("name");
	});
});

describe("nextGate — nunca anda para trás", () => {
	it("quem já disse o que quer não recebe 'desire'", () => {
		const semAlvo = meta();
		const comAlvo = meta({ currentCategory: "auto" });
		expect(nextGate(semAlvo, { hasContactName: true })).toBe("desire");
		expect(nextGate(comAlvo, { hasContactName: true })).not.toBe("desire");
	});

	it("quem já marcou desireAsked não recebe 'desire' de novo", () => {
		// `desireAsked` é marcado na EMISSÃO, não na resposta: se o cliente pular,
		// o funil segue — e o gate nunca mais é re-emitido.
		const jaPediu = meta({ desireAsked: true });
		expect(nextGate(jaPediu, { hasContactName: true })).not.toBe("desire");
	});

	it("pendingFollowUp devolve 'doubts-wait' DEPOIS do desire", () => {
		// A cascata real: `desire` vem ANTES de `doubts-wait`. Escrito primeiro ao
		// contrário, este teste falhou contra o código — a precedência é o que vale
		// pinar, e ela é fácil de inverter sem ninguém notar.
		expect(nextGate(meta({ pendingFollowUp: true }), { hasContactName: true })).toBe("desire");
		expect(
			nextGate(meta({ pendingFollowUp: true, desireAsked: true }), { hasContactName: true }),
		).toBe("doubts-wait");
	});
});
