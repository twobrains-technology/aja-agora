// FIX-395 — "faz sentido" dito sobre OUTRA coisa não escolhe a cota.
//
// Achado em 2026-07-30 por conversa REAL (`pnpm sonda:conversa fix-387`,
// modelo claude-sonnet-5, conversa `042e04ec`), conferido no BANCO e não na
// prosa. A jornada foi a do Bernardo: apartamento de R$ 700 mil, R$ 200 mil de
// reserva. O agente explicou o embutido certo e propôs, com a aritmética exata:
//
//   "A jogada certa aqui é mirar cartas maiores, na casa de R$ 1 milhão (…)
//    Enquanto isso, só pra fechar o quadro todo, Bernardo: em quanto tempo você
//    gostaria de estar com as chaves desse apartamento na mão?"
//
// O cliente respondeu "faz sentido". Estado gravado depois disso:
//
//   lanceEmbutido:  null       ← o aceite do embutido NÃO foi registrado
//   creditMax:      700000     ← a carta não moveu
//   escolha:        { origem: "afirmacao", creditValue: 721000 }  ← ANCOROU
//
// Ou seja: ele concordou com a ESTRATÉGIA de buscar carta maior, e o funil
// registrou que ele havia ESCOLHIDO a cota antiga de R$ 721 mil — justamente a
// que o agente acabou de dizer que não serve.
//
// Esta é uma REGRESSÃO introduzida pelo FIX-387. Antes, "faz sentido" não casava
// com nenhuma palavra da lista de SIM e `detectYesNoText` devolvia `null`: nada
// acontecia. Depois do FIX-387 ele passou a ser um SIM legítimo (e deve ser),
// mas com isso destravou o caminho `origem: "afirmacao"` de `advance.ts` para
// QUALQUER afirmação da conversa — inclusive uma que respondia outra pergunta.
// Errar pra menos devolvia a pergunta; errar pra mais grava uma escolha que o
// cliente nunca fez.
//
// O invariante: uma afirmação só vira escolha quando NÃO HÁ OUTRA PERGUNTA NA
// MESA. A pergunta na mesa é o gate ativo — se o funil ainda está coletando
// prazo, lance ou experiência, o "sim" pertence àquela pergunta, não à cota.
// `perguntaAberta` (já existente) não cobre isto: ela olha o intent do USUÁRIO
// (se ELE perguntou), não se o AGENTE tem pergunta pendente.
import { afterAll, describe, expect, it } from "vitest";
import { buscaDoMock } from "./testing/grupos-do-mock";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** O estado exato da conversa `042e04ec` no turno do "faz sentido": reveal
 * feito, oferta ancorada, e o funil AINDA cobrando o prazo (`timeframe`) —
 * `prazoMeses` ausente de propósito, é isso que mantém o gate aberto. */
const FUNIL_AINDA_COBRANDO_PRAZO = {
	desireAsked: true,
	identityCollected: true,
	currentCategory: "imovel" as const,
	searchDispatched: true,
	revealCompleted: true,
	experiencePrev: "returning" as const,
	recoConsentAnswered: true,
	qualifyAnswers: {
		creditMax: 700_000,
		hasLance: "yes" as const,
		lanceValue: 200_000,
	},
	recommendedOffer: {
		administradora: "Itaú",
		creditValue: 721_000,
		termMonths: 221,
		monthlyPayment: 4_430.98,
	},
};

describeIfDb("FIX-395 — afirmação que responde outra pergunta não escolhe a cota", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it.each(["faz sentido", "concordo", "perfeito"])(
		"com o funil ainda cobrando prazo, '%s' NÃO ancora escolha",
		async (fala) => {
			const r = await runScenario({
				busca: buscaDoMock(96),
				metaInicial: FUNIL_AINDA_COBRANDO_PRAZO,
				turns: [
					{
						user: fala,
						// É o que o Haiku real devolve pra estas falas depois de uma
						// pergunta do agente (medido em `pnpm sonda:intent`).
						intent: "ready_to_proceed",
						beats: [{ text: "Boa!" }],
					},
				],
			});
			criadas.push(r.conversationId);

			expect(r.meta.escolha).toBeUndefined();
		},
	);

	it("recusa continua não ancorando nada (FIX-388 não pode regredir)", async () => {
		const r = await runScenario({
			busca: buscaDoMock(96),
			metaInicial: {
				...FUNIL_AINDA_COBRANDO_PRAZO,
				// Tudo coletado — nenhuma pergunta na mesa. É a única situação em que
				// uma afirmação genérica pode significar "escolhi esta".
				qualifyAnswers: {
					...FUNIL_AINDA_COBRANDO_PRAZO.qualifyAnswers,
					prazoMeses: 12,
					lanceEmbutido: false,
				},
			},
			turns: [
				{
					user: "não, prefiro usar só o meu dinheiro",
					intent: "ready_to_proceed",
					beats: [{ text: "Sem problema." }],
				},
			],
		});
		criadas.push(r.conversationId);

		expect(r.meta.escolha).toBeUndefined();
	});

	// ── APOSENTADOS PELO FIX-400 (decisão do Kairo, 2026-07-30) ──
	//
	// Este arquivo tinha quatro describes a mais — FIX-399b, 399e, 399g e 399h —
	// que asseveravam quais FALAS deveriam ancorar `escolha`: "quero fechar essa",
	// "manda o contrato", "aceito" no gate de decisão, "quero essa" mas não "quero
	// essa quantia mesmo", e assim por diante. Cada um nasceu de um P0 real que uma
	// revisão independente encontrou, e cada um fechou a porta daquela rodada.
	//
	// Foram removidos porque o FIX-400 tirou o chão de todos: `escolha` não é mais
	// inferida de texto NENHUM. Manter esses casos seria manter testes que
	// cobram um comportamento que o produto deliberadamente deixou de ter — e o
	// histórico deles (cinco portas, cinco rodadas) está preservado no cabeçalho
	// de `cenario-escolha-so-por-clique.fix-400.test.ts`, que é onde o invariante
	// novo vive.
	//
	// O que FICOU aqui é a metade que envelheceu bem: os casos que provam que uma
	// afirmação genérica NÃO ancora. Sob o FIX-400 eles são ainda mais verdadeiros,
	// e continuam valendo como anti-regressão caso alguém tente reintroduzir
	// inferência textual por alguma porta nova.
});
