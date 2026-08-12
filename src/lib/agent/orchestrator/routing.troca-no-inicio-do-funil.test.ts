// Produção, 2026-08 — conversa retomada continuou como `auto` enquanto o
// cliente falava de moto, e a busca rodou na categoria errada.
//
// `decideRouting` só trocava de categoria quando `meta.currentCategory` estava
// vazia OU quando o ANALYZER (LLM) marcava `isExplicitSwitch`. Ou seja: com uma
// categoria já gravada, a troca dependia inteiramente de o modelo classificar a
// frase como "troca explícita" — que é a Lei 1 invertida (o LLM dirigindo o
// fluxo). Quando ele não marca, o cliente fala de moto a conversa inteira e o
// funil segue montando carta de carro.
//
// A correção não abre a troca geral: enquanto o funil AINDA NÃO INVESTIU nada na
// categoria atual (nenhuma busca disparada, nenhum reveal na tela), trocar não
// destrói nada — não há oferta, número nem card construído sobre a categoria
// velha. Depois do reveal o guard continua de pé: aí "e se fosse uma moto?" é
// pergunta hipotética no meio de uma jornada de carro, e jogar tudo fora seria
// pior que ignorar.

import { describe, expect, it } from "vitest";
import { decideRouting } from "@/lib/agent/orchestrator/routing";
import type { ConversationMetadata } from "@/lib/agent/personas";
import type { TurnAnalysis } from "@/lib/agent/turn-analyzer";

/** Analyzer que NÃO marcou troca explícita — o caso que deixava o cliente preso. */
const semSwitchExplicito = {
	detectedCategory: null,
	isExplicitSwitch: false,
} as unknown as TurnAnalysis;

describe("troca de categoria no início do funil", () => {
	it("cliente com categoria auto fala de moto ANTES de qualquer busca — troca", () => {
		const meta: ConversationMetadata = { currentCategory: "auto", desireAsked: true };
		expect(decideRouting("na verdade eu quero uma moto", meta, semSwitchExplicito)).toEqual({
			kind: "transition",
			toCategory: "moto",
			usedFallback: true,
		});
	});

	it("mesma frase DEPOIS do reveal não joga a jornada fora", () => {
		const meta: ConversationMetadata = {
			currentCategory: "auto",
			searchDispatched: true,
			revealCompleted: true,
		};
		expect(decideRouting("e se fosse uma moto?", meta, semSwitchExplicito)).toEqual({
			kind: "stay",
		});
	});

	it("busca já disparada (sem reveal ainda) também segura a troca", () => {
		const meta: ConversationMetadata = { currentCategory: "auto", searchDispatched: true };
		expect(decideRouting("quero uma moto", meta, semSwitchExplicito)).toEqual({ kind: "stay" });
	});

	it("switch explícito do analyzer continua trocando em qualquer ponto do funil", () => {
		const meta: ConversationMetadata = {
			currentCategory: "auto",
			searchDispatched: true,
			revealCompleted: true,
		};
		const analise = {
			detectedCategory: "moto",
			isExplicitSwitch: true,
		} as unknown as TurnAnalysis;
		expect(decideRouting("quero trocar pra moto", meta, analise)).toEqual({
			kind: "transition",
			toCategory: "moto",
			usedFallback: false,
		});
	});

	it("mesma categoria não vira transição", () => {
		const meta: ConversationMetadata = { currentCategory: "auto" };
		expect(decideRouting("quero um carro", meta, semSwitchExplicito)).toEqual({ kind: "stay" });
	});
});
