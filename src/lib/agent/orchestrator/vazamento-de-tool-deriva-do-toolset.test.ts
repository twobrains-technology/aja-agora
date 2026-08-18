/**
 * A última barreira contra nome de tool na tela estava desatualizada por
 * construção.
 *
 * `INTERNAL_TOOL_LEAK_PATTERN` era uma lista escrita à mão em ~julho/2026, e o
 * toolset cresceu depois dela. `escolher_cota`, `ajustar_por_parcela`,
 * `compute_scenarios`, `check_proposal_status` e outras nunca entraram — então
 * quando o modelo escreveu, na tela do cliente (prod web, `ff8f2080`,
 * 16/08/2026):
 *
 *     Perfeito, Kairo!
 *     [card: escolher_cota com id 6a7b59c125935b16a731639c]
 *
 * o sanitizer olhou, não reconheceu nada e deixou passar.
 *
 * A causa-raiz daquele vazamento é outra (o histórico ensinava a gramática
 * `[card: …]` ao modelo, corrigido em `conversation/messages.ts`), e a barreira
 * aqui é a rede embaixo. Uma rede com buraco do tamanho do toolset novo não é
 * rede: é a ilusão de uma.
 *
 * A correção é a regra do catálogo — texto sobre ferramenta DERIVA do bind, não
 * de uma cópia manual. Este teste é o invariante que impede a lista de congelar
 * de novo: tool nova no toolset sem cobertura aqui deixa o CI vermelho.
 *
 * Note que isto NÃO é regex sobre a fala do agente no sentido proibido: o alvo
 * não é uma frase que soou mal, é o identificador snake_case de uma ferramenta
 * interna — um vocabulário que o cliente jamais deveria ler, e que o servidor
 * conhece exaustivamente.
 */

import { describe, expect, it } from "vitest";
import { WHAT_IF_TOOL_NAMES } from "@/lib/agent/langgraph/toolset";
import { isInternalToolLeak } from "./sanitizer";

describe("vazamento de tool — a barreira cobre o toolset inteiro", () => {
	it.each(WHAT_IF_TOOL_NAMES)("cobre `%s`", (nome) => {
		expect(isInternalToolLeak(`Perfeito! Vou chamar ${nome} agora.`)).toBe(true);
	});

	it("pega o formato exato que chegou ao cliente em 16/08", () => {
		expect(isInternalToolLeak("[card: escolher_cota com id 6a7b59c125935b16a731639c]")).toBe(true);
	});

	it("continua pegando as tools do runtime anterior, que ainda aparecem em directive", () => {
		for (const nome of ["search_groups", "recommend_groups", "create_lead", "update_lead"]) {
			expect(isInternalToolLeak(`vou chamar ${nome}`)).toBe(true);
		}
	});

	// Contraprova: a barreira não pode comer copy legítima. Se ela ficar frouxa,
	// o agente perde falas boas e o defeito vira invisível (bolha some sem
	// motivo), que é pior do que o vazamento.
	it("não toca copy em português", () => {
		for (const fala of [
			"Perfeito, Kairo! Essa do Banco do Brasil é a de menor parcela.",
			"Vou buscar as melhores opções pra você agora.",
			"O grupo tem 217 meses e a parcela é de R$ 6.162.",
			"Me confirma se é essa cota mesmo que você quer?",
		]) {
			expect(isInternalToolLeak(fala)).toBe(false);
		}
	});
});
