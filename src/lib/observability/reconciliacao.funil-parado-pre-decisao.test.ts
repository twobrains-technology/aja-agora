/**
 * §5.4/§5.5 do PRD (19/08/2026) — O BURACO DE COBERTURA.
 *
 * `funil_travado_no_fecho` exige que a decisão TENHA SIDO OFERECIDA. Na conversa
 * da Rute o funil morreu ANTES disso: ela viu as ofertas, conversou seis turnos,
 * escolheu por característica, recebeu a simulação — e a etapa de decisão nunca
 * foi ofertada, porque a escolha dela nunca ancorou. Nenhum sinal acusou.
 *
 * `funil_parado_pre_decisao` é o sinal que faltava, e é determinístico: o reveal
 * aconteceu, o cliente seguiu falando, a decisão nunca foi ofertada e não há
 * proposta nenhuma. Juiz de LLM não pega funil parado — os três juízes
 * aprovaram esta conversa.
 *
 * `escolha_falada_nao_ancorada` mede o defeito D6 pelo outro lado: o servidor
 * SIMULOU uma cota específica — ou seja, sabia exatamente qual cota ela queria —
 * e mesmo assim não existe escolha gravada.
 */

import { describe, expect, it } from "vitest";
import { scoresDeReconciliacao } from "./reconciliacao-fala-estado";

const nomes = (e: Parameters<typeof scoresDeReconciliacao>[0]) =>
	scoresDeReconciliacao(e).map((s) => s.name);

/** O estado real da conversa 88384596 ao fim dos 6min37 (PRD §2). */
const CONVERSA_DA_RUTE = {
	maxStageReached: "em_negociacao",
	decisaoOferecidaEm: null,
	contratoOferecido: false,
	mensagensDoUsuarioAposDecisao: 0,
	propostas: 0,
	revealCompleted: true,
	mensagensDoUsuarioAposReveal: 4,
	escolhaAncorada: false,
	apontouUmaCota: true,
};

describe("funil_parado_pre_decisao — o sinal que teria acusado a Rute", () => {
	it("dispara na conversa que morreu antes da decisão", () => {
		expect(nomes(CONVERSA_DA_RUTE)).toContain("funil_parado_pre_decisao");
	});

	it("não dispara quando a decisão foi ofertada (aí quem fala é o outro sinal)", () => {
		expect(
			nomes({
				...CONVERSA_DA_RUTE,
				decisaoOferecidaEm: new Date("2026-08-19T17:28:00Z"),
			}),
		).not.toContain("funil_parado_pre_decisao");
	});

	it("não dispara com proposta gerada — houve desfecho", () => {
		expect(nomes({ ...CONVERSA_DA_RUTE, propostas: 1 })).not.toContain("funil_parado_pre_decisao");
	});

	it("um ou dois turnos após o reveal ainda é conversa normal", () => {
		expect(nomes({ ...CONVERSA_DA_RUTE, mensagensDoUsuarioAposReveal: 2 })).not.toContain(
			"funil_parado_pre_decisao",
		);
	});

	it("sem reveal não há funil parado — a conversa nem chegou lá", () => {
		expect(
			nomes({ ...CONVERSA_DA_RUTE, revealCompleted: false, mensagensDoUsuarioAposReveal: 0 }),
		).not.toContain("funil_parado_pre_decisao");
	});
});

describe("escolha_falada_nao_ancorada — ela escolheu e o servidor não registrou", () => {
	it("dispara quando a cota foi simulada e a escolha está ausente", () => {
		expect(nomes(CONVERSA_DA_RUTE)).toContain("escolha_falada_nao_ancorada");
	});

	it("escolha por CLIQUE (contractOffer, sem `escolha`) também silencia o sinal", () => {
		// O clique no card/atalho vai por `choose_offer` (route.ts), que grava
		// `contractOffer` e `decisionDispatched` — e nunca `escolha`. Ler só
		// `escolha` faria o alarme disparar exatamente na jornada que o produto
		// passou a promover: painel que acusa o acerto ensina a ignorar o painel.
		expect(
			nomes({ ...CONVERSA_DA_RUTE, escolhaAncorada: false, cotaDoContrato: true }),
		).not.toContain("escolha_falada_nao_ancorada");
	});

	it("com a escolha ancorada, silêncio", () => {
		expect(nomes({ ...CONVERSA_DA_RUTE, escolhaAncorada: true })).not.toContain(
			"escolha_falada_nao_ancorada",
		);
	});

	it("sem cota apontada, silêncio — ninguém escolheu nada ainda", () => {
		expect(nomes({ ...CONVERSA_DA_RUTE, apontouUmaCota: false })).not.toContain(
			"escolha_falada_nao_ancorada",
		);
	});
});

describe("os sinais antigos continuam intactos", () => {
	it("venda_prometida_sem_proposta segue disparando", () => {
		expect(nomes(CONVERSA_DA_RUTE)).toContain("venda_prometida_sem_proposta");
	});

	it("conversa saudável (proposta gerada, decisão ofertada) não gera sinal nenhum", () => {
		expect(
			nomes({
				maxStageReached: "proposta_enviada",
				decisaoOferecidaEm: new Date("2026-08-19T17:20:00Z"),
				contratoOferecido: true,
				mensagensDoUsuarioAposDecisao: 3,
				propostas: 1,
				revealCompleted: true,
				mensagensDoUsuarioAposReveal: 8,
				escolhaAncorada: true,
				apontouUmaCota: true,
			}),
		).toEqual([]);
	});
});
