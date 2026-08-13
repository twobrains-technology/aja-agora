// FIX-431 (P1 #10) — marco posterior invalida gate opcional anterior.
//
// Produção, WhatsApp, 2026-08-13, sessão `04fda013`. A ordem em que as coisas
// chegaram ao cliente:
//
//   02:58:38  "Boa! Pra garantir seu lugar nesse grupo, só preciso de uns
//              dados rápidos… é só um pré-cadastro"      ← fechamento
//   02:58:49  directive: "Usuário escolheu 'É a primeira vez'"  ← experience
//   02:59:08  directive: "Usuário escolheu prazo…"              ← timeframe
//
// O funil andou PARA TRÁS depois do fechamento: perguntas de qualificação
// chegando depois do pré-cadastro. Do lado do cliente é o vendedor que fecha o
// negócio e volta a perguntar se ele já comprou algo parecido antes.
//
// `experience` já tinha o guard de fechamento (`fechamentoSinalizado`); os
// outros gates OPCIONAIS não. Este teste amarra a regra inteira: nenhum gate
// que existe só para "ajudar a vender" pode reabrir depois que a venda entrou
// no fechamento. Os gates de COLETA (credit, identify) continuam bloqueando —
// sem CPF a administradora não contrata, e isso é invariante, não conversa.
import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { nextGate } from "./qualify-state";

/** Estado da S2 no momento do pré-cadastro: tudo coletado, oferta escolhida. */
function metaNoFechamento(extra: Partial<ConversationMetadata> = {}): ConversationMetadata {
	return {
		currentPersona: "moto",
		currentCategory: "moto",
		desireAsked: true,
		desireAnswered: true,
		motivationAsked: true,
		identityCollected: true,
		searchDispatched: true,
		revealCompleted: true,
		recommendedAdministradora: "BANCO DO BRASIL",
		qualifyAnswers: { creditMin: 19_800, creditMax: 22_000 },
		escolha: { groupId: "6a7b59c125935b16a73163e6", administradora: "BANCO DO BRASIL" },
		...extra,
	} as ConversationMetadata;
}

/** Gates que existem para ajudar a vender — nunca para bloquear. */
const GATES_OPCIONAIS = ["experience", "timeframe", "lance", "lance-value", "lance-embutido"];

describe("funil não anda para trás depois do fechamento", () => {
	it("com a cota escolhida, nenhum gate opcional reabre", () => {
		const gate = nextGate(metaNoFechamento(), { hasContactName: true });
		expect(GATES_OPCIONAIS, `o funil voltou para "${gate}" depois do fechamento`).not.toContain(
			gate,
		);
	});

	it("com a decisão aceita, idem", () => {
		const gate = nextGate(metaNoFechamento({ decisionAccepted: true }), { hasContactName: true });
		expect(GATES_OPCIONAIS).not.toContain(gate);
	});

	it("com o formulário de contratação já na tela, idem", () => {
		const gate = nextGate(metaNoFechamento({ contractFormDispatched: true }), {
			hasContactName: true,
		});
		expect(GATES_OPCIONAIS).not.toContain(gate);
	});

	// A trava NÃO pode virar atalho: sem identidade, a Bevi não contrata. Gate de
	// COLETA continua bloqueando mesmo com a escolha feita.
	it("gate de coleta continua bloqueando: sem identidade, volta para identify", () => {
		const gate = nextGate(metaNoFechamento({ identityCollected: false }), {
			hasContactName: true,
		});
		expect(gate).toBe("identify");
	});

	// Antes do fechamento, os gates opcionais seguem funcionando normalmente.
	it("sem fechamento sinalizado, o funil pergunta normalmente", () => {
		const meta = metaNoFechamento();
		const semFechamento = { ...meta, escolha: undefined } as ConversationMetadata;
		const gate = nextGate(semFechamento, { hasContactName: true });
		expect(gate).not.toBe("search");
	});
});
