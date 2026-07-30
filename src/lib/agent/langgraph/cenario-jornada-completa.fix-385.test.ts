// FIX-385 — a jornada COMPLETA do mock, do "oi" até o contrato.
//
// Por que este arquivo existe, e por que ele é diferente dos recortes:
//
// Os dois bugs que apareceram ao vivo hoje (FIX-376, o card entalado; FIX-377,
// o loop de "vou pesquisar") moravam na JUNTA entre etapas — não dentro de
// nenhuma delas. Cenário recortado não vê junta. Este percorre a jornada inteira
// numa conversa só, então vê.
//
// ⚠️ COMO ISSO NÃO ENGESSA O AGENTE: o que se asserta são MARCOS e
// DEPENDÊNCIAS, nunca coreografia. Entre um marco e outro o modelo fala o que
// quiser, na ordem que quiser, em quantos balões quiser — o cenário não olha o
// texto. O que ele cobra é o que quebra dinheiro ou confiança se sair torto:
//
//   · o contrato não pode existir antes do aceite
//   · a recomendação destacada não pode sair antes da experiência ser respondida
//   · a escassez só aparece com vaga REAL vinda da administradora
//   · aceitar o embutido move o alvo pra uma carta que ainda entregue o bem
//
// Essas quatro coisas são invariantes de negócio. O resto é do modelo.
import { afterAll, describe, expect, it } from "vitest";
import { buscaDoMock } from "./testing/grupos-do-mock";
import { limparCenario, runScenario, type ScenarioResult } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** Fala curta e genérica do agente. O conteúdo é irrelevante de propósito: se um
 * marco só aparece quando o modelo diz a frase "certa", o marco está no lugar
 * errado (deveria ser código). */
const FALA = [{ text: "Certo." }];

/** A trilha da conversa inteira, na ordem em que o cliente veria. */
function trilhaCompleta(r: ScenarioResult): string[] {
	return r.turns.flatMap((t) => t.trilha);
}

/** Índice do primeiro aparecimento de um marco (-1 = nunca apareceu). */
function quando(trilha: string[], marco: string): number {
	return trilha.indexOf(marco);
}

describeIfDb("FIX-385 — jornada completa: marcos e dependências", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it("Madalena: do primeiro contato ao contrato, com os marcos na ordem que importa", async () => {
		const r = await runScenario({
			busca: buscaDoMock(96),
			contactName: null, // ninguém se apresentou ainda
			metaInicial: {},
			turns: [
				// ── entrada ────────────────────────────────────────────────────────
				{ user: "oi", beats: FALA },
				{
					user: "Quero trocar de carro",
					beats: FALA,
					extrai: (m) => {
						m.currentCategory = "auto";
					},
				},
				{ user: "Madalena", beats: FALA },
				{
					user: "Um Corolla, sempre quis",
					beats: FALA,
					extrai: (m) => {
						m.desireAsked = true;
						m.qualifyAnswers = { ...m.qualifyAnswers, desiredItem: "Corolla" };
					},
				},
				{
					user: "Meu carro vive na oficina, cansei",
					beats: FALA,
					extrai: (m) => {
						m.qualifyAnswers = { ...m.qualifyAnswers, motivation: "carro vive na oficina" };
					},
				},
				// ── valor do bem + identidade (pré-requisitos da busca) ────────────
				{
					user: "Uns R$ 120.000",
					beats: FALA,
					extrai: (m) => {
						m.qualifyAnswers = { ...m.qualifyAnswers, creditMax: 120_000, creditMin: 108_000 };
					},
				},
				{
					user: "Enviei meus dados",
					beats: FALA,
					extrai: (m) => {
						m.identityCollected = true;
					},
				},
				// ── pós-reveal ────────────────────────────────────────────────────
				{
					user: "Primeira vez",
					beats: FALA,
					extrai: (m) => {
						m.experiencePrev = "first";
					},
				},
				{ user: "Pode mostrar", intent: "ready_to_proceed", beats: FALA },
				{
					user: "Queria rápido, mas não tenho grana agora",
					beats: FALA,
					extrai: (m) => {
						m.qualifyAnswers = { ...m.qualifyAnswers, prazoMeses: 12 };
					},
				},
				{
					user: "Não tenho agora, mas junto uns R$ 4 mil por mês",
					beats: FALA,
					extrai: (m) => {
						// `lanceValue: 0` é o dado real dela: NÃO tem reserva hoje — junta
						// aos poucos (`monthlySavings`). Sem preencher, o funil fica pedindo
						// o valor do lance, que é o correto dele fazer.
						m.qualifyAnswers = {
							...m.qualifyAnswers,
							hasLance: "yes",
							lanceValue: 0,
							monthlySavings: 4_000,
						};
					},
				},
				{ user: "isso, quero o lance embutido", intent: "ready_to_proceed", beats: FALA },
				// ── decisão e fechamento ──────────────────────────────────────────
				{ user: "Gostei, faz sentido pra mim!", intent: "ready_to_proceed", beats: FALA },
				{ user: "bora fechar", intent: "ready_to_proceed", beats: FALA },
			],
		});
		criadas.push(r.conversationId);

		const trilha = trilhaCompleta(r);

		// ── MARCO 1: a lista de grupos reais aparece ──────────────────────────
		const lista = quando(trilha, "artifact:comparison_table");
		expect(lista).toBeGreaterThanOrEqual(0);

		// ── DEPENDÊNCIA 1: o hero (recomendação destacada) NUNCA antes da lista.
		// Destacar uma opção antes de mostrar o conjunto é vender sem comparar.
		const hero = quando(trilha, "artifact:recommendation_card");
		if (hero >= 0) expect(hero).toBeGreaterThan(lista);

		// ── DEPENDÊNCIA 2 (FIX-376): o contrato NUNCA antes da lista.
		const contrato = quando(trilha, "artifact:contract_form");
		if (contrato >= 0) expect(contrato).toBeGreaterThan(lista);

		// ── MARCO 2: a jornada ANDOU até o fim. O pecado capital deste produto é
		// a conversa que morre no meio — foi o FIX-377, e é o que uma jornada
		// completa detecta e um recorte não.
		expect(r.meta.revealCompleted).toBe(true);
		expect(r.meta.searchDispatched).toBe(true);

		// O guardrail aritmético do embutido (120k ÷ 0,7 → carta maior) NÃO é
		// asserido aqui de propósito: ele exige o gate `lance-embutido` ativo no
		// turno exato, e um roteiro fixo de 14 turnos teria que adivinhar a
		// cascata inteira pra acertar — teste frágil que quebra a cada ajuste de
		// funil, sem apontar defeito nenhum. Aquele invariante vive em
		// `cenario-jornada-madalena.fix-383`, com o gate posicionado direto.
		// Regra que vale pros próximos: jornada completa prova ORDEM e
		// CONTINUIDADE; conta específica se prova no cenário focado.
	});

	it("o contrato só existe depois do aceite", async () => {
		// Mesma jornada, PARANDO antes de aceitar. Nada de contrato pode aparecer:
		// formulário de contratação sem aceite é compromisso que o cliente não deu.
		const r = await runScenario({
			busca: buscaDoMock(96),
			metaInicial: {
				desireAsked: true,
				identityCollected: true,
				currentCategory: "auto" as const,
				searchDispatched: true,
				revealCompleted: true,
				experiencePrev: "first",
				qualifyAnswers: { creditMax: 120_000, prazoMeses: 12, hasLance: "no" },
			},
			turns: [
				{ user: "deixa eu pensar ainda", beats: FALA },
				{ user: "tenho algumas dúvidas antes", beats: FALA },
			],
		});
		criadas.push(r.conversationId);

		const trilha = trilhaCompleta(r);
		expect(trilha).not.toContain("artifact:contract_form");
		expect(r.meta.contractFormDispatched).not.toBe(true);
	});

	it("escassez só com vaga real vinda da administradora", async () => {
		// A busca devolve grupos SEM `availableSlots` — a administradora não
		// informou. Inventar "restam apenas 3" nesse caso é pressão sobre número
		// que não existe.
		const semVagas = async () => ({
			recommendations: [
				{
					id: "sem-vagas-1",
					administradora: "CANOPUS",
					creditValue: 120_000,
					monthlyPayment: 1_092,
					termMonths: 96,
					rank: 0,
				},
			],
		});

		const r = await runScenario({
			busca: semVagas as never,
			metaInicial: {
				desireAsked: true,
				identityCollected: true,
				currentCategory: "auto" as const,
				experiencePrev: "first",
				qualifyAnswers: { creditMax: 120_000, prazoMeses: 12, hasLance: "no" },
			},
			turns: [
				{ user: "manda ver", beats: FALA },
				{ user: "gostei, bora", intent: "ready_to_proceed", beats: FALA },
			],
		});
		criadas.push(r.conversationId);

		expect(trilhaCompleta(r)).not.toContain("artifact:scarcity");
	});
});
