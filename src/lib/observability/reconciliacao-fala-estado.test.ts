// Reconciliação fala × estado — o sinal que teria pego a venda perdida.
//
// No turno em que o agente anunciou "você está oficialmente pré-cadastrado no
// consórcio do Itaú, o boleto chega na sua casa", TODOS os indicadores estavam
// verdes: `turno_mudo` 0,000, `card_sem_fala` 0,000, `finish_reason` ok em 65 de
// 65, e o juiz LLM deu 0,923 de `judge_avancou`. O defeito não era de fala — era
// de ESTADO: `bevi_proposals = 0`.
//
// Vinte passos a 95% dão 36% de ponta a ponta. Se dá para provar em código, não
// se gasta juiz.
import { describe, expect, it } from "vitest";
import { scoresDeReconciliacao } from "./reconciliacao-fala-estado";

/** O estado real da conversa 9b9f9aab (WhatsApp, 14/08) — a que prometeu. */
const CONVERSA_QUE_PROMETEU = {
	maxStageReached: "em_negociacao",
	decisaoOferecidaEm: new Date("2026-08-14T20:25:30-03:00"),
	contratoOferecido: false,
	mensagensDoUsuarioAposDecisao: 5,
	propostas: 0,
};

/** O estado real da conversa 75f77efd (web, 14/08) — a que fechou de verdade. */
const CONVERSA_QUE_FECHOU = {
	maxStageReached: "em_negociacao",
	decisaoOferecidaEm: new Date("2026-08-14T18:58:34-03:00"),
	contratoOferecido: true,
	mensagensDoUsuarioAposDecisao: 3,
	propostas: 1,
};

const nomes = (e: Parameters<typeof scoresDeReconciliacao>[0]) =>
	scoresDeReconciliacao(e).map((s) => s.name);

describe("scoresDeReconciliacao — o aceite do dossiê", () => {
	it("na conversa que prometeu sem proposta, os DOIS sinais valem 1", () => {
		const porNome = Object.fromEntries(
			scoresDeReconciliacao(CONVERSA_QUE_PROMETEU).map((s) => [s.name, s.value]),
		);
		expect(porNome.funil_travado_no_fecho).toBe(1);
		expect(porNome.venda_prometida_sem_proposta).toBe(1);
	});

	it("na conversa que fechou de verdade, nenhum dos dois acusa", () => {
		expect(nomes(CONVERSA_QUE_FECHOU)).toEqual([]);
	});
});

describe("funil_travado_no_fecho", () => {
	it("um único turno depois da decisão não acusa — pode ser só a conversa andando", () => {
		expect(
			nomes({ ...CONVERSA_QUE_PROMETEU, mensagensDoUsuarioAposDecisao: 1, propostas: 1 }),
		).toEqual([]);
	});

	it("sem card de decisão, não há fecho para travar", () => {
		expect(
			nomes({
				...CONVERSA_QUE_PROMETEU,
				decisaoOferecidaEm: null,
				maxStageReached: "engajado",
			}),
		).toEqual([]);
	});

	it("com o formulário de contratação emitido, o funil andou", () => {
		expect(nomes({ ...CONVERSA_QUE_PROMETEU, contratoOferecido: true, propostas: 1 })).toEqual([]);
	});
});

describe("venda_prometida_sem_proposta", () => {
	it("negociação sem nenhuma proposta na administradora acusa", () => {
		const s = scoresDeReconciliacao({
			maxStageReached: "em_negociacao",
			decisaoOferecidaEm: null,
			contratoOferecido: false,
			mensagensDoUsuarioAposDecisao: 0,
			propostas: 0,
		});
		expect(s.map((x) => x.name)).toEqual(["venda_prometida_sem_proposta"]);
	});

	it("conversa que nem chegou à negociação não acusa — não prometeu nada", () => {
		expect(
			nomes({
				maxStageReached: "engajado",
				decisaoOferecidaEm: null,
				contratoOferecido: false,
				mensagensDoUsuarioAposDecisao: 0,
				propostas: 0,
			}),
		).toEqual([]);
	});

	it("o comentário do score diz o que olhar, não só que está errado", () => {
		const [s] = scoresDeReconciliacao({
			maxStageReached: "em_negociacao",
			decisaoOferecidaEm: null,
			contratoOferecido: false,
			mensagensDoUsuarioAposDecisao: 0,
			propostas: 0,
		});
		expect(s.comment).toContain("bevi_proposals");
	});
});
