// FIX-388 — recusar uma pergunta não é ESCOLHER a oferta.
//
// Achado em 2026-07-29 pela sonda `pnpm sonda:intent` (FIX-387), rodando o
// analyzer REAL (claude-haiku-4-5 pelo gateway): a fala
//
//   "não, prefiro usar só o meu dinheiro"
//
// respondida à pergunta do agente sobre lance embutido volta classificada como
// `userIntent: "ready_to_proceed"` — o próprio raciocínio do analyzer diz
// "rejeita explicitamente", e ele extrai `hasLance: "no"` corretamente, mas o
// rótulo do intent sai como avanço.
//
// Por que isso é perigoso: `advance.ts:328-345` usa `intent ===
// "ready_to_proceed"` como origem `"afirmacao"` pra ancorar `funnel.escolha` na
// oferta recomendada. Ou seja: o cliente recusou o EMBUTIDO e o funil registra
// que ele ESCOLHEU A COTA. É a mesma classe do FIX-385/386 ("contratar exige um
// SIM, não a ausência de um não"), só que na porta da escolha em vez da do
// contrato.
//
// O invariante: a escolha continua podendo nascer de uma afirmação — mas nunca
// de uma fala cujo texto é uma RECUSA explícita. Classificar fala é do modelo;
// não vender o que foi recusado é do código.
//
// ⚠️ ESCOPO, corrigido em 2026-07-30 depois de revisão independente: este arquivo
// cobre a recusa que traz a palavra "não" no texto — que é o que
// `detectYesNoText` reconhece por si. O título antigo dizia "recusa explícita" e
// prometia uma garantia de CLASSE que o código não dava: "de jeito nenhum",
// "prefiro usar só o meu dinheiro" e "achei caro" passavam reto.
//
// Essa metade foi atacada na causa, não aqui: o enum de `userIntent` ganhou o
// rótulo `declines` (FIX-396), então a recusa sem "não" virou dado determinístico.
// A cobertura dela vive em `yes-no.fix-387.test.ts` (unidade) e em
// `cenario-criterio-sem-fala.fix-397.test.ts` (jornada).
import { afterAll, describe, expect, it } from "vitest";
import { buscaDoMock } from "./testing/grupos-do-mock";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** Cliente com reveal feito e uma oferta recomendada ancorada — o ponto exato
 * em que `advance` decide se a escolha virou fato. */
const COM_OFERTA_ANCORADA = {
	desireAsked: true,
	identityCollected: true,
	currentCategory: "imovel" as const,
	searchDispatched: true,
	revealCompleted: true,
	experiencePrev: "returning" as const,
	// FIX-399b (2026-07-30): a fixture VOLTOU ao estado original. Ela tinha ganhado
	// `simulatorOfferDispatched` e `lanceEmbutido` só pra alcançar o gate
	// `decision`, porque a 1ª versão do FIX-395 exigia isso — e a 2ª revisão
	// independente apontou, com razão, que estreitar a fixture pra manter o verde
	// escondia o bug de fechamento. Com o guard keyado no TEXTO ("pediu pra
	// fechar?") em vez de no gate, o estado natural volta a servir.
	qualifyAnswers: {
		creditMax: 700_000,
		// `prazoMeses` presente de propósito — e foi ele que revelou a SEGUNDA
		// porta. Com o guard só no intent, este cenário passou a cair em
		// `origem: "criterio"` (`criterioJaCapturado` vira true) e a escolha era
		// ancorada de novo. Por isso o guard final barra as duas origens
		// inferidas, não só `afirmacao`.
		prazoMeses: 12,
		hasLance: "yes" as const,
		lanceValue: 200_000,
	},
	recommendedOffer: {
		administradora: "ITAÚ",
		creditValue: 721_000,
		termMonths: 221,
		monthlyPayment: 4_430.98,
	},
};

// ⚠️ Os dois casos POSITIVOS deste arquivo ("afirmação de verdade ancora") foram
// removidos em 2026-07-30 pelo FIX-400: `escolha` deixou de ser inferida de texto,
// então não existe mais "afirmação que ancora". O que este arquivo protege — recusa
// NUNCA ancorar — segue valendo, e agora com margem ainda maior.
describeIfDb("FIX-388 — recusa com 'não' no texto nunca ancora a escolha da cota", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it.each(["não, prefiro usar só o meu dinheiro", "não quero isso", "nao, deixa como estava"])(
		"recusa classificada como avanço NÃO vira escolha: %s",
		async (fala) => {
			const r = await runScenario({
				busca: buscaDoMock(96),
				metaInicial: COM_OFERTA_ANCORADA,
				turns: [
					{
						user: fala,
						// É EXATAMENTE o que o Haiku real devolve pra estas falas — não é um
						// intent artificial escolhido pra fabricar a falha.
						intent: "ready_to_proceed",
						beats: [{ text: "Sem problema." }],
					},
				],
			});
			criadas.push(r.conversationId);

			expect(r.meta.escolha).toBeUndefined();
		},
	);
});
