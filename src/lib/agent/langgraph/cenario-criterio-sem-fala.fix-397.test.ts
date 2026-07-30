// FIX-397 — a porta `criterio` e o que ela ancora, DOCUMENTADO com número na mão.
//
// ⚠️ HISTÓRICO, porque ele importa mais que o teste: a primeira versão deste
// arquivo afirmava corrigir "turno de SERVIDOR ancorando escolha" e adicionava um
// guard (`clienteFalouNesteTurno`) em `advance.ts`. Segunda revisão independente
// provou que aquilo era **código morto com justificativa falsa**:
//
//   · `advance.ts:38` — `if (!state.isUserTurn) return {}` faz o nó INTEIRO ser
//     no-op em turno de servidor. Nada ali roda.
//   · `route.ts:315` e `route.ts:1289` — as duas rotas de entrada já barram texto
//     vazio antes de chegar no grafo.
//
// Ou seja: o cenário que o guard dizia impedir não é alcançável, e os dois casos
// "de servidor" que eu havia escrito passavam por vacuidade (`isUserTurn: false`
// → o nó nem executa). Guard e casos foram REMOVIDOS. Teste que não pode falhar
// dá falsa segurança, que é pior que cobertura ausente — ausência a gente vê.
//
// O que sobra aqui é o que tem valor de verdade: provar que a recusa rotulada
// fecha a porta.
//
// O `PENDENTE-KAIRO` que este arquivo carregava foi RESOLVIDO em 2026-07-30. Ele
// era: acolhimento vago ("hmm") sobre uma oferta ancorada, com o funil todo
// respondido, gravava `escolha` por `origem: "criterio"` e liberava o formulário
// de contratação — comportamento pré-existente, e decisão de venda, não de
// código. O Kairo decidiu pelo caminho mais seguro: `escolha` só nasce de ação
// estruturada (FIX-400), e a origem `criterio` deixou de existir junto com a
// `afirmacao`. "hmm" agora recebe o card de decisão.
import { afterAll, describe, expect, it } from "vitest";
import { buscaDoMock } from "./testing/grupos-do-mock";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** Funil COMPLETO: nada a perguntar, oferta ancorada. É o único estado em que a
 * porta `criterio` pode disparar — e por isso o único que importa testar. */
const NADA_A_PERGUNTAR = {
	desireAsked: true,
	identityCollected: true,
	currentCategory: "imovel" as const,
	searchDispatched: true,
	revealCompleted: true,
	experiencePrev: "returning" as const,
	recoConsentAnswered: true,
	simulatorOfferDispatched: true,
	qualifyAnswers: {
		creditMax: 700_000,
		prazoMeses: 12,
		hasLance: "yes" as const,
		lanceValue: 200_000,
		lanceEmbutido: false,
	},
	recommendedOffer: {
		administradora: "Itaú",
		creditValue: 721_000,
		termMonths: 221,
		monthlyPayment: 4_430.98,
	},
};

describeIfDb("FIX-397 — recusa fecha a porta `criterio`; 'hmm' fica documentado", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it.each(["prefiro usar só o meu dinheiro", "de jeito nenhum", "achei caro"])(
		"recusa rotulada `declines` não ancora escolha por nenhuma porta: %s",
		async (fala) => {
			// Fecha o buraco que a 1ª revisão nomeou como P0: recusa SEM a palavra
			// "não". Com o rótulo `declines` (FIX-396) ela é negativa determinística,
			// e `detectYesNoText` devolve `false` → `recusouNesteTurno`.
			const r = await runScenario({
				busca: buscaDoMock(96),
				metaInicial: NADA_A_PERGUNTAR,
				turns: [{ user: fala, intent: "declines", beats: [{ text: "Entendido." }] }],
			});
			criadas.push(r.conversationId);
			expect(r.meta.escolha, fala).toBeUndefined();
		},
	);

	it("acolhimento vago não ancora mais nada — o PENDENTE-KAIRO foi resolvido", async () => {
		// Este caso existia pra DOCUMENTAR um comportamento pré-existente que era
		// decisão de produto: "hmm", com o funil todo respondido, gravava `escolha`
		// por `origem: "criterio"` e liberava o formulário de contratação.
		//
		// O Kairo decidiu (2026-07-30): `escolha` só por ação estruturada. A origem
		// `criterio` foi removida junto com `afirmacao` (FIX-400), então o pendente
		// deixou de existir — "hmm" agora recebe o card de decisão, que é o que
		// sempre deveria ter acontecido.
		const r = await runScenario({
			busca: buscaDoMock(96),
			metaInicial: NADA_A_PERGUNTAR,
			turns: [{ user: "hmm", beats: [{ text: "Então…" }] }],
		});
		criadas.push(r.conversationId);

		expect(r.meta.escolha).toBeUndefined();
	});
});
