// FIX-400 — `escolha` deixa de ser inferida de TEXTO. Só ação estruturada ancora.
//
// Decisão do Kairo (2026-07-30), depois de CINCO revisões independentes acharem
// CINCO vazamentos diferentes na mesma arquitetura:
//
//   1ª→5ª rodada, sempre a mesma família: um sinal textual usado pra responder
//   UMA pergunta vazava pra ancorar fechamento de contrato. Substring
//   ("quero essa quantia mesmo"), oferta stale (busca vazia não limpa
//   `recommendedOffer`), gate suprimido lido como "nada pendente", ambiguidade
//   léxica ("aceito" no gate do embutido), adversativa criando aceite.
//
//   Cada rodada fechou a porta encontrada; a seguinte achou outra. A 5ª revisão
//   deu 3/10 e cravou: "o espaço de sinal textual que pode vazar é, na prática,
//   infinito" — o mesmo argumento que `yes-no.ts:21` já documenta pro lado
//   negativo, agora valendo pro positivo.
//
// A palavra do Kairo: "escolha e decisionDispatched só via clique no card. Texto
// livre é para conversa, não para comprometer dinheiro."
//
// É a lei-mãe do projeto aplicada onde mais importa: comprometer o cliente com
// uma cota é INVARIANTE VERIFICÁVEL, e invariante verificável vira código — não
// heurística sobre linguagem natural. Conversa segue 100% livre pra todo o
// resto; ela só perde o poder de assinar contrato no lugar do cliente.
//
// O que ANCORA a partir de agora:
//   · clique de card (`select-group`, `interest`, `choose_offer`) — o payload vem
//     do card que o cliente tocou, é dado do servidor, não texto;
//   · `origem: "mencao"` — o cliente NOMEIA uma cota que já foi exibida, e a
//     resolução é contra o conjunto fechado de ofertas mostradas (verificável:
//     ou o nome bate com uma oferta da tela, ou não bate).
//
// O que NÃO ancora mais: `origem: "afirmacao"` e `origem: "criterio"`. As duas
// eram inferência sobre texto livre.
//
// 2026-08-19 (PRD "Destravar o agente", D6) — A PORTA QUE SE ABRIU AO LADO
// DESTA PAREDE, e por que ela não a derruba.
//
// A parede continua de pé: TEXTO LIVRE não assina. O que se descobriu em
// produção é que ela tinha engolido, junto, a porta legítima — o cliente
// respondendo à pergunta de escolha que o PRÓPRIO agente fez, com os atalhos
// que o PRÓPRIO produto ofereceu ("A de prazo mais curto"). Ele cooperava e não
// tinha caminho até o contrato.
//
// A porta nova exige TRÊS fatos simultâneos, e o primeiro é estado do servidor,
// não interpretação de fala: (1) o servidor ofertou uma escolha entre cotas
// específicas no turno anterior (`escolhaOfertada`, coagida por ele mesmo a
// partir dos atalhos), (2) a fala resolve deterministicamente para UMA daquelas
// cotas, (3) é a MESMA que o modelo indicou. Fora disso, o veto é o de sempre.
//
// A prova de que as duas coisas convivem está em `cenario-jornada-rute.test.ts`:
// lá, a mesma frase ancora COM a pergunta de escolha aberta e NÃO ancora sem
// ela.

import { afterAll, describe, expect, it } from "vitest";
import { buscaDoMock } from "./testing/grupos-do-mock";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const COM_OFERTA_ANCORADA = {
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

/** As falas que, ao longo de 5 rodadas de revisão, ancoraram escolha por texto —
 * cada uma foi um P0 numa rodada diferente. Nenhuma pode ancorar agora. */
const FALAS_QUE_JA_VAZARAM = [
	"quero fechar essa", // o "caminho bom" que justificava a inferência
	"bora contratar",
	"pode seguir com a contratação",
	"manda o contrato",
	"aceito",
	"topo essa",
	"é essa que eu quero",
	"quero essa quantia mesmo", // P0-B da 5ª revisão (substring)
	"hmm", // porta `criterio`
	"faz sentido",
];

describeIfDb("FIX-400 — texto livre nunca ancora escolha", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it.each(FALAS_QUE_JA_VAZARAM)("texto não ancora escolha: %s", async (fala) => {
		const r = await runScenario({
			busca: buscaDoMock(96),
			metaInicial: COM_OFERTA_ANCORADA,
			turns: [{ user: fala, intent: "ready_to_proceed", beats: [{ text: "Certo." }] }],
		});
		criadas.push(r.conversationId);
		expect(r.meta.escolha, fala).toBeUndefined();
	});

	it("sem escolha ancorada, o card de DECISÃO aparece — o cliente é perguntado", async () => {
		// A contrapartida de não inferir: o funil passa a PERGUNTAR em vez de
		// assumir. `decisionDispatched` marcado aqui é correto (o card foi
		// exibido), e é justamente o que garante que o cliente decide de fato.
		const r = await runScenario({
			busca: buscaDoMock(96),
			metaInicial: COM_OFERTA_ANCORADA,
			turns: [
				{ user: "quero fechar essa", intent: "ready_to_proceed", beats: [{ text: "Certo." }] },
			],
		});
		criadas.push(r.conversationId);

		expect(r.meta.escolha).toBeUndefined();
		const trilha = r.turns.flatMap((t) => t.trilha);
		expect(trilha.some((t) => t.includes("decision"))).toBe(true);
	});

	it("`mencao` sobrevive como caminho, mas exige a cota EXIBIDA nesta conversa", async () => {
		// A resolução por menção é lookup contra o conjunto FECHADO de ofertas que
		// esta conversa realmente mostrou (`shown-groups`), não contra o catálogo.
		// Num cenário de um turno só, nada foi exibido ainda — então nomear não
		// ancora, e está certo: nomear uma cota que o cliente nunca viu seria
		// exatamente o tipo de inferência que este fix removeu.
		const r = await runScenario({
			busca: buscaDoMock(96),
			metaInicial: COM_OFERTA_ANCORADA,
			turns: [
				{
					user: "bora fechar com o Banco do Brasil",
					intent: "ready_to_proceed",
					beats: [{ text: "Fechado." }],
				},
			],
		});
		criadas.push(r.conversationId);
		expect(r.meta.escolha).toBeUndefined();
	});

	it("o CAMINHO NOVO (atalho de escolha) não afrouxa nada aqui", async () => {
		// PRD 19/08/2026: a porta 2 exige que o SERVIDOR tenha ofertado a escolha
		// no turno anterior. Estas mesmas falas, sem essa oferta no estado,
		// continuam sem ancorar — a parede segue de pé exatamente onde estava.
		const r = await runScenario({
			busca: buscaDoMock(96),
			metaInicial: COM_OFERTA_ANCORADA,
			turns: [
				{
					user: "a de menor parcela",
					intent: "providing_info",
					beats: [{ text: "Certo." }],
				},
			],
		});
		criadas.push(r.conversationId);
		expect(r.meta.escolha).toBeUndefined();
		expect(r.meta.escolhaOfertada).toBeUndefined();
	});

	it("recusa segue sem ancorar (o invariante do FIX-388 não regride)", async () => {
		const r = await runScenario({
			busca: buscaDoMock(96),
			metaInicial: COM_OFERTA_ANCORADA,
			turns: [{ user: "não quero isso", intent: "declines", beats: [{ text: "Entendido." }] }],
		});
		criadas.push(r.conversationId);
		expect(r.meta.escolha).toBeUndefined();
	});
});
