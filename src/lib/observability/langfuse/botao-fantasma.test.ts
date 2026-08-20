/**
 * §5.5 do PRD (19/08/2026) — O SINAL `botao_fantasma`.
 *
 * "Ação cujo `kind` final diverge da intenção declarada no card." Foi o que
 * matou a conversa da Rute e não deixou rastro nenhum: ela clicou em "Ver
 * cenários de contemplação", o front colapsou a intenção em `adjust-value` e o
 * servidor mandou ao modelo que ela queria mudar o valor do bem. Nenhum log,
 * nenhum score, nenhuma métrica — o defeito só aparecia como "o agente
 * respondeu qualquer coisa".
 *
 * A correção estrutural (lista fechada de intenções + handler por intenção) faz
 * a divergência não acontecer. Este sinal é a PROVA disso, e a rede para a
 * próxima tradução silenciosa que alguém escrever: o front passa a mandar a
 * intenção original junto da ação, e o servidor compara.
 *
 * Alvo declarado no PRD: zero ocorrências.
 */

import { describe, expect, it } from "vitest";
import { scoreDeBotaoFantasma } from "./funil-scores";

describe("botao_fantasma — o clique chegou como o cliente o viu?", () => {
	it("intenção que casa com o kind não gera sinal", () => {
		expect(scoreDeBotaoFantasma({ kind: "adjust-value", intent: "adjust_value" })).toEqual([]);
		expect(scoreDeBotaoFantasma({ kind: "adjust-value", intent: "new_simulation" })).toEqual([]);
		expect(scoreDeBotaoFantasma({ kind: "view-scenarios", intent: "view_scenarios" })).toEqual([]);
		expect(
			scoreDeBotaoFantasma({ kind: "compare-financing", intent: "compare_financing" }),
		).toEqual([]);
		expect(scoreDeBotaoFantasma({ kind: "show-other-options", intent: "compare_other" })).toEqual(
			[],
		);
	});

	it("o clique da Rute — view_scenarios chegando como adjust-value — acusa", () => {
		const [score] = scoreDeBotaoFantasma({ kind: "adjust-value", intent: "view_scenarios" });
		expect(score.name).toBe("botao_fantasma");
		expect(score.value).toBe(1);
		expect(score.comment).toContain("view_scenarios");
		expect(score.comment).toContain("adjust-value");
	});

	it("ação sem intenção declarada (card antigo, WhatsApp) não inventa alarme", () => {
		expect(scoreDeBotaoFantasma({ kind: "adjust-value" })).toEqual([]);
	});
});
