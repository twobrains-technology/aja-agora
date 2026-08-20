/**
 * D6 (PRD 19/08/2026, conversa da Rute) — A ESCOLHA QUE O PRÓPRIO AGENTE PEDIU.
 *
 *   [24] agente: "O Itaú tem duas opções na tela… Qual delas você prefere?"
 *                 [A de menor parcela] [A de prazo mais curto]
 *   [26] cliente: "A de prazo mais curto"
 *
 * Resposta direta, sem ambiguidade nenhuma, à pergunta de escolha que o agente
 * acabara de fazer. E o código a recusou: `escolhaPodeSerAncorada` exige um
 * sim/não literal, e "a de prazo mais curto" não é nem um nem outro. O funil
 * ficou parado três portões atrás da conversa, a etapa de decisão nunca abriu, e
 * o contrato ficou inalcançável.
 *
 * O FIX-406 continua certo: texto livre não assina contrato. Mas o produto não
 * tinha NENHUM caminho para a resposta que o próprio agente solicita — os
 * botões que ele oferece mandam texto puro por design. Cliente cooperativo,
 * usando só o que lhe foi oferecido, não chegava ao contrato. Isso não é rigor,
 * é beco sem saída.
 *
 * A porta que se abre aqui é ANCORADA EM FATO DE SERVIDOR, não em regex de
 * fala: o servidor sabe QUAIS cotas ele mesmo ofereceu como escolha no turno
 * anterior (`escolhaOfertada`, coagida server-side a partir dos rótulos), e a
 * resolução acontece dentro desse conjunto fechado. Sem a oferta no estado,
 * nada muda — é o mesmo veto de sempre.
 */

import { describe, expect, it } from "vitest";
import type { ChosenOffer } from "@/lib/agent/orchestrator/choose-offer";
import { escolhaPodeSerAncorada } from "./escolha-ancoravel";

const ITAU_147: ChosenOffer = {
	groupId: "ita-147",
	administradora: "ITAÚ",
	creditValue: 524_580,
	monthlyPayment: 4_519,
	termMonths: 147,
};
const ITAU_158: ChosenOffer = {
	groupId: "ita-158",
	administradora: "ITAÚ",
	creditValue: 507_960,
	monthlyPayment: 4_154,
	termMonths: 158,
};
const EXIBIDAS = [ITAU_147, ITAU_158];
const OFERTADAS = { groupIds: ["ita-147", "ita-158"] };

describe("D6 — responder a pergunta de escolha do agente ANCORA", () => {
	it('"A de prazo mais curto" ancora na cota de 147 meses', () => {
		const r = escolhaPodeSerAncorada({
			texto: "A de prazo mais curto",
			intent: "providing_info",
			groupId: "ita-147",
			exibidas: EXIBIDAS,
			escolhaOfertada: OFERTADAS,
		});
		expect(r).toEqual({ ancora: true, cota: ITAU_147 });
	});

	it('"A de menor parcela" ancora na de 158 meses — a resolução é do dado, não do modelo', () => {
		const r = escolhaPodeSerAncorada({
			texto: "a de menor parcela",
			intent: "providing_info",
			groupId: "ita-158",
			exibidas: EXIBIDAS,
			escolhaOfertada: OFERTADAS,
		});
		expect(r.ancora).toBe(true);
	});

	it("o modelo indicando a cota ERRADA não ancora — a fala do cliente é a autoridade", () => {
		const r = escolhaPodeSerAncorada({
			texto: "A de prazo mais curto",
			intent: "providing_info",
			// prazo mais curto é a de 147; o modelo mandou a outra
			groupId: "ita-158",
			exibidas: EXIBIDAS,
			escolhaOfertada: OFERTADAS,
		});
		expect(r.ancora).toBe(false);
	});

	it("SEM a oferta de escolha no estado, o veto do FIX-406 continua de pé", () => {
		const r = escolhaPodeSerAncorada({
			texto: "A de prazo mais curto",
			intent: "providing_info",
			groupId: "ita-147",
			exibidas: EXIBIDAS,
		});
		expect(r).toEqual({ ancora: false, veto: "sem-aceite-explicito" });
	});

	it("cota fora da oferta feita pelo servidor não ancora por característica", () => {
		const outra: ChosenOffer = {
			groupId: "bb-217",
			administradora: "BANCO DO BRASIL",
			creditValue: 499_634,
			monthlyPayment: 3_031,
			termMonths: 217,
		};
		const r = escolhaPodeSerAncorada({
			texto: "a de menor parcela",
			intent: "providing_info",
			groupId: "bb-217",
			exibidas: [...EXIBIDAS, outra],
			// O servidor ofereceu só as duas do Itaú.
			escolhaOfertada: OFERTADAS,
		});
		expect(r.ancora).toBe(false);
	});

	it("recusa continua vetando mesmo com pergunta de escolha aberta", () => {
		const r = escolhaPodeSerAncorada({
			texto: "nenhuma delas, não quero mais",
			intent: "declines",
			groupId: "ita-147",
			exibidas: EXIBIDAS,
			escolhaOfertada: OFERTADAS,
		});
		expect(r.ancora).toBe(false);
	});

	it("pergunta em aberto sobre uma das cotas não é escolha", () => {
		const r = escolhaPodeSerAncorada({
			texto: "quanto fica a parcela da de prazo mais curto?",
			intent: "asking_question",
			groupId: "ita-147",
			exibidas: EXIBIDAS,
			escolhaOfertada: OFERTADAS,
		});
		expect(r.ancora).toBe(false);
	});

	it("recusa reconhecida pelo texto barra, mesmo com o intent otimista do analyzer", () => {
		// A sonda `pnpm sonda:intent` já mostrou o analyzer rotulando recusas como
		// `ready_to_proceed` (FIX-388). O rótulo não pode ser a única defesa: o
		// texto é conferido pelo mesmo predicado de recusa do resto do sistema.
		const r = escolhaPodeSerAncorada({
			texto: "a de prazo mais curto não, deixa pra lá",
			intent: "ready_to_proceed",
			groupId: "ita-147",
			exibidas: EXIBIDAS,
			escolhaOfertada: OFERTADAS,
		});
		expect(r.ancora).toBe(false);
	});

	it('"qualquer uma MENOS a de prazo mais curto" não ancora a excluída', () => {
		// A revisão de 19/08/2026 mediu este par: o analyzer rotula otimista, o
		// modelo declara a cota que a frase EXCLUI, e a porta 2 ancorava — porque
		// `administradoraFoiRecusada` compara MARCA (as duas eram Itaú) e o
		// resolvedor por característica não olhava a exclusão. Exige erro duplo,
		// mas é exatamente o par que a guarda existe para não confiar.
		const r = escolhaPodeSerAncorada({
			texto: "qualquer uma menos a de prazo mais curto",
			intent: "ready_to_proceed",
			groupId: "ita-147",
			exibidas: EXIBIDAS,
			escolhaOfertada: OFERTADAS,
		});
		expect(r.ancora).toBe(false);
	});

	it.each([
		// A variante coloquial de "a de MENOR parcela". A primeira versão da guarda
		// de exclusão casava "menos" solto na frase e vetava a própria escolha —
		// o FIX-412 pagou exatamente esse erro com "sem": gatilho sem adjacência
		// vira recusa onde havia ênfase.
		"a de menos parcela",
		"a que tem menos parcela",
	])("variante coloquial continua ancorando: %s", (fala) => {
		const r = escolhaPodeSerAncorada({
			texto: fala,
			intent: "providing_info",
			groupId: "ita-158",
			exibidas: EXIBIDAS,
			escolhaOfertada: OFERTADAS,
		});
		expect(r.ancora, fala).toBe(true);
	});

	it('o "sim" explícito continua ancorando como sempre (sem regressão)', () => {
		const r = escolhaPodeSerAncorada({
			texto: "isso, quero essa mesma",
			intent: "ready_to_proceed",
			groupId: "ita-147",
			exibidas: EXIBIDAS,
		});
		expect(r.ancora).toBe(true);
	});
});
